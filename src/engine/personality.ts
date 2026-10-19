/**
 * PERSONALITY: who plays the break. A personality is a drummer's character described on six
 * dimensions that interact (docs/EXPRESSIVE_RESEARCH.md says which parts are measured, which are
 * interpretation and which are design):
 *
 *   TIMING      where the drummer sits against the grid, per drum (lean), how far strokes stray
 *               (spread) and how the time drifts over the phrase (drift)
 *   DYNAMICS    overall level, the contrast between accents and soft strokes, stroke-to-stroke
 *               variation
 *   ENERGY      how much is played: density, subdivision, appetite for fills
 *   DISCIPLINE  consistency: a disciplined drummer repeats the same deviations bar after bar, an
 *               undisciplined one never plays a bar the same way twice
 *   EXPRESSION  ghost notes, ornaments, flams, how soft the soft strokes are
 *   PHRASING    what the drummer does with the phrase: repeat, answer, thin out, burst, fill
 *
 * They are not independent random multipliers. DISCIPLINE decides whether the timing and velocity
 * deviations repeat (keyed by the place in the bar) or are new each time (keyed by the place in the
 * phrase), and tightens the spread; ENERGY makes the time rush through the phrase (low energy:
 * drag) and the dense bars harder (complex patterns were played harder: Câmara et al. 2020); a
 * laid-back snare is played louder (Danielsen et al. 2015); EXPRESSION widens the gap between ghosts
 * and accents.
 *
 * A personality acts twice:
 *   COMPOSITION   bounded nudges to the recipe the GROOVE is generated from, and phrase-level
 *                 edits of the bars (personaBars) before the performance
 *   PERFORMANCE   timing and dynamics over the finished events (personaPerform), after CHOP,
 *                 EXPRESSION, DESTROY and REGEN TRACK and before the hand edits
 *
 * It never overrides an explicit setting: TOM ACTIVITY 0 stays without toms and ROLLS 0 without
 * rolls (only settings above 0 are nudged), ROLL GENERATION off stays off (nothing here makes a
 * roll), a sparse DENSITY stays sparse (the nudge is proportional, and anything added is scaled by
 * DENSITY). INTENSITY 0, or NEUTRAL, is no pass at all: the break is the baseline exactly. The
 * downbeat kick and the backbeats are never removed, so the recipe stays recognisable.
 *
 * Randomness is keyed by position (the seed, the drum and the place), never drawn in sequence, so
 * a hit's treatment does not depend on how many other hits there are: REGEN TRACK and hand edits on
 * one track leave the others' performance exactly as it was.
 */
import { dillaPerform, hnoise, rollLeads } from './dilla';
import { hashString, stream } from './rng';
import { tidy } from './phrase';
import { hatActivity, rideActivity } from './cymbals';
import { clamp, STEPS, TPB, TPS, VOCAB_REVISION, type BarRole, type BreakEvent, type Category, type Hit, type Recipe } from './types';

export const PERSONALITIES = ['neutral', 'angry', 'frantic', 'lazy', 'sloppy', 'nervous', 'confident', 'drunk', 'mechanical', 'manic', 'minimalist', 'showoff', 'stubborn', 'playful', 'heavy', 'delicate', 'dilla'] as const;
export type PersonalityId = (typeof PERSONALITIES)[number];

export interface PersonalitySetting {
  id: PersonalityId;
  /** INTENSITY 0..1 (0 = NEUTRAL) */
  amount: number;
}

type Phrasing = 'none' | 'drive' | 'bursts' | 'sparse' | 'flubs' | 'stumble' | 'loop' | 'repeat' | 'swings' | 'fills' | 'answer' | 'dilla';

/** A personality's six dimensions, at full intensity. */
export interface Dims {
  /** TIMING: lean per drum group, ms (negative = ahead of the beat) */
  lean: { kick: number; snare: number; hats: number };
  /** TIMING: stroke-to-stroke spread, ms */
  spread: number;
  /** TIMING: slow drift over the phrase, ms */
  drift: number;
  /** DYNAMICS: overall level change, -0.3..0.3 */
  level: number;
  /** DYNAMICS: contrast between strong and soft strokes, -1..1 */
  contrast: number;
  /** DYNAMICS: stroke-to-stroke velocity variation, velocity units */
  velSpread: number;
  /** ENERGY: -1..1 */
  energy: number;
  /** DISCIPLINE: -1 (never the same twice) .. 1 (identical every bar) */
  discipline: number;
  /** EXPRESSION: -1 (plain) .. 1 (ghosts and ornaments) */
  expression: number;
  phrasing: Phrasing;
}

const D = (lean: [number, number, number], spread: number, drift: number, level: number, contrast: number, velSpread: number, energy: number, discipline: number, expression: number, phrasing: Phrasing): Dims =>
  ({ lean: { kick: lean[0], snare: lean[1], hats: lean[2] }, spread, drift, level, contrast, velSpread, energy, discipline, expression, phrasing });

/** The personalities (values at INTENSITY 100 %). Creative design informed by the research notes, not measurements. */
export const PERSONALITY_DIMS: Record<PersonalityId, Dims> = {
  neutral: D([0, 0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 'none'),
  angry: D([-4, -3, -6], 4, 2, 0.18, 0.4, 6, 0.7, -0.1, -0.4, 'drive'),
  frantic: D([-6, -5, -9], 6, 3, 0.08, 0.1, 8, 1, -0.4, 0.2, 'bursts'),
  lazy: D([8, 14, 6], 4, 3, -0.12, -0.2, 5, -0.6, 0, 0.1, 'sparse'),
  sloppy: D([2, 3, 0], 10, 4, 0, -0.1, 14, 0, -0.9, 0, 'flubs'),
  nervous: D([-3, -2, -5], 7, 5, -0.08, 0, 10, 0.3, -0.5, 0.3, 'bursts'),
  confident: D([0, 6, -1], 1.5, 1, 0.08, 0.35, 3, 0.1, 0.7, 0.2, 'none'),
  drunk: D([6, 10, 3], 9, 14, 0, 0.1, 12, -0.2, -1, -0.1, 'stumble'),
  mechanical: D([0, 0, 0], 0, 0, 0, -0.3, 0, 0, 1, -0.6, 'loop'),
  manic: D([-3, -2, -4], 5, 4, 0.1, 0.5, 9, 0.9, -0.6, 0.4, 'swings'),
  minimalist: D([0, 3, 0], 2, 1, -0.04, 0.2, 3, -0.8, 0.6, -0.5, 'sparse'),
  showoff: D([-2, -1, -3], 3, 2, 0.1, 0.5, 6, 0.8, 0.2, 0.8, 'fills'),
  stubborn: D([1, 4, 0], 2, 1, 0.05, 0.2, 3, 0, 0.9, -0.2, 'repeat'),
  playful: D([0, 2, -2], 3.5, 2, 0, 0.3, 7, 0.4, -0.2, 0.7, 'answer'),
  heavy: D([2, 5, 1], 3, 2, 0.25, -0.15, 4, 0.3, 0.3, -0.7, 'drive'),
  delicate: D([1, 2, 0], 2.5, 1.5, -0.22, 0.3, 4, -0.3, 0.3, 0.9, 'none'),
  dilla: D([0, 0, 0], 2, 1.5, -0.04, 0.15, 5, -0.1, 0.8, 0.3, 'dilla'),
};

export const PERSONALITY_LABEL: Record<PersonalityId, string> = {
  neutral: 'NEUTRAL', angry: 'ANGRY', frantic: 'FRANTIC', lazy: 'LAZY', sloppy: 'SLOPPY', nervous: 'NERVOUS', confident: 'CONFIDENT', drunk: 'DRUNK', mechanical: 'MECHANICAL',
  manic: 'MANIC', minimalist: 'MINIMALIST', showoff: 'SHOW-OFF', stubborn: 'STUBBORN', playful: 'PLAYFUL', heavy: 'HEAVY-HANDED', delicate: 'DELICATE', dilla: 'DILLA',
};

export const PERSONALITY_BLURB: Record<PersonalityId, string> = {
  neutral: 'The recipe as it is: no personality.',
  angry: 'Hits hard and pushes ahead. More kicks, fewer ghosts, big accents.',
  frantic: 'Rushes. Busy subdivisions, little bursts before the backbeat, loose time.',
  lazy: 'Sits well behind the beat. Plays less, softer, the snare late and fat.',
  sloppy: 'Uneven time and dynamics, the odd flam, the odd missed note.',
  nervous: 'Slightly ahead and unsteady. Quick nervous bursts, timid dynamics.',
  confident: 'Steady and repeatable. A laid-back, strong backbeat; nothing wasted.',
  drunk: 'Time that wanders over the phrase, hits that stumble off their place.',
  mechanical: 'A drum machine: identical bars, flat dynamics, on the grid.',
  manic: 'Swings between sparse and dense bars, extreme accents.',
  minimalist: 'Only what is needed: the weak notes go, the groove stays.',
  showoff: 'Fills everywhere, ornaments, big contrasts, a little ahead.',
  stubborn: 'Plays the same kick and snare every bar, whatever happens.',
  playful: 'Answers phrases with phrases, ghost-note chatter, light touch.',
  heavy: 'Everything loud, even the ghosts. Behind the beat and weighty.',
  delicate: 'Soft and detailed: quiet ghosts, gentle accents, small gestures.',
  dilla: 'Controlled asymmetry: kick, snare and hats each in their own time, repeating.',
};

export const PERSONALITY_DIM_NAMES = ['TIMING', 'DYNAMICS', 'ENERGY', 'DISCIPLINE', 'EXPRESSION', 'PHRASING'] as const;

export const personaActive = (p: PersonalitySetting | undefined | null): p is PersonalitySetting => !!p && p.id !== 'neutral' && p.amount > 0;

export function sanitisePersonality(v: unknown): PersonalitySetting | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<PersonalitySetting>;
  if (!(PERSONALITIES as readonly string[]).includes(String(o.id))) return undefined;
  return { id: o.id!, amount: clamp(Number(o.amount) || 0, 0, 1) };
}

// ------------------------------------------------------------------ composition: the recipe

/**
 * The recipe the GROOVE is generated from, nudged by the personality. Proportional and bounded,
 * so explicit settings keep their meaning: 0 stays 0 (TOMS, ROLLS, GHOSTS), a sparse DENSITY stays
 * sparse (20 % can become at most 26 %), and ROLL GENERATION is never touched.
 */
export function personaRecipe(r: Recipe, p: PersonalitySetting | undefined): Recipe {
  if (!personaActive(p)) return r;
  const d = PERSONALITY_DIMS[p.id];
  const a = p.amount;
  const scale = (x: number, k: number) => clamp(x * (1 + k * a), 0, 1);
  const out: Recipe = { ...r };
  out.density = scale(r.density, 0.3 * d.energy);
  out.complexity = scale(r.complexity, 0.35 * d.energy + 0.15 * d.expression);
  out.ghosts = scale(r.ghosts, 0.6 * d.expression);
  out.fills = scale(r.fills, 0.5 * Math.max(d.energy, d.phrasing === 'fills' ? 1 : -1));
  out.variation = scale(r.variation, -0.7 * d.discipline);
  out.toms = scale(r.toms, d.phrasing === 'fills' ? 0.4 : 0.25 * d.energy);
  out.rolls = scale(r.rolls, 0.4 * d.energy);
  out.syncopation = scale(r.syncopation, 0.2 * d.energy - 0.2 * Math.max(0, d.discipline));
  // a disciplined drummer is less loose; HUMANISE is the recipe's own looseness, kept but tightened
  out.humanise = scale(r.humanise, -0.8 * Math.max(0, d.discipline) + 0.3 * Math.max(0, -d.discipline));
  return out;
}

// ------------------------------------------------------------------ composition: the phrase

const isBackbeat = (h: Hit) => h.cat === 'snare' && (h.role === 'backbeat' || h.role === 'displaced backbeat');
/** Hits a personality may never remove or move: the downbeat kick, the backbeats, crashes. */
const fixed = (h: Hit) => isBackbeat(h) || h.cat === 'crash' || (h.cat === 'kick' && h.step === 0 && h.sub === 0) || h.role === 'floor kick';
/** Weak hits: what a sparse player leaves out first. */
const weak = (h: Hit) => !fixed(h) && (h.cat === 'ghost' || h.cat === 'perc' || h.role === 'lift' || h.role === 'drag' || (h.role === 'time' && h.step % 2 === 1) || (h.cat === 'kick' && h.role !== 'kick' && h.role !== 'downbeat'));

/**
 * Phrase-level edits of the developed bars (before the performance). Only ever adds snare, ghost,
 * kick, hat or percussion hits (never a tom, never a roll), scaled by DENSITY, and never removes a
 * fixed hit. The first bar's first beat is never changed.
 */
export function personaBars(bars: Hit[][], roles: BarRole[], recipe: Recipe, p: PersonalitySetting | undefined, beatSeed: number): Hit[][] {
  if (!personaActive(p)) return bars;
  const d = PERSONALITY_DIMS[p.id];
  const a = p.amount;
  const rng = stream(beatSeed, `persona:${p.id}`);
  const room = clamp((recipe.density / 0.5) ** 1.5, 0.1, 1); // a sparse recipe gets little added (20 % DENSITY: a quarter)
  const tk: Category = bars[0]?.some((h) => h.cat === 'ride' && h.role === 'time') ? 'ride' : 'hat';
  // revision 3: the cymbals it adds follow HI-HAT ACTIVITY or RIDE ACTIVITY (a personality never overrides them)
  const vocab = recipe.engine === 2 && (recipe.revision ?? 0) >= VOCAB_REVISION;
  const tkRoom = vocab ? room * clamp((tk === 'ride' ? rideActivity(recipe) : hatActivity(recipe)) / 0.7, 0, 1) : room;
  const why = `${PERSONALITY_LABEL[p.id]} personality`;
  const add = (hits: Hit[], h: Omit<Hit, 'why'>, what: string) => {
    if (h.step < 0 || h.step >= STEPS) return;
    if (hits.some((x) => x.cat === h.cat && x.step === h.step && x.sub === h.sub)) return;
    hits.push({ ...h, why: `${what} (${why})` });
  };
  const thin = (hits: Hit[], prob: number, u: () => number) => hits.filter((h) => !(weak(h) && u() < prob));
  // every bar draws the same number of values whatever it does with them: one bar's edits never shift another's
  const draws = (n: number) => Array.from({ length: n }, () => rng.next());
  const out = bars.map((b) => b.map((h) => ({ ...h })));
  const first = out[0] ?? [];
  for (let i = 0; i < out.length; i++) {
    const u = draws(24);
    let k = 0;
    const next = () => u[k++ % u.length]!;
    let hits = out[i]!;
    const role = roles[i];
    const fill = role === 'T' || role === 'F';
    switch (d.phrasing) {
      case 'drive':
        // driving kicks into the backbeats and the bar line
        for (const s of [7, 10, 14]) if (next() < a * 0.35 * room) add(hits, { cat: 'kick', step: s, sub: 0, level: 0.7, role: 'syncopated kick' }, 'a driving kick');
        break;
      case 'bursts':
        // quick little bursts before a backbeat: a 32nd pair of hats or a ghost drag
        for (const s of [3, 11]) {
          if (next() < a * 0.45 * tkRoom) add(hits, { cat: tk, step: s, sub: 6, level: 0.42, role: 'time' }, 'a nervous 32nd');
          if (next() < a * 0.3 * room) add(hits, { cat: 'ghost', step: s, sub: 0, level: 0.26, role: 'ghost' }, 'a nervous ghost');
        }
        if (d.energy > 0.8) for (let s = 1; s < STEPS; s += 2) if (next() < a * 0.5 * tkRoom) add(hits, { cat: tk, step: s, sub: 0, level: 0.45, role: 'time' }, 'frantic sixteenths');
        break;
      case 'sparse':
        if (i > 0 || a > 0.5) hits = thin(hits, a * (d.energy < -0.7 ? 0.7 : 0.4), next);
        break;
      case 'flubs':
        hits = thin(hits, a * 0.12, next);
        // a flam: a soft grace stroke just before a backbeat
        for (const h of [...hits]) if (isBackbeat(h) && h.step > 0 && next() < a * 0.35) add(hits, { cat: 'ghost', step: h.step - 1, sub: 9, level: 0.3, role: 'drag' }, 'a flam');
        break;
      case 'stumble':
        // weak hits fall off their place, by a sixteenth either way
        hits = hits.map((h) => (weak(h) && next() < a * 0.3 ? { ...h, step: clamp(h.step + (next() < 0.5 ? -1 : 1), i === 0 ? 1 : 0, STEPS - 1), why: `${h.why}, stumbled a sixteenth (${why})` } : h));
        hits = thin(hits, a * 0.08, next);
        break;
      case 'loop':
        // a machine: every bar that is not a fill is the first bar again
        if (i > 0 && !fill && next() < a) hits = first.map((h) => ({ ...h }));
        break;
      case 'repeat':
        // the same kick and snare every bar, the rest as it was
        if (i > 0 && role !== 'T' && next() < a * 0.95) hits = [...hits.filter((h) => h.cat !== 'kick' && h.cat !== 'snare'), ...first.filter((h) => h.cat === 'kick' || h.cat === 'snare').map((h) => ({ ...h, why: `${h.why} (the first bar's, kept: ${why})` }))];
        break;
      case 'swings':
        if (i % 2 === 1) hits = thin(hits, a * 0.6, next);
        else for (let s = 1; s < STEPS; s += 2) if (next() < a * 0.45 * room) add(hits, i === 0 && s < 4 ? { cat: tk, step: s + 4, sub: 0, level: 0.5, role: 'time' } : { cat: next() < 1 - 0.5 * (tkRoom / room) ? 'ghost' : tk, step: s, sub: 0, level: 0.34, role: 'ghost' }, 'a manic flurry');
        break;
      case 'fills':
        // ornaments in the fill bars: a ghost-to-snare run in the last beat; an extra snare in development bars
        if (fill) for (let s = 12; s < STEPS; s++) if (next() < a * 0.7) add(hits, { cat: s === 15 ? 'snare' : 'ghost', step: s, sub: 0, level: 0.35 + 0.12 * (s - 12), role: 'fill' }, 'a show-off run');
        if (role === 'B' && next() < a * 0.6) add(hits, { cat: 'snare', step: 15, sub: 0, level: 0.6, role: 'extra snare' }, 'a show-off snare');
        break;
      case 'answer':
        // the second half of the bar answers the first: its kicks echoed, a percussion reply
        if (i > 0 && !fill && next() < a * 0.55) {
          const call = hits.filter((h) => h.cat === 'kick' && h.step < 8 && h.step > 0);
          for (const h of call) if (!hits.some((x) => isBackbeat(x) && x.step === h.step + 8)) add(hits, { ...h, step: h.step + 8 }, 'the answer to the first half');
        }
        if (next() < a * 0.5 * room) add(hits, { cat: 'perc', step: next() < 0.5 ? 7 : 15, sub: 0, level: 0.4, role: 'perc' }, 'a playful reply');
        break;
      default:
        break;
    }
    // EXPRESSION: ghost chatter (expressive players) or none (plain players), on top of the recipe's GHOSTS
    if (d.expression > 0.5 && recipe.ghosts > 0 && next() < a * d.expression * 0.6 * room) add(hits, { cat: 'ghost', step: next() < 0.5 ? 6 : 14, sub: 0, level: 0.24, role: 'ghost' }, 'ghost chatter');
    if (d.expression < -0.5) hits = hits.filter((h) => !(h.cat === 'ghost' && next() < a * -d.expression * 0.5));
    // the loop always starts as the groove does
    if (i === 0) hits = [...first.filter((h) => h.step < 4), ...hits.filter((h) => h.step >= 4)];
    out[i] = tidy(hits);
  }
  return out;
}

// ------------------------------------------------------------------ performance

type PGroup = 'kick' | 'snare' | 'hats' | 'other';
const PGROUP: Record<Category, PGroup> = { kick: 'kick', snare: 'snare', ghost: 'snare', htom: 'other', mtom: 'other', ltom: 'other', hat: 'hats', open: 'hats', ride: 'hats', crash: 'other', perc: 'other' };
export const pgroup = (c: Category): PGroup => PGROUP[c];

export interface PersonaContext {
  plan: BarRole[];
  feelSeed: number;
  bpm: number;
  swing: number;
  /** the events that say how busy each bar is (before REGEN TRACK, so a regenerated track never changes another's dynamics) */
  busyFrom?: readonly BreakEvent[];
}

/** The farthest a personality moves a hit, ms. */
export const PERSONA_MAX_MS = 40;
const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;

/**
 * The personality's TIMING and DYNAMICS over the finished events (and DILLA's timing model).
 * Rolls move as a whole (each stroke takes the roll's first stroke's timing), so a roll's own
 * subdivision is never smeared.
 */
export function personaPerform(events: BreakEvent[], p: PersonalitySetting | undefined, ctx: PersonaContext): BreakEvent[] {
  if (!personaActive(p)) return events;
  const d = PERSONALITY_DIMS[p.id];
  const a = p.amount;
  const seed = ctx.feelSeed ^ hashString(`persona:${p.id}`);
  const total = ctx.plan.length * TPB;
  const disc = (d.discipline + 1) / 2; // 0 never the same .. 1 identical every bar
  const spread = d.spread * (1 - 0.7 * Math.max(0, d.discipline)) * (1 + 0.4 * Math.max(0, d.energy));
  const velSpread = d.velSpread * (1 - 0.7 * Math.max(0, d.discipline));
  // a slow drift: two slow waves with seeded phases (a smooth function of time, not a sequence), plus a rush (energy) or drag
  const ph1 = (hnoise(seed, 'phase1') + 1) * Math.PI;
  const ph2 = (hnoise(seed, 'phase2') + 1) * Math.PI;
  const drift = (t: number) => d.drift * (0.6 * Math.sin((2 * Math.PI * t) / (TPB * 2) + ph1) + 0.4 * Math.sin((2 * Math.PI * t) / (TPB * 3.3) + ph2)) - d.energy * 3 * (t / Math.max(1, total));
  // noise that repeats every bar (disciplined) or every phrase (not), blended by DISCIPLINE
  const noise = (e: BreakEvent, what: string) => disc * hnoise(seed, `${what}|${e.cat}|${e.step}|${e.sub}`) + (1 - disc) * hnoise(seed, `${what}|${e.cat}|${tickOf(e)}`);
  const busy = new Map<number, number>();
  const counted = ctx.busyFrom ?? events;
  for (const e of counted) busy.set(e.bar, (busy.get(e.bar) ?? 0) + 1);
  const meanBusy = counted.length / Math.max(1, ctx.plan.length);
  // a roll moves as a whole: its strokes take the first stroke's timing
  const rollLead = rollLeads(events);
  const timed = new Map<BreakEvent, number>();
  const out = events.map((e) => {
    const g = pgroup(e.cat);
    const src = rollLead.get(e) ?? e;
    let off = timed.get(src);
    if (off === undefined) {
      const lean = g === 'other' ? (d.lean.kick + d.lean.snare) / 2 : d.lean[g];
      const soft = src.cat === 'ghost' ? 1.5 : 1;
      // DILLA's timing is its own model (dilla.ts): here it only plays its dynamics, so nothing is offset twice
      off = d.phrasing === 'dilla' ? src.offsetMs : src.offsetMs * (1 - 0.85 * a * Math.max(0, d.discipline)) + a * (lean + drift(tickOf(src)) + noise(src, 't') * spread * soft);
      timed.set(src, off);
    }
    // ---- dynamics: level, contrast round the middle, variation, laid back = louder, busy bars harder
    const mid = 72;
    let v = e.vel * (1 + a * d.level);
    v = mid + (v - mid) * (1 + a * d.contrast * (e.cat === 'ghost' ? 1 + 0.5 * Math.max(0, d.expression) : 1));
    if (e.cat === 'ghost' && d.expression > 0) v *= 1 - 0.15 * a * d.expression;
    v += a * velSpread * noise(e, 'v');
    if (e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat') && d.lean.snare > 4) v += a * Math.min(8, d.lean.snare * 0.4);
    if (d.energy > 0) v += a * d.energy * 6 * clamp(((busy.get(e.bar) ?? 0) - meanBusy) / Math.max(1, meanBusy), -1, 1);
    let ms = clamp(off, -PERSONA_MAX_MS, PERSONA_MAX_MS);
    if (tickOf(e) === 0) ms = Math.max(0, ms);
    return { ...e, vel: Math.round(clamp(v, 1, 127)), offsetMs: Math.round(ms * 10) / 10 || 0 };
  });
  return d.phrasing === 'dilla' ? dillaPerform(out, a, ctx) : out;
}

/** What a personality does at an intensity, in words (the PERSONALITY tab). */
export function describePersonality(p: PersonalitySetting | undefined): string {
  if (!personaActive(p)) return 'NEUTRAL: the recipe plays as it is.';
  const d = PERSONALITY_DIMS[p.id];
  const a = p.amount;
  const ms = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * a)} ms`;
  const parts: string[] = [];
  if (p.id !== 'dilla' && (d.lean.kick || d.lean.snare || d.lean.hats)) parts.push(`kick ${ms(d.lean.kick)}, snare ${ms(d.lean.snare)}, hats ${ms(d.lean.hats)}`);
  if (d.level) parts.push(`${d.level > 0 ? 'louder' : 'softer'} ${Math.round(Math.abs(d.level) * a * 100)}%`);
  if (d.energy) parts.push(`${d.energy > 0 ? 'more' : 'fewer'} notes`);
  if (d.discipline > 0.5) parts.push('repeats itself');
  else if (d.discipline < -0.5) parts.push('never the same twice');
  return `${PERSONALITY_LABEL[p.id]} ${Math.round(a * 100)}%: ${parts.join(', ') || 'its own phrasing'}.`;
}

