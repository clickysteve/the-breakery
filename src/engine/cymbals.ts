/**
 * The cymbals (GROOVE revision 3, Phase 13): hi-hats, open hats and ride, generated per bar from
 * a CYMBAL APPROACH against each bar's kicks, snares and fills. Research and reasoning:
 * docs/rhythmic-research.md.
 *
 * Before revision 3 the timekeeper always played every eighth (support.ts), with sixteenths only
 * above a density threshold; HIP-HOP's default density never reached it, so 96% of its seeds had
 * the same hat part (docs/diversity-baseline.md). Now each family chooses an approach from its
 * recipe's vocabulary (styles.ts VOCAB):
 *
 *   NONE          the family rests
 *   SPARSE        two to five accents in the gaps
 *   QUARTERS      the beats
 *   OFF-BEATS     the "and"s (house, garage, D&B)
 *   BROKEN        eighths with some taken out (and a sixteenth added)
 *   3+3+2         dotted groupings over the bar
 *   EIGHTHS       eighths, with pickups into the snare as activity rises
 *   JAZZ RIDE     quarters with the skip note before 2 and 4 ("spang-a-lang")
 *   LINEAR        on the eighths (and some sixteenths) the kick and snare leave empty
 *   TRIPLETS      eighth-note triplets, a shuffle, or a mix of straight and triplet beats
 *   SKIPPING 16THS two or three sixteenths of each beat (garage, two-step)
 *   SIXTEENTHS    every sixteenth, accented
 *   RAPID         sixteenths with bursts of 32nds or sixteenth triplets (trap-style; only with
 *                 ROLL GENERATION on)
 *
 * HI-HAT ACTIVITY and RIDE ACTIVITY choose among them: each approach has an activity it suits,
 * and the weights fall off around it, so 0.2 favours sparse accents and quarters, 0.6 eighths
 * and broken eighths, 0.9 sixteenths and bursts, while every value still reaches several
 * approaches. 0 means the family plays nothing (generate.ts also removes anything a later layer
 * would add). The RELATIONSHIP decides how the two share the time (types.ts CYMBAL_MODES):
 *
 *   ALTERNATE     one family keeps the time; the other rests, punctuates the gaps without
 *                 doubling it, or takes over for some bars (the development bar, the second
 *                 half of the phrase, the turnaround)
 *   LAYER         both play; the second plays a sparser approach under the first
 *   INDEPENDENT   each follows its own approach, uncoordinated
 *
 * Through the phrase the cymbals HOLD (the same every bar), ANSWER (the answer bars vary a
 * detail), BUILD (the development and turnaround get denser), THIN (they get sparser before the
 * fill) or SWITCH (the development bar changes approach), weighted by VARIATION. A fill that
 * takes the hands (a snare run, a stutter, a roll, a drop) silences the cymbals for its length.
 *
 * Everything is drawn from the DETAIL seed's 'cymbals' stream once per phrase and rendered per
 * bar from those choices, so equal bars stay equal and the same seed gives the same cymbals.
 */
import { CYMBAL_APPROACHES, CYMBAL_LABEL, GROOVE_DEFS, pickWeighted, type CymbalId, type GrooveId } from './approaches';
import { posName } from './meter';
import { stream, type Rng } from './rng';
import { VOCAB, type AccentCycle, type FillKind, type StyleDef } from './styles';
import { timeLevel } from './support';
import { clamp, CYMBAL_REVISION, STEPS, TPS, type BarRole, type Category, type Hit, type Mutation, type Recipe } from './types';
import { cymSettings } from './cymbals4';

/** Where a bar's fill starts and what kind it is (phrase.ts records it). */
export interface FillMark {
  from: number;
  kind: FillKind | 'burst';
}

type Family = 'hat' | 'ride';
type Dev = 'hold' | 'answer' | 'build' | 'thin' | 'switch';
type Secondary = 'rest' | 'punctuate' | 'handoff' | 'layer' | 'independent';

/** The activity each approach suits. */
const PEAK: Record<CymbalId, number> = { none: 0.03, punctuate: 0.2, quarters: 0.3, offbeats: 0.45, broken: 0.45, tresillo: 0.5, spang: 0.55, eighths: 0.6, linear: 0.65, triplet: 0.65, gallop: 0.72, sixteenths: 0.85, rapid: 0.95 };
/** The approaches from sparse to dense. */
const BY_DENSITY = [...CYMBAL_APPROACHES].sort((a, b) => PEAK[a] - PEAK[b]);
const WIDTH = 0.24;
export const affinity = (id: CymbalId, a: number): number => Math.exp(-(((a - PEAK[id]) / WIDTH) ** 2));

const rev4 = (r: Recipe) => r.engine === 2 && (r.revision ?? 0) >= CYMBAL_REVISION;
/** The activity of each family for a recipe (a recipe saved without them: its default). Revision 4: CLOSED HAT and RIDE ACTIVITY (cymbals4.ts). */
export const hatActivity = (r: Recipe): number => (rev4(r) ? cymSettings(r).closed : clamp(r.hats ?? VOCAB[r.style].hats, 0, 1));
export const rideActivity = (r: Recipe): number => (rev4(r) ? cymSettings(r).ride : clamp(r.ride ?? VOCAB[r.style].ride, 0, 1));

/** One family's choices for the phrase. */
interface Voice {
  cat: Family;
  id: CymbalId;
  a: number;
  /** positions (sixteenths) chosen for SPARSE, BROKEN's removals, 3+3+2's grouping */
  cells: number[];
  /** sixteenths added (pickups, BROKEN's additions) */
  adds: number[];
  /** a 16-bit mask for LINEAR's and SIXTEENTHS' optional strokes */
  mask: number;
  /** TRIPLETS: full, shuffle, mixed; RAPID: 32 or 16t; SKIPPING 16THS: the beat figure */
  kind: string;
  /** RAPID: the beats with a burst */
  bursts: number[];
  /** open hats (hats only) */
  open: number[];
  /** level scale */
  gain: number;
}

const OPEN_MODES = ['none', 'lift', 'response', 'offbeat'] as const;
const GALLOPS: Record<string, number[]> = { 'x.xx': [0, 2, 3], 'xx.x': [0, 1, 3], 'xxx.': [0, 1, 2], 'x..x': [0, 3] };
const TRESILLOS: number[][] = [
  [0, 3, 6, 8, 11, 14],
  [0, 3, 6, 9, 12, 14],
  [0, 3, 6, 10, 12],
  [2, 5, 8, 10, 13],
  [0, 3, 8, 11],
];

function chooseApproach(rng: Rng, vocab: Partial<Record<CymbalId, number>>, a: number, lean: Partial<Record<CymbalId, number>>, ctx: { rapid: boolean; triplet: boolean; exclude?: CymbalId }): CymbalId {
  const w: Partial<Record<CymbalId, number>> = {};
  for (const id of CYMBAL_APPROACHES) {
    let x = (id === 'none' ? 0.6 : (vocab[id] ?? 0)) * affinity(id, a) * (lean[id] ?? 1);
    if (id === 'rapid' && !ctx.rapid) x = 0;
    // straight sixteenths fight a shuffled groove
    if (ctx.triplet && (id === 'sixteenths' || id === 'gallop' || id === 'rapid')) x *= 0.2;
    if (id === ctx.exclude) x = 0;
    if (x > 0) w[id] = x;
  }
  return pickWeighted(rng, CYMBAL_APPROACHES, w);
}

function makeVoice(cat: Family, id: CymbalId, a: number, def: StyleDef, recipe: Recipe, rng: Rng): Voice {
  const v: Voice = { cat, id, a, cells: [], adds: [], mask: rng.int(0x10000), kind: '', bursts: [], open: [], gain: cat === 'ride' ? 0.92 : 1 };
  const pickSteps = (w: Record<number, number>, n: number) => {
    const ws = Array.from({ length: STEPS }, (_, s) => w[s] ?? 0);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = rng.weighted(ws);
      if (s < 0) break;
      out.push(s);
      ws[s] = 0;
    }
    return out.sort((x, y) => x - y);
  };
  switch (id) {
    case 'punctuate':
      v.cells = pickSteps({ 0: 1.2, 2: 0.8, 6: 0.9, 8: 0.6, 10: 0.9, 14: 1, 4: 0.3, 12: 0.3, 7: 0.3, 15: 0.4, 3: 0.2, 11: 0.2 }, 2 + Math.round(a * 4 * rng.range(0.6, 1.2)));
      break;
    case 'quarters':
      if (rng.chance(0.3 + 0.4 * a)) v.adds = [rng.chance(0.6) ? 14 : 6];
      break;
    case 'offbeats':
      if (rng.chance(a * 0.8)) v.adds = [rng.chance(0.6) ? 15 : 7];
      break;
    case 'broken':
      v.cells = pickSteps({ 2: 0.6, 4: 1, 6: 0.8, 8: 0.4, 10: 0.8, 12: 1, 14: 0.7 }, 1 + rng.weighted([0.5, 0.35, 0.15]));
      if (rng.chance(0.25 + 0.5 * a)) v.adds = pickSteps({ 3: 1, 7: 0.6, 11: 1, 15: 0.8, 9: 0.4 }, 1);
      break;
    case 'tresillo':
      v.cells = TRESILLOS[rng.int(TRESILLOS.length)]!;
      break;
    case 'eighths':
      if (rng.chance(recipe.complexity * a * 1.2)) v.adds = pickSteps({ 3: 1, 11: 1, 7: 0.5, 15: 0.7 }, 1 + (rng.chance(0.3) ? 1 : 0));
      break;
    case 'triplet':
      v.kind = ['full', 'shuffle', 'mixed', 'drag'][rng.weighted([0.8 * a + 0.2, 1, 0.7, 0.4])]!;
      break;
    case 'gallop': {
      const ks = Object.keys(GALLOPS);
      v.kind = ks[rng.weighted([1, 0.8, 0.5, 0.3])]!;
      v.cells = [rng.chance(0.4) ? rng.int(4) : -1]; // a beat that takes another figure
      v.adds = [rng.weighted([1, 0.8, 0.5, 0.3])];
      break;
    }
    case 'sixteenths':
      // BROKEN and BREAKCORE leave some sixteenths out
      v.kind = def.style === 'broken' || (def.restless && rng.chance(0.4)) ? 'gaps' : 'all';
      break;
    case 'rapid':
      v.kind = rng.chance(0.55) ? '32' : '16t';
      v.cells = [rng.chance(0.5) ? 1 : 0]; // the base: eighths or sixteenths
      v.bursts = rng.chance(0.4 * a) ? [1, 3] : [rng.chance(0.65) ? 3 : 1];
      break;
    default:
      break;
  }
  if (cat === 'hat' && id !== 'none') {
    const cx = recipe.complexity;
    const mode = OPEN_MODES[Math.max(0, rng.weighted([1.2 * (1 - a) + 0.3, a * (0.6 + cx), a * 0.6 * cx, id === 'offbeats' || id === 'eighths' ? a * 0.5 : 0]))]!;
    if (mode === 'lift') {
      const n = clamp(Math.round(Math.max(1, def.openMax) * (0.4 + 0.8 * cx) * a * rng.range(0.6, 1.5)), 1, 3);
      const w = { ...def.openSteps };
      v.open = pickSteps(w, n).filter((s, i, xs) => i === 0 || s - xs[i - 1]! > 1);
    } else if (mode === 'response') v.open = rng.chance(0.5) ? [6] : [6, 14];
    else if (mode === 'offbeat') v.open = id === 'offbeats' && rng.chance(0.5) ? [2, 6, 10, 14] : [rng.chance(0.5) ? 6 : 14, rng.chance(0.4) ? 10 : 2].sort((x, y) => x - y);
  }
  return v;
}

interface BarCtx {
  kicks: Set<number>;
  snares: Set<number>;
  backbeats: number[];
  cycle: AccentCycle;
  /** ticks the other family already plays (a punctuating voice keeps out of them) */
  avoid?: Set<number>;
}

const T = (step: number, sub = 0) => step * TPS + sub;

/** The strokes of a voice in one bar: [tick, level] pairs. */
function strokes(v: Voice, c: BarCtx): [number, number][] {
  const out: [number, number][] = [];
  const lv = (s: number, fast = false) => timeLevel(s, fast, c.cycle, c.backbeats);
  const evens = [0, 2, 4, 6, 8, 10, 12, 14];
  switch (v.id) {
    case 'none':
      break;
    case 'punctuate':
      for (const s of v.cells) out.push([T(s), 0.66 + (s % 4 === 0 ? 0.08 : 0)]);
      break;
    case 'quarters':
      for (const s of [0, 4, 8, 12, ...v.adds]) out.push([T(s), s % 4 === 0 ? 0.7 : 0.5]);
      break;
    case 'offbeats':
      for (const s of [2, 6, 10, 14]) out.push([T(s), 0.74]);
      for (const s of v.adds) out.push([T(s), 0.46]);
      break;
    case 'broken':
      for (const s of evens) if (!v.cells.includes(s)) out.push([T(s), lv(s)]);
      for (const s of v.adds) out.push([T(s), 0.46]);
      break;
    case 'tresillo':
      for (const s of v.cells) out.push([T(s), s === v.cells[0] ? 0.76 : 0.66]);
      break;
    case 'eighths':
      for (const s of evens) out.push([T(s), lv(s)]);
      for (const s of v.adds) out.push([T(s), 0.44]);
      break;
    case 'spang':
      for (const s of [0, 4, 8, 12]) out.push([T(s), s === 4 || s === 12 ? 0.74 : 0.66]);
      // the skip note: the last triplet partial before 2 and 4 under a shuffle, the "a" otherwise
      for (const b of [0, 8]) out.push(v.kind === 'tri' ? [T(b + 2, 8), 0.5] : [T(b + 3), 0.5]);
      break;
    case 'linear':
      for (let s = 0; s < STEPS; s++) {
        if (c.kicks.has(s) || c.snares.has(s)) continue;
        if (s % 2 === 0) out.push([T(s), lv(s)]);
        else if ((v.mask >> s) & 1 && v.a > 0.45 && !c.kicks.has(s + 1) && !c.snares.has(s + 1)) out.push([T(s), 0.42]);
      }
      break;
    case 'triplet':
      for (let b = 0; b < 4; b++) {
        const full = v.kind === 'full' || (v.kind === 'mixed' && b === 3) || (v.kind === 'drag' && b % 2 === 0);
        out.push([b * 48, 0.7]);
        if (full) out.push([b * 48 + 16, 0.42]);
        out.push([b * 48 + 32, full ? 0.54 : 0.58]);
      }
      break;
    case 'gallop':
      for (let b = 0; b < 4; b++) {
        const fig = GALLOPS[b === v.cells[0] ? Object.keys(GALLOPS)[v.adds[0]!]! : v.kind]!;
        for (const x of fig) out.push([T(b * 4 + x), x === 0 ? 0.68 : x === 2 ? 0.6 : 0.44]);
      }
      break;
    case 'sixteenths':
      for (let s = 0; s < STEPS; s++) if (s % 2 === 0 || v.kind === 'all' || (v.mask >> s) & 1) out.push([T(s), lv(s, true)]);
      break;
    case 'rapid': {
      const base = v.cells[0] === 1 ? 1 : 2;
      const burstAt = new Set(v.bursts.map((b) => b * 4));
      for (let s = 0; s < STEPS; s += base) if (!burstAt.has(s - (s % 4))) out.push([T(s), lv(s, true)]);
      for (const b of burstAt) {
        const ticks = v.kind === '32' ? [0, 6, 12, 18, 24, 30, 36, 42] : [0, 8, 16, 24, 32, 40];
        ticks.forEach((t, i) => out.push([T(b) + t, 0.42 + (0.3 * i) / ticks.length]));
      }
      break;
    }
  }
  return out;
}

const BLURB: Record<CymbalId, string> = {
  none: 'resting',
  punctuate: 'a few accents in the gaps',
  quarters: 'on the beats',
  offbeats: 'on the off-beats',
  broken: 'broken eighths',
  tresillo: 'grouped 3+3+2',
  eighths: 'keeping eighths',
  spang: 'a jazz ride pattern, with the skip note into 2 and 4',
  linear: 'linear: in the gaps the kick and snare leave',
  triplet: 'triplets',
  gallop: 'skipping sixteenths',
  sixteenths: 'keeping sixteenths',
  rapid: 'sixteenths with rapid bursts',
};

/** One bar of a voice as hits. */
function render(v: Voice, c: BarCtx, why: string): Hit[] {
  const hits: Hit[] = [];
  const opens = v.cat === 'hat' ? new Set(v.open) : new Set<number>();
  const silent = new Set<number>();
  for (const s of opens) {
    silent.add(T(s));
    // the open hat rings until the next closed stroke after it
    for (let t = T(s) + 1; t < T(s + 1) + (s % 2 === 0 ? TPS : 0); t++) silent.add(t);
  }
  const name = v.cat === 'ride' ? 'ride' : 'hat';
  for (const [t, level] of strokes(v, c)) {
    if (silent.has(t) || c.avoid?.has(t)) continue;
    const step = Math.floor(t / TPS);
    if (step >= STEPS) continue;
    hits.push({ cat: v.cat, step, sub: t % TPS, level: clamp(level * v.gain, 0.2, 1), role: 'time', why: `${name} ${why}` });
  }
  for (const s of opens) hits.push({ cat: 'open', step: s, sub: 0, level: 0.72, role: 'lift', why: `open hat on ${posName(s)}, closed by the next hat (${CYMBAL_LABEL[v.id].toLowerCase()})` });
  return hits;
}

/** The next approach up (or down) the density order that the vocabulary has. */
function neighbour(id: CymbalId, dir: 1 | -1, vocab: Partial<Record<CymbalId, number>>, rapid: boolean): CymbalId {
  let i = BY_DENSITY.indexOf(id) + dir;
  while (i >= 0 && i < BY_DENSITY.length) {
    const x = BY_DENSITY[i]!;
    if ((x === 'none' || (vocab[x] ?? 0) > 0) && (x !== 'rapid' || rapid)) return x;
    i += dir;
  }
  return id;
}

/** A small variation of a voice (an answer bar, a mutation): an open hat moves, a stroke goes or comes. */
function varyVoice(v: Voice, rng: Rng): Voice {
  const w: Voice = { ...v, cells: [...v.cells], adds: [...v.adds], open: [...v.open] };
  const op = rng.weighted([v.cat === 'hat' ? 1 : 0, 1, 0.8]);
  if (op === 0) {
    if (w.open.length && rng.chance(0.6)) w.open[rng.int(w.open.length)] = rng.pick([6, 10, 14, 15, 7]);
    else w.open.push(rng.pick([14, 6, 10]));
    w.open = [...new Set(w.open)].sort((a, b) => a - b).filter((s, i, xs) => i === 0 || s - xs[i - 1]! > 1);
  } else if (op === 1) {
    w.adds.push(rng.pick([3, 7, 11, 15]));
    w.mask ^= 1 << rng.pick([3, 7, 11, 15]);
  } else {
    if (w.id === 'broken' || w.id === 'punctuate') w.cells.push(rng.pick([2, 6, 10, 14]));
    else w.adds.push(rng.pick([13, 9, 5]));
    w.mask ^= 1 << rng.pick([1, 5, 9, 13]);
  }
  return w;
}

export interface CymbalResult {
  bars: Hit[][];
  timekeeper: Family;
  hats: string;
  ride: string;
  development: string;
}

export interface CymbalContext {
  def: StyleDef;
  recipe: Recipe;
  groove: GrooveId;
  roles: BarRole[];
  marks: (FillMark | null)[];
  cycle: AccentCycle;
  /** detail mutations reaching each bar (their seeds and tracks) */
  mutations: Mutation[][];
}

const DEV_LABEL: Record<Dev, string> = { hold: 'held through the phrase', answer: 'varied in the answer bars', build: 'building into the turnaround', thin: 'thinning before the fill', switch: 'changing approach in the development bar' };
const HANDS: FillKind[] = ['run', 'stutter', 'roll', 'drop'];

/** The cymbals of every bar of the phrase. */
export function addCymbals(bars: Hit[][], ctx: CymbalContext, rng: Rng): CymbalResult {
  const { def, recipe, roles } = ctx;
  const vocab = VOCAB[def.style];
  const gr = GROOVE_DEFS[ctx.groove];
  const rapid = recipe.rollsOn !== false;
  const triplet = !!gr.triplet;
  const dens = 0.85 + 0.3 * recipe.density;
  const H = hatActivity(recipe);
  const R = rideActivity(recipe);
  const mode = recipe.cymbals ?? 'alternate';
  const n = roles.length;
  const vocabOf = (f: Family) => (f === 'hat' ? vocab.hatVocab : vocab.rideVocab);
  const choose = (f: Family, a: number, lean: Partial<Record<CymbalId, number>> = gr.cymbals ?? {}, exclude?: CymbalId) => chooseApproach(rng, vocabOf(f), clamp(a * dens, 0, 1), lean, { rapid, triplet, exclude });
  const voice = (f: Family, id: CymbalId, a: number) => {
    const v = makeVoice(f, id, a, def, recipe, rng);
    if (id === 'spang' && triplet) v.kind = 'tri';
    return v;
  };

  // ---- who keeps the time, and what the other does
  const primary: Family = H <= 0 ? 'ride' : R <= 0 ? 'hat' : rng.chance(H / (H + R * vocab.rideLean)) ? 'hat' : 'ride';
  const secondF: Family = primary === 'hat' ? 'ride' : 'hat';
  const aP = primary === 'hat' ? H : R;
  const a2 = primary === 'hat' ? R : H;
  const pv = aP > 0 ? voice(primary, choose(primary, aP), aP) : null;
  let second: Secondary = 'rest';
  if (a2 > 0) {
    if (mode === 'layer') second = 'layer';
    else if (mode === 'independent') second = 'independent';
    else second = (['rest', 'punctuate', 'handoff'] as const)[Math.max(0, rng.weighted([1 - a2 + 0.15, a2 * 0.8, n > 1 ? a2 * 0.9 * clamp(3 * recipe.variation, 0, 1) : 0]))]!;
  }
  let sv: Voice | null = null;
  if (second === 'punctuate') sv = voice(secondF, a2 > 0.6 ? 'quarters' : 'punctuate', a2);
  else if (second === 'handoff' || second === 'independent') sv = voice(secondF, choose(secondF, a2, second === 'independent' ? {} : (gr.cymbals ?? {})), a2);
  else if (second === 'layer') {
    // the layered family plays under the other: a sparser approach
    sv = voice(secondF, choose(secondF, Math.min(a2, aP) * 0.75), a2);
    sv.gain *= 0.88;
  }
  // which bars the handoff gives to the other family
  const handBars = new Set<number>();
  if (second === 'handoff') {
    // a programmed loop keeps its groove bars: the other family takes only the fill bars
    const loop = def.loop && recipe.variation < 0.5;
    const plan = loop ? 2 : rng.weighted([roles.includes('B') ? 1 : 0, n >= 2 ? 1 : 0, 0.6, roles.includes('A2') ? 0.6 : 0]);
    roles.forEach((r, i) => {
      if ((plan === 0 && r === 'B') || (plan === 1 && i >= Math.ceil(n / 2)) || (plan === 2 && (r === 'T' || r === 'F')) || (plan === 3 && r === 'A2')) handBars.add(i);
    });
  }

  // ---- development through the phrase (the timekeeping voice)
  const v = recipe.variation;
  const loopy = def.loop && v < 0.5;
  // VARIATION 0 holds the cymbals through the phrase
  const vv = clamp(3 * v, 0, 1);
  const dev: Dev = n === 1 || !pv ? 'hold' : (['hold', 'answer', 'build', 'thin', 'switch'] as const)[Math.max(0, rng.weighted([1.2 * (1 - v) + 0.2 + (loopy ? 1 : 0), loopy ? 0 : (0.6 + 0.4 * v) * vv, (0.3 + 0.6 * v) * vv, (0.2 + 0.4 * v) * vv, loopy ? 0 : (0.1 + 0.8 * v) * vv]))]!;
  let alt: Voice | null = null;
  if (pv && dev === 'answer') alt = varyVoice(pv, rng);
  else if (pv && (dev === 'build' || dev === 'thin')) {
    const id = neighbour(pv.id, dev === 'build' ? 1 : -1, vocabOf(primary), rapid);
    alt = id === pv.id ? varyVoice(pv, rng) : voice(primary, id, pv.a);
    alt.open = dev === 'build' ? [...new Set([...pv.open, 14])] : [];
  } else if (pv && dev === 'switch') alt = voice(primary, choose(primary, aP, {}, pv.id), aP);
  const altBar = (r: BarRole, i: number) => {
    if (!alt) return false;
    if (dev === 'answer') return r === 'A2' || r === 'B';
    if (dev === 'build') return r === 'B' || r === 'T' || (loopy && r === 'F');
    if (dev === 'thin') return r === 'T' || r === 'F';
    return r === 'B' || (!roles.includes('B') && r === 'A2');
  };

  let usedAlt = false;
  const out = bars.map((hits, i) => {
    const r = roles[i]!;
    const c: BarCtx = {
      kicks: new Set(hits.filter((h) => h.cat === 'kick' && h.sub === 0).map((h) => h.step)),
      snares: new Set(hits.filter((h) => h.cat === 'snare' && h.sub === 0).map((h) => h.step)),
      backbeats: hits.filter((h) => h.cat === 'snare' && (h.role === 'backbeat' || h.role === 'displaced backbeat')).map((h) => h.step),
      cycle: ctx.cycle,
    };
    let cym: Hit[] = [];
    const main = pv && altBar(r, i) ? alt! : pv;
    if (main === alt && !(handBars.has(i) && sv)) usedAlt = true;
    if (handBars.has(i) && sv) cym = render(sv, c, `${BLURB[sv.id]}: the ${secondF === 'ride' ? 'ride' : 'hats'} take over the time for this bar`);
    else {
      if (main) cym = render(main, c, BLURB[main.id]);
      if (sv && second !== 'handoff') {
        const avoid = second === 'punctuate' ? new Set(cym.map((h) => T(h.step, h.sub))) : undefined;
        cym.push(...render(sv, { ...c, avoid }, second === 'punctuate' ? `${BLURB[sv.id]}, between the ${primary === 'hat' ? 'hats' : 'ride'}` : second === 'layer' ? `${BLURB[sv.id]}, layered under the ${primary === 'hat' ? 'hats' : 'ride'}` : `${BLURB[sv.id]} (independent of the ${primary === 'hat' ? 'hats' : 'ride'})`));
      }
    }
    // MUTATE: each detail mutation reaching the bar varies its cymbals a little
    for (const m of ctx.mutations[i] ?? []) {
      const only = m.cats ? (['hat', 'open', 'ride'] as Category[]).filter((x) => m.cats!.includes(x)) : ['hat', 'open', 'ride'];
      if (!only.length) continue;
      cym = mutateCymbals(cym, stream(m.seed, 'cymbals'), only as Category[]);
    }
    // a fill that takes the hands silences the cymbals for its length
    const mark = ctx.marks[i];
    if (mark && (HANDS as string[]).includes(mark.kind)) cym = cym.filter((h) => h.step < mark.from);
    if (mark && mark.kind === 'burst') cym = cym.filter((h) => h.step < mark.from || h.cat === 'ride');
    return [...hits, ...cym];
  });

  const label = (f: Family): string => {
    const parts: string[] = [];
    const add = (x: Voice | null, how = '') => x && x.id !== 'none' && parts.push(`${CYMBAL_LABEL[x.id]}${how}`);
    if (f === primary) add(pv);
    else add(sv, second === 'punctuate' ? ' (punctuating)' : second === 'handoff' ? ' (taking over some bars)' : second === 'layer' ? ' (layered)' : '');
    return parts.join(', ');
  };
  return { bars: out, timekeeper: pv && pv.id !== 'none' ? primary : sv && sv.id !== 'none' ? secondF : 'hat', hats: label('hat'), ride: label('ride'), development: pv ? `${DEV_LABEL[usedAlt ? dev : 'hold']}${usedAlt && alt && dev !== 'answer' && alt.id !== pv.id ? ` (${CYMBAL_LABEL[alt.id]})` : ''}` : '' };
}

/** A small mutation of a bar's cymbals: one stroke goes, one comes, or an open hat moves. */
export function mutateCymbals(hits: Hit[], rng: Rng, cats: Category[]): Hit[] {
  const mine = hits.filter((h) => cats.includes(h.cat));
  const op = rng.weighted([mine.length ? 1 : 0, 1, cats.includes('open') ? 0.6 : 0]);
  if (op === 0) {
    const off = mine.filter((h) => h.step % 4 !== 0);
    if (!off.length) return hits;
    const x = rng.pick(off);
    return hits.filter((h) => h !== x);
  }
  if (op === 1) {
    const cat = mine.find((h) => h.cat !== 'open')?.cat ?? (cats.includes('hat') ? 'hat' : cats[0]!);
    if (cat === 'open') return hits;
    const s = rng.pick([1, 3, 5, 7, 9, 11, 13, 15]);
    if (hits.some((h) => (h.cat === 'hat' || h.cat === 'ride' || h.cat === 'open') && h.step === s)) return hits;
    return [...hits, { cat, step: s, sub: 0, level: 0.42, role: 'time', why: `${cat === 'ride' ? 'ride' : 'hat'} on ${posName(s)}: a mutation of the cymbals` }];
  }
  const s = rng.pick([6, 10, 14]);
  const rest = hits.filter((h) => !(h.cat === 'open') && !(h.cat === 'hat' && (h.step === s || h.step === s + 1)));
  return [...rest, { cat: 'open', step: s, sub: 0, level: 0.72, role: 'lift', why: `open hat on ${posName(s)}: a mutation of the cymbals` }];
}
