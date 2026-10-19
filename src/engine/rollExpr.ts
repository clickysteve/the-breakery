/**
 * ROLL EXPRESSION (IDM rolls and ratcheting). ROLLS decides where rolls go and which drum plays
 * them; EXPRESSION decides how each roll moves: its pitch contour, its velocity contour, how its
 * strokes are spaced in time, how many strokes it has (RATCHET) and which strokes play backwards.
 * It is not a second roll system: it reshapes the rolls already in the break (the ROLLS layer's,
 * the fills' rolls, CHOP's retriggers), and the same stroke maths makes a hand RATCHET of one hit
 * (edits.ts), so a ratchet made by hand sounds like a generated one.
 *
 * Rules that keep it musical and safe:
 *   - a roll stays inside its own span: from its first stroke to one stroke after its last (where
 *     the roll's anchor is), never across a bar line; timing contours warp the strokes within it
 *   - strokes stay on whole grid ticks, at least one tick apart (so every stroke is a separate,
 *     editable hit); what a contour asks for between ticks goes into the stroke's microtiming
 *   - velocity contours scale the roll's own loudest stroke by at most 1, so a ghost roll never
 *     becomes an accent
 *   - its randomness (RANDOM pitch, RANDOM velocity, CHAOTIC timing) comes from the FEEL seed, the
 *     roll's position and the VARIANT, so DICE changes the rolls and nothing else
 *   - EXPRESSION at CLASSIC is no pass at all: every break saved before it bakes exactly as it did
 */
import { makeRng, stream, type Rng } from './rng';
import { rollGroups } from './rolls';
import { clamp, MAX_PITCH, safePitch, TPB, TPS, type BreakEvent, type Category } from './types';

export const PITCH_CONTOURS = ['flat', 'rise', 'fall', 'updown', 'downup', 'stairs', 'pingpong', 'random'] as const;
export type PitchContour = (typeof PITCH_CONTOURS)[number];
export const PITCH_CONTOUR_LABEL: Record<PitchContour, string> = { flat: 'FLAT', rise: 'RISE', fall: 'FALL', updown: 'UP-DOWN', downup: 'DOWN-UP', stairs: 'STAIRCASE', pingpong: 'PING-PONG', random: 'RANDOM' };

/** keep = the velocities the roll was generated with (the ROLLS tab's DYNAMICS) */
export const VEL_CONTOURS = ['keep', 'flat', 'fadein', 'fadeout', 'swell', 'accent', 'random'] as const;
export type VelContour = (typeof VEL_CONTOURS)[number];
export const VEL_CONTOUR_LABEL: Record<VelContour, string> = { keep: 'AS ROLLED', flat: 'FLAT', fadein: 'FADE IN', fadeout: 'FADE OUT', swell: 'SWELL', accent: 'ACCENT', random: 'RANDOM' };

export const TIMING_CONTOURS = ['even', 'accelerate', 'decelerate', 'swing', 'chaotic'] as const;
export type TimingContour = (typeof TIMING_CONTOURS)[number];
export const TIMING_CONTOUR_LABEL: Record<TimingContour, string> = { even: 'EVEN', accelerate: 'ACCELERATE', decelerate: 'DECELERATE', swing: 'SWING', chaotic: 'CHAOTIC' };

/** RATCHET: strokes per roll (0 = as many as the roll has). */
export const RATCHETS = [0, 2, 3, 4, 5, 6, 8, 12, 16] as const;

export const REVERSE_MODES = ['off', 'all', 'alternate', 'last'] as const;
export type ReverseMode = (typeof REVERSE_MODES)[number];
export const REVERSE_MODE_LABEL: Record<ReverseMode, string> = { off: 'FORWARD', all: 'ALL REVERSED', alternate: 'ALTERNATE', last: 'LAST REVERSED' };

export const ROLL_PRESETS = ['classic', 'dive', 'rise', 'tumble', 'stutter', 'accelerate', 'decelerate', 'fadeaway', 'swell', 'pingpong', 'reverseburst', 'chaos'] as const;
export type RollPreset = (typeof ROLL_PRESETS)[number] | 'custom';
export const ROLL_PRESET_LABEL: Record<RollPreset, string> = {
  classic: 'CLASSIC', dive: 'PITCH DIVE', rise: 'PITCH RISE', tumble: 'TUMBLE', stutter: 'STUTTER', accelerate: 'ACCELERATE', decelerate: 'DECELERATE',
  fadeaway: 'FADE AWAY', swell: 'SWELL', pingpong: 'PING-PONG', reverseburst: 'REVERSE BURST', chaos: 'CHAOS', custom: 'CUSTOM',
};

/** The recipe's roll expression (absent = CLASSIC: rolls as generated). */
export interface RollExpression {
  preset: RollPreset;
  pitch: PitchContour;
  /** START and END of the pitch range, semitones */
  from: number;
  to: number;
  vel: VelContour;
  timing: TimingContour;
  /** strokes per roll (0 = as rolled) */
  ratchet: number;
  reverse: ReverseMode;
  /** DICE: which take of the random parts (RANDOM pitch and velocity, CHAOTIC timing) */
  variant: number;
}

type Shape = Omit<RollExpression, 'preset' | 'variant'>;
const CLASSIC: Shape = { pitch: 'flat', from: 0, to: 0, vel: 'keep', timing: 'even', ratchet: 0, reverse: 'off' };

/** What each preset sets (everything else as CLASSIC). */
export const PRESET_SHAPES: Record<(typeof ROLL_PRESETS)[number], Shape> = {
  classic: CLASSIC,
  dive: { ...CLASSIC, pitch: 'fall', from: 0, to: -12, vel: 'fadeout' },
  rise: { ...CLASSIC, pitch: 'rise', from: 0, to: 12, vel: 'fadein' },
  tumble: { ...CLASSIC, pitch: 'stairs', from: 5, to: -7, timing: 'decelerate', vel: 'fadeout' },
  stutter: { ...CLASSIC, ratchet: 8, vel: 'flat' },
  accelerate: { ...CLASSIC, timing: 'accelerate', vel: 'fadein', ratchet: 6 },
  decelerate: { ...CLASSIC, timing: 'decelerate', vel: 'fadeout', ratchet: 6 },
  fadeaway: { ...CLASSIC, pitch: 'fall', from: 0, to: -3, vel: 'fadeout', timing: 'decelerate' },
  swell: { ...CLASSIC, vel: 'swell' },
  pingpong: { ...CLASSIC, pitch: 'pingpong', from: 0, to: 7, vel: 'accent' },
  reverseburst: { ...CLASSIC, reverse: 'all', vel: 'fadein', ratchet: 4 },
  chaos: { pitch: 'random', from: -12, to: 12, vel: 'random', timing: 'chaotic', ratchet: 0, reverse: 'alternate' },
};

export const defaultRollExpr = (): RollExpression => ({ preset: 'classic', ...CLASSIC, variant: 0 });

/** A preset's expression (the variant kept, so a preset chosen after DICE keeps the take). */
export const presetExpr = (p: (typeof ROLL_PRESETS)[number], variant = 0): RollExpression => ({ preset: p, ...PRESET_SHAPES[p], variant });

/** Does it change anything? CLASSIC (and anything that adds up to it) is no pass at all. */
export function exprActive(x: RollExpression | undefined): boolean {
  if (!x) return false;
  return !(x.pitch === 'flat' && x.from === 0 && x.vel === 'keep' && x.timing === 'even' && x.ratchet === 0 && x.reverse === 'off');
}

/** Stored settings made safe (absent, or CLASSIC with no variant, for anything that does nothing). */
export function sanitiseRollExpr(v: unknown): RollExpression | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<RollExpression>;
  const pick = <T extends string>(list: readonly T[], x: unknown, d: T): T => ((list as readonly unknown[]).includes(x) ? (x as T) : d);
  const out: RollExpression = {
    preset: o.preset === 'custom' ? 'custom' : pick(ROLL_PRESETS, o.preset, 'classic'),
    pitch: pick(PITCH_CONTOURS, o.pitch, 'flat'),
    from: safePitch(o.from),
    to: safePitch(o.to),
    vel: pick(VEL_CONTOURS, o.vel, 'keep'),
    timing: pick(TIMING_CONTOURS, o.timing, 'even'),
    ratchet: (RATCHETS as readonly number[]).includes(Number(o.ratchet)) ? Number(o.ratchet) : 0,
    reverse: pick(REVERSE_MODES, o.reverse, 'off'),
    variant: Math.max(0, Math.floor(Number(o.variant) || 0)) >>> 0,
  };
  if (!exprActive(out) && !out.variant && out.preset === 'classic') return undefined;
  return out;
}

/**
 * DICE: a new expression from a seed (deterministic: the same seed is the same expression). A
 * musically weighted draw, not uniform: most takes keep the roll's timing even, ratchet moderately
 * and stay within an octave.
 */
export function diceExpr(seed: number): RollExpression {
  const rng = makeRng(seed >>> 0);
  const pitch = wpick<PitchContour>(rng, [['flat', 1], ['rise', 1.4], ['fall', 1.6], ['updown', 1], ['downup', 1], ['stairs', 1.2], ['pingpong', 1], ['random', 0.8]]);
  const span = wpick<number>(rng, [[3, 1], [5, 1], [7, 1.4], [12, 1.4], [19, 0.4], [24, 0.3]]);
  const from = pitch === 'flat' ? wpick<number>(rng, [[0, 3], [-5, 1], [5, 1], [-12, 0.5], [7, 0.5]]) : irange(rng, -3, 3);
  const to = clamp(from + (rng.chance(0.6) ? -span : span), -MAX_PITCH, MAX_PITCH);
  return {
    preset: 'custom',
    pitch,
    from,
    to,
    vel: wpick<VelContour>(rng, [['keep', 1], ['flat', 0.6], ['fadein', 1.2], ['fadeout', 1.2], ['swell', 1], ['accent', 0.8], ['random', 0.6]]),
    timing: wpick<TimingContour>(rng, [['even', 2.5], ['accelerate', 1.2], ['decelerate', 1.2], ['swing', 0.8], ['chaotic', 0.6]]),
    ratchet: wpick<number>(rng, [[0, 2], [3, 0.8], [4, 1], [5, 0.6], [6, 1], [8, 1], [12, 0.5], [16, 0.3]]),
    reverse: wpick<ReverseMode>(rng, [['off', 3], ['all', 0.6], ['alternate', 0.8], ['last', 1]]),
    variant: seed >>> 0,
  };
}

/** One stroke of an expressed roll. */
export interface Stroke {
  /** grid ticks from the span's start */
  tick: number;
  /** microtiming to add (the part of the contour between grid ticks), ms */
  ms: number;
  vel: number;
  pitch: number;
  reverse: boolean;
  /** which of the roll's original strokes it stands for (its drum, sample and timing) */
  src: number;
}

/** One of several values, chosen with probability proportional to its weight. */
function wpick<T>(rng: Rng, pairs: readonly [T, number][]): T {
  const i = rng.weighted(pairs.map((p) => p[1]));
  return pairs[Math.max(0, i)]![0];
}
/** A whole number in [lo, hi], both included. */
const irange = (rng: Rng, lo: number, hi: number): number => lo + rng.int(hi - lo + 1);

const intervalWeights = (n: number, timing: TimingContour, rng: Rng): number[] => {
  const w: number[] = [];
  // a short repeating motif: chaotic, but a figure the ear can follow
  const motif = timing === 'chaotic' ? [rng.range(0.35, 1.7), rng.range(0.35, 1.7), rng.range(0.35, 1.7)] : [];
  for (let k = 0; k < n; k++) {
    const x = (k + 0.5) / n;
    if (timing === 'accelerate') w.push(1.8 - 1.2 * x);
    else if (timing === 'decelerate') w.push(0.6 + 1.2 * x);
    else if (timing === 'swing') w.push(k % 2 === 0 ? 1.4 : 0.6);
    else if (timing === 'chaotic') w.push(motif[k % 3]!);
    else w.push(1);
  }
  return w;
};

const velMul = (k: number, n: number, c: VelContour, onGrid: boolean, rng: Rng): number => {
  const f = n > 1 ? k / (n - 1) : 1;
  switch (c) {
    case 'flat': return 0.82;
    case 'fadein': return 0.3 + 0.7 * f;
    case 'fadeout': return 1 - 0.7 * f;
    case 'swell': return 0.35 + 0.65 * Math.sin(Math.PI * (n > 1 ? f : 0.5));
    case 'accent': return onGrid ? 1 : 0.5;
    case 'random': return rng.range(0.35, 1);
    default: return 1;
  }
};

export function pitchAt(k: number, n: number, x: Pick<RollExpression, 'pitch' | 'from' | 'to'>, rng: Rng): number {
  const f = n > 1 ? k / (n - 1) : 0;
  const lo = Math.min(x.from, x.to);
  const hi = Math.max(x.from, x.to);
  let p: number;
  switch (x.pitch) {
    case 'rise': p = lo + (hi - lo) * f; break;
    case 'fall': p = hi - (hi - lo) * f; break;
    case 'updown': p = x.from + (x.to - x.from) * (1 - Math.abs(2 * f - 1)); break;
    case 'downup': p = x.from + (x.to - x.from) * Math.abs(2 * f - 1); break;
    case 'stairs': p = x.from + ((x.to - x.from) * Math.min(3, Math.floor((k * 4) / Math.max(1, n)))) / 3; break;
    case 'pingpong': p = k % 2 === 0 ? x.from : x.to; break;
    case 'random': p = irange(rng, lo, hi); break;
    default: p = x.from;
  }
  return safePitch(p);
}

/**
 * The strokes of a roll over `span` grid ticks: n of them, spaced by the timing contour, with the
 * pitch, velocity and reverse contours. `vels` are the original strokes' velocities (n0 of them);
 * `onGrid` says whether a tick from the span's start falls on a sixteenth. Pure.
 */
export function expressStrokes(span: number, vels: readonly number[], x: Shape, rng: Rng, msPerTick: number, onGrid: (tick: number) => boolean = () => false): Stroke[] {
  const n0 = vels.length;
  const n = Math.max(1, Math.min(x.ratchet || n0, Math.max(1, span)));
  const w = intervalWeights(n, x.timing, rng);
  const sum = w.reduce((s, v) => s + v, 0);
  const peak = Math.max(1, ...vels);
  const out: Stroke[] = [];
  let pos = 0;
  let prev = -1;
  for (let k = 0; k < n; k++) {
    const exact = (pos / sum) * span;
    pos += w[k]!;
    // whole ticks, at least one apart, leaving room for the strokes still to come
    const tick = Math.min(span - (n - k), Math.max(prev + 1, Math.floor(exact)));
    prev = tick;
    const src = Math.min(n0 - 1, Math.floor((k * n0) / n));
    const keep = n0 > 1 ? vels[Math.min(n0 - 1, Math.round((k * (n0 - 1)) / Math.max(1, n - 1)))]! : vels[0]!;
    const vel = x.vel === 'keep' ? keep : Math.round(peak * velMul(k, n, x.vel, onGrid(tick), rng));
    const reverse = x.reverse === 'all' || (x.reverse === 'alternate' && k % 2 === 1) || (x.reverse === 'last' && k === n - 1);
    out.push({ tick, ms: Math.round((exact - tick) * msPerTick * 10) / 10 || 0, vel: clamp(vel, 1, 127), pitch: pitchAt(k, n, x, rng), reverse, src });
  }
  return out;
}

/** Milliseconds per grid tick at a tempo (48 ticks a quarter note). */
export const msPerTick = (bpm: number): number => 60000 / bpm / (4 * TPS);

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;

/**
 * EXPRESSION over a break: every roll (rollGroups: whole rolls, a roll round the toms is one)
 * reshaped. Strokes are replaced; nothing else in the break changes.
 */
export function expressRolls(events: BreakEvent[], x: RollExpression, feelSeed: number, bpm: number): { events: BreakEvent[]; rolls: number } {
  const groups = rollGroups(events);
  if (!groups.length) return { events, rolls: 0 };
  const drop = new Set<BreakEvent>();
  const add: BreakEvent[] = [];
  const mpt = msPerTick(bpm);
  const label = x.preset === 'custom' ? 'DICE' : ROLL_PRESET_LABEL[x.preset];
  for (const g of groups) {
    const strokes = g.events.slice().sort((a, b) => tickOf(a) - tickOf(b));
    const n0 = strokes.length;
    const d = n0 > 1 ? Math.max(1, Math.round((g.end - g.start) / (n0 - 1))) : TPS / 2;
    const spanEnd = Math.min((g.bar + 1) * TPB, g.end + d);
    const span = spanEnd - g.start;
    const rng = stream(feelSeed, `roll-expr:${x.variant}:${g.start}`);
    const made = expressStrokes(span, strokes.map((e) => e.vel), x, rng, mpt, (t) => (g.start + t) % TPS === 0);
    // places other hits of the roll's drums already hold (a roll never doubles a hit)
    const cats = new Set(strokes.map((e) => e.cat));
    const taken = new Set(events.filter((e) => cats.has(e.cat) && !strokes.includes(e)).map((e) => `${e.cat}|${tickOf(e)}`));
    for (const e of strokes) drop.add(e);
    const base = strokes[0]!;
    for (const s of made) {
      const src = strokes[s.src]!;
      const t = g.start + s.tick;
      if (taken.has(`${src.cat}|${t}`)) continue;
      taken.add(`${src.cat}|${t}`);
      const step = Math.floor((t - g.bar * TPB) / TPS);
      const sub = (t - g.bar * TPB) % TPS;
      const off = Math.round((base.offsetMs + s.ms) * 10) / 10 || 0;
      const ev: BreakEvent = { ...src, step, sub, swing: base.swing, vel: s.vel, level: s.vel / 127, offsetMs: g.bar === 0 && step === 0 && sub === 0 ? Math.max(0, off) : off, why: `${src.why} · ${label} expression` };
      delete ev.pitch;
      delete ev.reverse;
      if (s.pitch) ev.pitch = s.pitch;
      if (s.reverse) ev.reverse = true;
      add.push(ev);
    }
  }
  const out = events.filter((e) => !drop.has(e)).concat(add);
  out.sort((a, b) => tickOf(a) - tickOf(b));
  return { events: out, rolls: groups.length };
}

/** One line on the expression (ROLLS ▸ EXPRESSION, tooltips). */
export function describeExpr(x: RollExpression | undefined): string {
  if (!exprActive(x)) return 'CLASSIC: rolls play as generated.';
  const e = x!;
  const parts: string[] = [];
  if (e.pitch !== 'flat' || e.from) parts.push(e.pitch === 'flat' ? `pitch ${e.from > 0 ? '+' : ''}${e.from}` : `pitch ${PITCH_CONTOUR_LABEL[e.pitch]} ${e.from > 0 ? '+' : ''}${e.from}..${e.to > 0 ? '+' : ''}${e.to}`);
  if (e.vel !== 'keep') parts.push(VEL_CONTOUR_LABEL[e.vel]);
  if (e.timing !== 'even') parts.push(TIMING_CONTOUR_LABEL[e.timing]);
  if (e.ratchet) parts.push(`×${e.ratchet}`);
  if (e.reverse !== 'off') parts.push(REVERSE_MODE_LABEL[e.reverse]);
  return `${ROLL_PRESET_LABEL[e.preset]}: ${parts.join(', ')}.`;
}

/** The categories of a roll group (for reports). */
export const groupCats = (evs: readonly BreakEvent[]): Category[] => [...new Set(evs.map((e) => e.cat))];
