/**
 * The CYMBAL ENGINE (GROOVE revision 4, Phase 14): CLOSED HAT, OPEN HAT, RIDE and CRASH, each with
 * its own ACTIVITY, on a chosen SUBDIVISION, with a PRIMARY RELATIONSHIP between the hats and the
 * ride and an OPEN/CLOSED relationship inside the hats. Revision 3 breaks keep cymbals.ts.
 *
 * ACTIVITY IS COVERAGE. Each family has a grid (CYMBAL SUBDIVISION: 1/4, 1/8, 1/16, 1/32 or
 * eighth-note TRIPLETS; AUTO chooses one per break from the recipe and the BREAK DNA). Every grid
 * position of a bar is ranked once per break by a score that does not depend on the activity:
 *
 *   score = metric weight (beats > "and"s > sixteenths > 32nds)
 *         + the FIGURE's bonus (a cymbal figure from the recipe's vocabulary, leaned by the DNA:
 *           eighths, off-beats, broken eighths, 3+3+2, skipping sixteenths, linear, triplets …)
 *         + seeded noise (and, with VARIATION, a little more in the answer and development bars)
 *
 * and a bar plays the top round(ACTIVITY × positions) of them (at least one above 0%). So 0% is
 * none, 100% is every position of the grid (the acceptance test: CLOSED HAT 100% on 1/16 is
 * sixteen closed hats in every bar), and a higher activity plays the same strokes and more
 * (monotonic). The development (HOLD, ANSWER, BUILD, THIN) moves a bar's count by a fixed step,
 * never at 0% or 100%.
 *
 * PRIMARY RELATIONSHIP (hats and ride; the family with the higher activity is primary, the hats
 * on a tie):
 *   INDEPENDENT   each family on its own ranking; both play wherever their activity says
 *   LAYER         both on the primary's ranking: where both play they double (the ride softer)
 *   ALTERNATE     they trade bars: the secondary takes the development bars, the second half,
 *                 the fills or the answers (a one-bar break: the second half of the bar)
 *   EXCLUSIVE     never together: the primary plays first; the secondary only where it does not
 *   CALL & RESPONSE  the primary takes the first half of each bar, the secondary the second
 *                 (swapped in the answer and development bars)
 *   ACCENT        the primary keeps the time; the secondary marks the accents (the kicks, the
 *                 backbeats, the downbeat and the end of the phrase)
 * Activity is coverage of the positions the relationship gives a family, so in ALTERNATE and
 * CALL & RESPONSE 100% fills its own bars or halves, and in EXCLUSIVE a secondary at 100% gets
 * only the free positions (THIS BREAK says so).
 *
 * OPEN HAT is its own activity: of the open-hat positions (the "and"s; with 1/16 or 1/32 the "a"s
 * too; the beats on 1/4; the last partial on TRIPLETS) over the whole phrase, ranked by the
 * recipe's and the DNA's open-hat places and the phrase position, it plays round(OPEN × all).
 * OPEN/CLOSED: ACCENT (the open replaces that closed stroke), ALTERNATE (it rings to the next beat,
 * no closed hats under it), LAYER (on top of the closed stroke), INDEPENDENT (its own ranking over
 * every position). OPEN-HAT CHOKE (default on): the next closed hat cuts it, live and rendered
 * alike (timeline.ts hatChoke); off, the closed hats are marked `free` and it rings.
 *
 * CRASH is not a grid: it marks phrase accents. Candidates: the top of the phrase, the bar after a
 * half-way fill, a development bar, the other downbeats, the DNA's crash places, the fills' crashes
 * and pushed kicks into the loop point. It plays round(CRASH × candidates), at most two per bar.
 * A crash takes the timekeeper's stroke under it unless that family is at 100%.
 *
 * Fills that take the hands silence the timekeeping (unless the family is at 100%); 0% means none
 * of that family after every later layer (generate.ts silence); 100% is restored after the
 * personality and the toms and rolls (generate.ts). BREAK DNA leans the subdivision, the figure,
 * the open-hat and the crash places; it never sets how many strokes there are. Every draw comes
 * from the DETAIL seed, from its own named stream, so the same recipe and seeds give the same
 * cymbals and changing one activity does not reshuffle another family.
 */
import { CYMBAL_LABEL, pickWeighted, GROOVE_DEFS, type CymbalId, type GrooveId } from './approaches';
import type { grammarCymbals, GridLean } from './dnaGrammar';
import { posName } from './meter';
import { stream, type Rng } from './rng';
import { VOCAB, type AccentCycle, type StyleDef } from './styles';
import { timeLevel } from './support';
import { clamp, STEPS, TPS, type BarRole, type BreakEvent, type Category, type Hit, type Mutation, type Recipe, type Style } from './types';
import type { FillMark } from './cymbals';

export const SUBDIVISIONS = ['auto', '4', '8', '16', '32', 't'] as const;
export type Subdivision = (typeof SUBDIVISIONS)[number];
export type Grid = Exclude<Subdivision, 'auto'>;
export const GRIDS: Grid[] = ['4', '8', '16', '32', 't'];
export const SUB_LABEL: Record<Subdivision, string> = { auto: 'AUTO', 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32', t: 'TRIPLET' };
/** Grid ticks (TPS = 12 per sixteenth) between positions. TRIPLET = eighth-note triplets, 12 per bar. */
export const SUB_TICKS: Record<Grid, number> = { 4: 48, 8: 24, 16: 12, 32: 6, t: 16 };
const GRID_NAME: Record<Grid, string> = { 4: 'quarters', 8: 'eighths', 16: 'sixteenths', 32: '32nds', t: 'eighth-note triplets' };

export const PRIMARY_RELS = ['accent', 'independent', 'alternate', 'layer', 'exclusive', 'call'] as const;
export type PrimaryRel = (typeof PRIMARY_RELS)[number];
export const PRIMARY_REL_LABEL: Record<PrimaryRel, string> = { accent: 'ACCENT', independent: 'INDEPENDENT', alternate: 'ALTERNATE', layer: 'LAYER', exclusive: 'EXCLUSIVE', call: 'CALL & RESP' };
export const PRIMARY_REL_TIP: Record<PrimaryRel, string> = {
  accent: 'ACCENT (default): the busier family keeps the time; the other marks the accents: the kicks, the backbeats, the downbeat and the end of the phrase.',
  independent: 'INDEPENDENT: the hats and the ride each follow their own figure and activity, uncoordinated.',
  alternate: 'ALTERNATE: they trade bars. The secondary takes the development bars, the second half of the phrase, the fills or the answers.',
  layer: 'LAYER: both play on the same ranking, so where both play they double (the secondary softer).',
  exclusive: 'EXCLUSIVE: never at the same time. The primary plays first; the secondary only where the primary does not.',
  call: 'CALL & RESPONSE: the primary takes the first half of each bar, the secondary answers in the second (swapped in the answer and development bars).',
};
export const HAT_RELS = ['accent', 'alternate', 'layer', 'independent'] as const;
export type HatRel = (typeof HAT_RELS)[number];
export const HAT_REL_LABEL: Record<HatRel, string> = { accent: 'ACCENT', alternate: 'ALTERNATE', layer: 'LAYER', independent: 'INDEPENDENT' };
export const HAT_REL_TIP: Record<HatRel, string> = {
  accent: 'ACCENT (default): an open hat replaces the closed stroke on its position.',
  alternate: 'ALTERNATE: an open hat rings to the next beat, with no closed hats under it.',
  layer: 'LAYER: an open hat sounds on top of the closed stroke.',
  independent: 'INDEPENDENT: the open hats follow their own ranking over every position of the grid, closed strokes kept.',
};

export interface CymbalSettings {
  /** CLOSED HAT ACTIVITY 0..1 */
  closed: number;
  /** OPEN HAT ACTIVITY 0..1 */
  open: number;
  /** RIDE ACTIVITY 0..1 */
  ride: number;
  /** CRASH ACTIVITY 0..1 */
  crash: number;
  sub: Subdivision;
  rel: PrimaryRel;
  hatRel: HatRel;
  /** OPEN-HAT CHOKE: a closed hat cuts a ringing open hat */
  choke: boolean;
}

interface CymDefault {
  closed: number;
  open: number;
  ride: number;
  crash: number;
  /** AUTO's subdivision weights for the hats and for the ride */
  hatGrid: GridLean;
  rideGrid: GridLean;
}

// prettier-ignore
/** Each recipe's cymbal defaults and AUTO subdivision weights (design choices, docs/break-dna-research.md ▸ cymbals). */
export const CYM_DEFAULTS: Record<Style, CymDefault> = {
  funk:      { closed: 0.8,  open: 0.15, ride: 0,    crash: 0.3,  hatGrid: { 16: 2, 8: 1.5 },              rideGrid: { 8: 2, 4: 1 } },
  hiphop:    { closed: 0.7,  open: 0.1,  ride: 0,    crash: 0.2,  hatGrid: { 8: 3, 16: 0.6, t: 0.4 },      rideGrid: { 8: 2, 4: 1, t: 0.5 } },
  jungle:    { closed: 0.7,  open: 0.15, ride: 0.25, crash: 0.4,  hatGrid: { 16: 1.5, 8: 2 },              rideGrid: { 8: 1.5, 4: 1 } },
  broken:    { closed: 0.6,  open: 0.2,  ride: 0.15, crash: 0.25, hatGrid: { 16: 2, 8: 1 },                rideGrid: { 8: 1.5, 16: 0.5 } },
  boombap:   { closed: 0.75, open: 0.1,  ride: 0,    crash: 0.15, hatGrid: { 8: 3.5, 16: 0.3, t: 0.3 },    rideGrid: { 8: 2, 4: 1 } },
  hardcore:  { closed: 0.8,  open: 0.3,  ride: 0.1,  crash: 0.45, hatGrid: { 8: 2, 16: 1.5 },              rideGrid: { 8: 1.5, 4: 1 } },
  dnb:       { closed: 0.7,  open: 0.2,  ride: 0.25, crash: 0.4,  hatGrid: { 8: 2, 16: 1.5 },              rideGrid: { 8: 1, 4: 1.5 } },
  halftime:  { closed: 0.65, open: 0.1,  ride: 0.1,  crash: 0.3,  hatGrid: { 16: 1.5, 8: 1.5, t: 0.6, 32: 0.3 }, rideGrid: { 8: 1, 4: 1.5 } },
  garage:    { closed: 0.75, open: 0.3,  ride: 0,    crash: 0.2,  hatGrid: { 16: 2, t: 1.2, 8: 0.8 },      rideGrid: { 8: 1, 4: 1 } },
  electro:   { closed: 0.8,  open: 0.15, ride: 0,    crash: 0.15, hatGrid: { 16: 2.5, 8: 1.5 },            rideGrid: { 8: 1, 4: 1 } },
  breakcore: { closed: 0.6,  open: 0.15, ride: 0.2,  crash: 0.5,  hatGrid: { 16: 2, 32: 1, 8: 0.8 },       rideGrid: { 8: 1, 16: 1 } },
};

export const defaultCym = (style: Style): CymbalSettings => {
  const d = CYM_DEFAULTS[style] ?? CYM_DEFAULTS.funk;
  return { closed: d.closed, open: d.open, ride: d.ride, crash: d.crash, sub: 'auto', rel: 'accent', hatRel: 'accent', choke: true };
};

const unit = (x: unknown, d: number) => (x !== undefined && x !== null && Number.isFinite(Number(x)) ? clamp(Number(x), 0, 1) : d);

/** Stored cymbal settings made safe (anything missing takes the recipe's default). */
export function sanitiseCym(v: unknown, style: Style): CymbalSettings | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<CymbalSettings>;
  const d = defaultCym(style);
  return {
    closed: unit(o.closed, d.closed),
    open: unit(o.open, d.open),
    ride: unit(o.ride, d.ride),
    crash: unit(o.crash, d.crash),
    sub: (SUBDIVISIONS as readonly string[]).includes(String(o.sub)) ? o.sub! : 'auto',
    rel: (PRIMARY_RELS as readonly string[]).includes(String(o.rel)) ? o.rel! : 'accent',
    hatRel: (HAT_RELS as readonly string[]).includes(String(o.hatRel)) ? o.hatRel! : 'accent',
    choke: o.choke !== false,
  };
}

/** A recipe's cymbal settings (its own, or its style's defaults). */
export const cymSettings = (r: Recipe): CymbalSettings => (r.cym ? { ...defaultCym(r.style), ...r.cym } : defaultCym(r.style));

/**
 * Revision 3 cymbal settings brought to revision 4 (a recipe re-baked with the current
 * generator). Only what was set by hand carries over; the rest takes revision 4's defaults:
 * HI-HAT ACTIVITY becomes CLOSED HAT ACTIVITY (0% also means no open hats), RIDE ACTIVITY stays,
 * ALTERNATE (revision 3's default) becomes ACCENT, LAYER and INDEPENDENT stay.
 */
export function migrateCym(r: Recipe): CymbalSettings {
  const d = defaultCym(r.style);
  const hats = r.hats ?? null;
  return {
    ...d,
    ...(hats !== null ? { closed: clamp(hats, 0, 1), open: hats <= 0 ? 0 : d.open } : {}),
    ...(r.ride !== undefined ? { ride: clamp(r.ride, 0, 1) } : {}),
    rel: r.cymbals === 'layer' ? 'layer' : r.cymbals === 'independent' ? 'independent' : 'accent',
  };
}

// ------------------------------------------------------------------ the engine

type Family = 'hat' | 'ride';
type Dev = 'hold' | 'answer' | 'build' | 'thin';
const DEV_LABEL: Record<Dev, string> = { hold: 'held through the phrase', answer: 'varied in the answer bars', build: 'building into the turnaround', thin: 'thinning before the fill' };
const HANDS = ['run', 'stutter', 'roll', 'drop'];
const BAR_TICKS = STEPS * TPS;

export const gridTicks = (g: Grid): number[] => Array.from({ length: BAR_TICKS / SUB_TICKS[g] }, (_, i) => i * SUB_TICKS[g]);

/** Metric weight of a position: the downbeat, the beats, the "and"s, the sixteenths, the 32nds. */
function metric(t: number, g: Grid): number {
  if (t % 48 === 0) return t === 0 ? 1.1 : 1;
  if (g === 't') return t % 48 === 32 ? 0.7 : 0.45;
  if (t % 24 === 0) return 0.75;
  if (t % 12 === 0) return t % 48 === 36 ? 0.47 : 0.43;
  return 0.2;
}

const GALLOPS: number[][] = [[0, 2, 3], [0, 1, 3], [0, 1, 2], [0, 3]];
const TRESILLOS: number[][] = [[0, 3, 6, 8, 11, 14], [0, 3, 6, 9, 12, 14], [0, 3, 6, 10, 12], [2, 5, 8, 10, 13], [0, 3, 8, 11]];

interface Figure {
  id: CymbalId;
  cells: number[];
  kind: number;
  bursts: number[];
}

function chooseFigure(rng: Rng, f: Family, def: StyleDef, groove: GrooveId, lean: Partial<Record<CymbalId, number>>): Figure {
  const v = VOCAB[def.style];
  const vocab = f === 'hat' ? v.hatVocab : v.rideVocab;
  const gl = GROOVE_DEFS[groove].cymbals ?? {};
  const w: Partial<Record<CymbalId, number>> = {};
  for (const [id, x] of Object.entries(vocab) as [CymbalId, number][]) {
    if (id === 'none' || !x) continue;
    w[id] = x * (gl[id] ?? 1) * (lean[id] ?? 1);
  }
  for (const [id, x] of Object.entries(lean) as [CymbalId, number][]) if (!(id in w) && x > 1) w[id] = 0.3 * x;
  const id = pickWeighted(rng, Object.keys(w) as CymbalId[], w);
  const fig: Figure = { id, cells: [], kind: 0, bursts: [] };
  if (id === 'broken') fig.cells = [rng.pick([4, 12, 6, 10]), ...(rng.chance(0.4) ? [rng.pick([2, 14])] : [])];
  else if (id === 'tresillo') fig.cells = TRESILLOS[rng.int(TRESILLOS.length)]!;
  else if (id === 'punctuate') fig.cells = [0, 6, 10, 14, 2, 8].filter(() => rng.chance(0.5));
  else if (id === 'gallop') fig.kind = rng.weighted([1, 0.8, 0.5, 0.3]);
  else if (id === 'triplet') fig.kind = rng.weighted([1, 1]); // full, shuffle
  else if (id === 'rapid') fig.bursts = rng.chance(0.4) ? [1, 3] : [rng.chance(0.65) ? 3 : 1];
  return fig;
}

/** The figure's bonus at a position (0..1). */
function figureBonus(fig: Figure, t: number, kicks: Set<number>, snares: Set<number>): number {
  const s = t / TPS;
  const whole = Number.isInteger(s);
  switch (fig.id) {
    case 'quarters':
      return t % 48 === 0 ? 1 : 0;
    case 'offbeats':
      return t % 48 === 24 ? 1 : 0;
    case 'eighths':
      return t % 24 === 0 ? 1 : 0;
    case 'broken':
      return t % 24 === 0 && !fig.cells.includes(s) ? 1 : 0;
    case 'tresillo':
    case 'punctuate':
      return whole && fig.cells.includes(s) ? 1 : 0;
    case 'gallop':
      return whole && GALLOPS[fig.kind]!.includes(s % 4) ? 1 : 0;
    case 'sixteenths':
      return t % 12 === 0 ? 1 : 0;
    case 'rapid':
      return t % 12 === 0 || fig.bursts.includes(Math.floor(t / 48)) ? 1 : 0;
    case 'linear':
      return whole && !kicks.has(s) && !snares.has(s) ? 1 : 0;
    case 'triplet':
      return t % 16 === 0 && (fig.kind === 0 || t % 48 !== 16) ? 1 : 0;
    case 'spang':
      return t % 48 === 0 || t === 36 || t === 132 || t === 32 || t === 128 ? 1 : 0;
    default:
      return 0;
  }
}

export interface CymbalReport {
  grid: { hat: Grid; ride: Grid };
  auto: boolean;
  figure: { hat: CymbalId; ride: CymbalId };
  primary: Family | null;
  rel: PrimaryRel;
  hatRel: HatRel;
  development: Dev;
  /** what each activity asked for and what the engine placed: [given, asked] */
  counts: { closed: [number, number]; open: [number, number]; ride: [number, number]; crash: [number, number] };
  notes: string[];
}

export interface Cym4Context {
  def: StyleDef;
  recipe: Recipe;
  groove: GrooveId;
  roles: BarRole[];
  marks: (FillMark | null)[];
  cycle: AccentCycle;
  mutations: Mutation[][];
  detailSeed: number;
  /** the BREAK DNA's leans (dnaGrammar.ts grammarCymbals), when there is one */
  dna?: ReturnType<typeof grammarCymbals>;
  /** what the cymbals follow per bar (kicks, snares, backbeats), when not the bar itself: a SELECTED TRACKS mutation leaves the cymbals as the phrase before it had them */
  context?: Hit[][];
  /** applies a detail mutation to a bar's cymbals (cymbals.ts) */
  mutate?: (hits: Hit[], rng: Rng, cats: Category[]) => Hit[];
}

export interface Cym4Result {
  bars: Hit[][];
  timekeeper: Family;
  hats: string;
  ride: string;
  development: string;
  report: CymbalReport;
  /** the strokes of each family at 100% (restored after later layers, generate.ts) */
  full: Hit[][];
}

const T = (t: number) => ({ step: Math.floor(t / TPS), sub: t % TPS });
const tickOf = (h: Pick<Hit, 'step' | 'sub'>) => h.step * TPS + h.sub;

/** The cymbals of every bar of the phrase (revision 4). `bars` must hold no hat, open, ride or crash. */
export function addCymbals4(bars: Hit[][], ctx: Cym4Context): Cym4Result {
  const { def, recipe, roles } = ctx;
  const cs = cymSettings(recipe);
  const S = (name: string) => stream(ctx.detailSeed, `cym4:${name}`);
  const n = roles.length;
  const gr = GROOVE_DEFS[ctx.groove];
  const notes: string[] = [];
  const A: Record<Family, number> = { hat: cs.closed, ride: cs.ride };

  // ---- the grids (AUTO: from the recipe and the DNA, never from the activity)
  const d = CYM_DEFAULTS[def.style];
  const pickGrid = (base: GridLean, rng: Rng): Grid => {
    const w: Partial<Record<Grid, number>> = {};
    for (const g of GRIDS) {
      let x = base[g] ?? 0;
      x *= ctx.dna?.grid[g] ?? 1;
      if (gr.triplet) x *= g === 't' ? 4 : g === '16' || g === '32' ? 0.3 : 1;
      if (g === 't' && !x && gr.triplet) x = 2;
      if (x > 0) w[g] = x;
    }
    return pickWeighted(rng, GRIDS, w);
  };
  const gridRng = S('grid');
  const auto = cs.sub === 'auto';
  const grid: Record<Family, Grid> = auto ? { hat: pickGrid(d.hatGrid, gridRng), ride: pickGrid(d.rideGrid, gridRng) } : { hat: cs.sub as Grid, ride: cs.sub as Grid };

  // ---- the figures and the rankings
  const figure: Record<Family, Figure> = {
    hat: chooseFigure(S('fig:hat'), 'hat', def, ctx.groove, ctx.dna?.figure ?? {}),
    ride: chooseFigure(S('fig:ride'), 'ride', def, ctx.groove, {}),
  };
  const noise = (f: Family) => {
    const r = S(`rank:${f}`);
    return new Map(gridTicks(grid[f]).map((t) => [t, r.next()]));
  };
  const base: Record<Family, Map<number, number>> = { hat: noise('hat'), ride: noise('ride') };
  const v = recipe.variation;
  const barNoise = new Map<string, Map<number, number>>();
  const roleNoise = (f: Family, r: BarRole) => {
    const k = `${f}|${r}`;
    if (!barNoise.has(k)) {
      const rng = S(`bar:${k}`);
      barNoise.set(k, new Map(gridTicks(grid[f]).map((t) => [t, rng.next()])));
    }
    return barNoise.get(k)!;
  };

  // ---- the development (VARIATION 0 holds)
  const vv = clamp(3 * v, 0, 1);
  const loopy = def.loop && v < 0.5;
  const dev: Dev = n === 1 ? 'hold' : (['hold', 'answer', 'build', 'thin'] as const)[Math.max(0, S('dev').weighted([1.2 * (1 - v) + 0.2 + (loopy ? 1 : 0), loopy ? 0 : (0.6 + 0.4 * v) * vv, (0.3 + 0.6 * v) * vv, (0.2 + 0.4 * v) * vv]))]!;
  const delta = (r: BarRole, N: number): number => {
    const step = Math.max(1, Math.ceil(0.15 * N));
    if (dev === 'build' && (r === 'B' || r === 'T')) return step;
    if (dev === 'thin' && (r === 'T' || r === 'F')) return -step;
    return 0;
  };
  const varied = (r: BarRole) => r !== 'A' && dev === 'answer';

  // ---- the relationship
  const both = A.hat > 0 && A.ride > 0;
  const primary: Family | null = A.hat <= 0 && A.ride <= 0 ? null : A.hat >= A.ride ? 'hat' : 'ride';
  const secondary: Family | null = primary === 'hat' ? 'ride' : primary === 'ride' ? 'hat' : null;
  const rel = cs.rel;
  let secBars = new Set<number>();
  if (both && rel === 'alternate') {
    if (n === 1) secBars = new Set();
    else {
      const plan = S('alt').weighted([roles.includes('B') ? 1 : 0, 1, roles.some((r) => r === 'T' || r === 'F') ? 0.6 : 0, roles.includes('A2') ? 0.6 : 0]);
      roles.forEach((r, i) => {
        if ((plan === 0 && r === 'B') || (plan === 1 && i >= Math.ceil(n / 2)) || (plan === 2 && (r === 'T' || r === 'F')) || (plan === 3 && r === 'A2')) secBars.add(i);
      });
      if (!secBars.size) secBars.add(n - 1);
    }
  }
  const swapped = (r: BarRole) => r === 'A2' || r === 'B' || r === 'T';
  /** may family f play at tick t of bar i (before EXCLUSIVE and ACCENT, which depend on the primary's strokes) */
  const region = (f: Family, i: number, t: number): boolean => {
    if (!both || f === primary) {
      if (!both) return true;
      if (rel === 'alternate') return n === 1 ? t < BAR_TICKS / 2 : !secBars.has(i);
      if (rel === 'call') return swapped(roles[i]!) ? t >= BAR_TICKS / 2 : t < BAR_TICKS / 2;
      return true;
    }
    if (rel === 'alternate') return n === 1 ? t >= BAR_TICKS / 2 : secBars.has(i);
    if (rel === 'call') return swapped(roles[i]!) ? t < BAR_TICKS / 2 : t >= BAR_TICKS / 2;
    return true;
  };

  const asked = { closed: 0, open: 0, ride: 0, crash: 0 };
  const level = (f: Family, t: number, c: { backbeats: number[] }, layered: boolean): number => {
    const g = grid[f];
    let lv = t % TPS !== 0 ? 0.4 : g === 't' && t % 48 !== 0 ? (t % 48 === 32 ? 0.56 : 0.42) : timeLevel(t / TPS, g === '16' || g === '32', ctx.cycle, c.backbeats);
    if (f === 'ride') lv *= 0.92;
    if (layered) lv *= 0.85;
    return clamp(lv, 0.2, 1);
  };

  const famWhy = (f: Family) => `${f === 'hat' ? 'closed hat' : 'ride'}: ${CYMBAL_LABEL[figure[f].id].toLowerCase()} figure on the ${GRID_NAME[grid[f]]} (${f === 'hat' ? 'CLOSED HAT' : 'RIDE'} ${Math.round(A[f] * 100)}%)`;
  const relWhy = (f: Family) => (both && f === secondary ? `, ${PRIMARY_REL_LABEL[rel]} with the ${primary === 'hat' ? 'hats' : 'ride'}` : '');

  // ---- per bar: closed hats and ride
  const ctxOf = (hits: Hit[]) => ({
    kicks: new Set(hits.filter((h) => h.cat === 'kick' && h.sub === 0).map((h) => h.step)),
    snares: new Set(hits.filter((h) => h.cat === 'snare' && h.sub === 0).map((h) => h.step)),
    backbeats: hits.filter((h) => h.cat === 'snare' && (h.role === 'backbeat' || h.role === 'displaced backbeat')).map((h) => h.step),
  });
  const cym: Hit[][] = bars.map(() => []);
  const order: Family[] = primary === 'ride' ? ['ride', 'hat'] : ['hat', 'ride'];
  const follow = (i: number) => ctx.context?.[i] ?? bars[i]!;
  bars.forEach((_, i) => {
    const r = roles[i]!;
    const c = ctxOf(follow(i));
    const played = new Map<Family, Set<number>>();
    for (const f of order) {
      const a = A[f];
      if (a <= 0) continue;
      const g = grid[f];
      const ranking = f === secondary && rel === 'layer' && grid.hat === grid.ride ? primary! : f;
      const score = (t: number) => {
        let s = metric(t, g) + 1.1 * figureBonus(figure[ranking], t, c.kicks, c.snares) + 0.45 * (base[ranking].get(t) ?? 0);
        if (varied(r)) s += 0.5 * v * (roleNoise(ranking, r).get(t) ?? 0);
        return s;
      };
      let allowed = gridTicks(g).filter((t) => region(f, i, t));
      if (both && f === secondary && rel === 'exclusive') {
        const p = played.get(primary!) ?? new Set();
        allowed = allowed.filter((t) => !p.has(t));
      }
      let chosen: number[];
      if (both && f === secondary && rel === 'accent') {
        // the accents: the downbeat, the backbeats, the kicks (on this family's grid) and the end of the phrase
        const sn = (t: number) => t - (t % SUB_TICKS[g]);
        const w = new Map<number, number>();
        const add = (t: number, x: number) => w.set(sn(t), Math.max(w.get(sn(t)) ?? 0, x));
        add(0, 0.9);
        for (const b of c.backbeats) add(b * TPS, 1);
        for (const k of c.kicks) add(k * TPS, k % 4 === 0 ? 0.75 : 0.65);
        if (i === n - 1) add(BAR_TICKS - SUB_TICKS[g], 0.6);
        const cands = [...w.keys()].filter((t) => allowed.includes(t));
        const k = a >= 1 ? cands.length : Math.max(1, Math.round(a * cands.length));
        asked.ride += f === 'ride' ? k : 0;
        asked.closed += f === 'hat' ? k : 0;
        chosen = cands.sort((x, y) => w.get(y)! + 0.3 * (base[f].get(y) ?? 0) - (w.get(x)! + 0.3 * (base[f].get(x) ?? 0)) || x - y).slice(0, k);
      } else {
        const N = gridTicks(g).filter((t) => region(f, i, t)).length;
        const want = a >= 1 ? N : clamp(Math.round(a * N) + delta(r, N), 1, N);
        if (f === 'ride') asked.ride += want;
        else asked.closed += want;
        if (want > allowed.length) notes.push(`${PRIMARY_REL_LABEL[rel]}: the ${f === 'hat' ? 'closed hats' : 'ride'} asked for ${want} strokes in bar ${i + 1} and had ${allowed.length} free positions`);
        chosen = [...allowed].sort((x, y) => score(y) - score(x) || x - y).slice(0, want);
      }
      played.set(f, new Set(chosen));
      const layered = both && f === secondary && rel === 'layer';
      for (const t of chosen.sort((x, y) => x - y)) cym[i]!.push({ cat: f, ...T(t), level: level(f, t, c, layered), role: 'time', why: `${famWhy(f)}${relWhy(f)}` });
    }
  });

  // ---- open hats: per bar, the open-hat positions ranked (equal bars of a programmed loop rank alike)
  const O = cs.open;
  const hatGrid = grid.hat;
  const openPos = (t: number): boolean => {
    if (cs.hatRel === 'independent') return true;
    if (hatGrid === '4') return true;
    if (hatGrid === 't') return t % 48 === 32;
    if (hatGrid === '8') return t % 48 === 24;
    return t % 48 === 24 || t % 48 === 36;
  };
  // (VARIATION 0 and FILLS 0: every bar is the groove, the last one too)
  const fillBar = (i: number) => (v > 0 || recipe.fills > 0) && (roles[i] === 'T' || roles[i] === 'F' || (i === n - 1 && n > 1));
  /** the noise class of a bar: a programmed loop's groove bars are all one class */
  const klass = (i: number) => (fillBar(i) ? `${roles[i]}${i === n - 1 ? '$' : ''}` : loopy || dev !== 'answer' ? 'A' : roles[i]!);
  const openNoise = new Map<string, { pos: Map<number, number>; frac: number }>();
  const noiseOf = (k: string) => {
    if (!openNoise.has(k)) {
      const rng = S(`open:${k}`);
      openNoise.set(k, { frac: rng.next(), pos: new Map(gridTicks(hatGrid).map((t) => [t, rng.next()])) });
    }
    return openNoise.get(k)!;
  };
  bars.forEach((_, i) => {
    if (O <= 0) return;
    const k = klass(i);
    const nz = noiseOf(k);
    const cands = gridTicks(hatGrid).filter((t) => openPos(t) && (!both || region('hat', i, t)));
    const score = (t: number) => {
      const step = t / TPS;
      let s = 0.6 * nz.pos.get(t)! + (Number.isInteger(step) ? (def.openSteps[step] ?? 0) * 0.8 : 0) + (ctx.dna?.open[i]?.includes(step) ? 1.5 : 0);
      if (t % 48 === 24) s += 0.2;
      return s;
    };
    // round(OPEN × positions) on average: the fraction is decided per bar class (a fill bar is likelier to get it)
    const x = O * cands.length;
    const want = O >= 1 ? cands.length : clamp(Math.floor(x - nz.frac * (fillBar(i) ? 0.5 : 1)) + 1, 0, cands.length);
    asked.open += want;
    const bar = cym[i]!;
    for (const t of [...cands].sort((a, b) => score(b) - score(a) || a - b).slice(0, want).sort((a, b) => a - b)) {
      if (cs.hatRel === 'accent') bar.splice(0, bar.length, ...bar.filter((h) => !(h.cat === 'hat' && tickOf(h) === t)));
      else if (cs.hatRel === 'alternate') {
        const next = t - (t % 48) + 48;
        bar.splice(0, bar.length, ...bar.filter((h) => !(h.cat === 'hat' && tickOf(h) >= t && tickOf(h) < next)));
      }
      bar.push({ cat: 'open', ...T(t), level: ctx.dna?.open[i]?.includes(t / TPS) ? 0.76 : 0.72, role: 'lift', why: `open hat on ${posName(Math.floor(t / TPS))} (OPEN HAT ${Math.round(O * 100)}%, ${HAT_REL_LABEL[cs.hatRel]}${cs.choke ? ', choked by the next closed hat' : ', ringing: OPEN-HAT CHOKE off'})` });
    }
  });

  // ---- crashes: phrase accents. Each candidate has its own threshold (from its weight and the bar's
  // noise), so a higher CRASH plays the same crashes and more, and one bar's candidates never move another's
  const C = cs.crash;
  const crng = S('crash');
  let placed = 0;
  bars.forEach((_, i) => {
    const hits = follow(i);
    const r = roles[i]!;
    const noiseC = crng.next();
    const cc: { t: number; s: number; why: string }[] = [];
    const add = (t: number, w: number, why: string) => {
      const ex = cc.find((x) => x.t === t);
      if (ex) ex.s = Math.max(ex.s, w);
      else cc.push({ t, s: w, why });
    };
    if (i === 0) add(0, 1, 'the top of the phrase');
    else if (roles[i - 1] === 'F') add(0, 0.9, 'a new section after the half-way fill');
    else if (r === 'B') add(0, 0.7, 'the development bar');
    else add(0, i % 4 === 0 ? 0.45 : 0.35, 'a downbeat');
    for (const s of ctx.dna?.crash[i] ?? []) add(s * TPS, 0.85, 'the BREAK DNA’s crash');
    for (const h of hits) if (h.cat === 'kick' && h.sub === 0 && h.step === 14 && i === n - 1) add(h.step * TPS, 0.5, 'a pushed kick into the loop point');
    for (const h of hits) if (h.cat === 'kick' && h.sub === 0 && (h.step === 10 || h.step === 6) && h.role === 'syncopated kick') add(h.step * TPS, 0.25, 'a syncopated kick');
    const m = ctx.marks[i];
    if (m && m.kind !== 'burst' && i === n - 1) add(12 * TPS, 0.3, 'the fill');
    const bar = cym[i]!;
    const at: number[] = [];
    for (const x of cc.map((x) => ({ ...x, s: x.s + 0.25 * noiseC * (x.t ? 1 : 0.5) })).sort((a, b) => b.s - a.s || a.t - b.t)) {
      const threshold = clamp(1 - x.s / 1.35, 0, 0.999);
      if (C <= 0 || (C < 1 && C <= threshold)) continue;
      asked.crash++;
      if (at.length >= 2 || at.some((t) => Math.abs(t - x.t) < 4 * TPS)) continue;
      at.push(x.t);
      placed++;
      // the crash takes the timekeeping stroke under it (not a family at 100%)
      bar.splice(0, bar.length, ...bar.filter((h) => !(tickOf(h) === x.t && ((h.cat === 'hat' && A.hat < 1) || (h.cat === 'ride' && A.ride < 1) || (h.cat === 'open' && O < 1)))));
      bar.push({ cat: 'crash', ...T(x.t), level: i === 0 && x.t === 0 ? 0.9 : 0.85, role: 'crash', why: `crash: ${x.why} (CRASH ${Math.round(C * 100)}%)` });
    }
  });
  if (C > 0 && asked.crash > placed) notes.push(`CRASH: ${placed} of ${asked.crash} placed (at most two a bar, a beat apart)`);

  // ---- fills that take the hands, then MUTATE
  const full: Hit[][] = cym.map((bar) => bar.filter((h) => (h.cat === 'hat' && A.hat >= 1) || (h.cat === 'ride' && A.ride >= 1) || (h.cat === 'open' && O >= 1)).map((h) => ({ ...h })));
  const out = bars.map((hits, i) => {
    let bar = cym[i]!;
    const mark = ctx.marks[i];
    const keep = (h: Hit) => (h.cat === 'hat' && A.hat >= 1) || (h.cat === 'ride' && A.ride >= 1) || (h.cat === 'open' && O >= 1) || h.cat === 'crash';
    if (mark && HANDS.includes(mark.kind)) bar = bar.filter((h) => h.step < mark.from || keep(h));
    if (mark && mark.kind === 'burst') bar = bar.filter((h) => h.step < mark.from || h.cat === 'ride' || keep(h));
    for (const m of ctx.mutations[i] ?? []) {
      const only = (['hat', 'open', 'ride'] as Category[]).filter((x) => !m.cats || m.cats.includes(x));
      if (only.length && ctx.mutate) bar = ctx.mutate(bar, stream(m.seed, 'cymbals'), only);
    }
    return [...hits, ...bar];
  });

  const count = (cat: Category) => out.flat().filter((h) => h.cat === cat).length;
  const report: CymbalReport = {
    grid,
    auto,
    figure: { hat: figure.hat.id, ride: figure.ride.id },
    primary,
    rel,
    hatRel: cs.hatRel,
    development: dev,
    counts: { closed: [count('hat'), asked.closed], open: [count('open'), asked.open], ride: [count('ride'), asked.ride], crash: [count('crash'), asked.crash] },
    notes: [...new Set(notes)].slice(0, 4),
  };
  const famLabel = (f: Family) => (A[f] <= 0 ? '' : `${CYMBAL_LABEL[figure[f].id]} ON ${SUB_LABEL[grid[f]]} ${Math.round(A[f] * 100)}%${both && f === secondary ? ` (${PRIMARY_REL_LABEL[rel]})` : ''}`);
  return {
    bars: out,
    timekeeper: primary ?? 'hat',
    hats: [famLabel('hat'), O > 0 ? `OPEN ${Math.round(O * 100)}% ${HAT_REL_LABEL[cs.hatRel]}` : ''].filter(Boolean).join(' · '),
    ride: famLabel('ride'),
    development: DEV_LABEL[dev],
    report,
    full,
  };
}

/** What the break actually plays, per cymbal family (THIS BREAK, from the events after every layer and edit). */
export function analyseCymbals(events: readonly BreakEvent[], bars: number): { cat: Category; count: number; perBar: number; grids: string }[] {
  const fams: Category[] = ['hat', 'open', 'ride', 'crash'];
  return fams.map((cat) => {
    const es = events.filter((e) => e.cat === cat);
    const ticks = es.map((e) => e.step * TPS + e.sub);
    const on = (g: Grid) => ticks.length > 0 && ticks.every((t) => t % SUB_TICKS[g] === 0);
    const finest = ticks.length ? (on('4') ? '1/4' : on('8') ? '1/8' : on('16') ? '1/16' : on('t') ? 'TRIPLET' : on('32') ? '1/32' : 'MIXED') : '';
    return { cat, count: es.length, perBar: bars ? es.length / bars : 0, grids: finest };
  });
}
