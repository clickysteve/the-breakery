/**
 * DESTROY (Phase 14, its own tab): event-level destruction of the finished pattern. Non-destructive
 * like CHOP: every bake computes it again from the events under it (after CHOP, the hand edits and
 * the sample choice), so ENABLED off, MASTER AMOUNT 0 or an empty matrix is the pattern exactly,
 * and the settings are kept when it is off. Nothing here processes audio: each effect is a field of
 * the hit (types.ts BreakEvent) that the sampler plays (audio/shaped.ts), the same live and in the
 * offline render, so playback, export and stems agree.
 *
 * THE MATRIX: which effects may touch which track (DESTROY_MATRIX); an effect never touches a track
 * whose cell is off. Every effect has a PROBABILITY (how many hits) separate from its intensity
 * (how hard), and MASTER AMOUNT scales every probability.
 *
 *   STUTTER    the hit repeated (REPEATS, at a SUBDIVISION, EVEN, ACCEL or DECEL), with a velocity
 *              contour (FLAT, FADE, SWELL) and a pitch movement across the repeats. Repeats stop
 *              before the next hit of the same track. They are DESTROY's own role ('stutter'), not
 *              generated rolls: ROLL GENERATION is never switched on and the ROLLS layer never sees them
 *   PITCH      the hit transposed by up to RANGE semitones (UP, DOWN, BOTH), on semitones or free
 *              (cents), FIXED or as a DIVE or RISE: across a stutter's repeats, or a glide within a
 *              single hit. Never beyond ±24 semitones in all (with EXPRESSION's pitch)
 *   REVERSE    the reversed copy of the sample (the same cache EXPRESSION uses), WHOLE or PARTIAL
 *              (AMOUNT: how much of the reversed sound, a shorter swell into the hit), on every
 *              chosen hit, ALTERNATING through a stutter (or along the track), or as a CLUSTER (the
 *              chosen hit and the next ones of its track within the beat). The start is faded in
 *              (2 ms), so a partial reverse does not click
 *   GATE       the sound cut after a LENGTH (SHORT 1/32, MEDIUM 1/16, LONG 1/8, or between), HARD or
 *              SOFT, or RHYTHMIC (open and shut at that length while it rings)
 *   TAPE STOP  the track slowing to a halt: a continuous playback-rate ramp (pitch and speed fall
 *              together, as a tape or a platter does) over a DURATION, falling by PITCH FALL, then
 *              CUT (silence until the window ends) or RESUME (back up to speed over the same time).
 *              The hit's own sound and every later hit of that track inside the window are slowed
 *              and moved later as the tape would carry them; hits it never reaches are dropped. The
 *              other tracks keep time, and the track is back on the grid after the window (as a
 *              platter restarted on the beat): a whole-mix tape stop is not modelled
 *
 * ORDER AND CONFLICTS (fixed, so a pattern destroys the same way every time):
 *   STUTTER, PITCH, REVERSE, GATE, TAPE STOP. A stutter makes a chain (the hit and its repeats) and
 *   the later effects treat the chain as one: one draw for the chain, a PITCH contour along it,
 *   ALTERNATE reversal along it, a GATE no longer than the gap between repeats (so they never
 *   smear into each other), a TAPE STOP that slows the chain. A reversed hit that is also gated
 *   keeps the END of its reversed sound (the swell into the transient), not its start. TAPE STOP
 *   replaces a PITCH glide on the same hit (the PITCH offset stays). Hand-edited hits (placed,
 *   moved or changed by hand) are never destroyed.
 *
 * DETERMINISM: whether an effect takes a hit is a fixed draw per (BEAT seed, TAKE, effect, hit), so
 * a higher probability destroys the same hits and more, FREEZE BEAT keeps the destruction, and
 * RE-DESTROY (TAKE + 1) draws again. BOUNDS: at most 8 repeats a hit and MAX_NEW new hits a
 * pattern; the report says when a limit was reached.
 *
 * MIDI: the notes are exported (a stutter's repeats are notes); pitch, reverse, gate and tape stop
 * are sample playback, not General MIDI, so a MIDI file has the hits without them (and never
 * transposes a drum note to another drum).
 */
import { stream } from './rng';
import { CATEGORIES, clamp, MAX_PITCH, TPB, TPS, type BreakEvent, type Category } from './types';

export const DESTROY_EFFECTS = ['stutter', 'pitch', 'reverse', 'gate', 'tape'] as const;
export type DestroyEffect = (typeof DESTROY_EFFECTS)[number];
export const EFFECT_LABEL: Record<DestroyEffect, string> = { stutter: 'STUTTER', pitch: 'PITCH', reverse: 'REVERSE', gate: 'GATE', tape: 'TAPE STOP' };
/** The order the effects run in (the matrix columns follow it). */
export const EFFECT_ORDER: readonly DestroyEffect[] = DESTROY_EFFECTS;

export const STUTTER_SUBS = ['8', '16', '16t', '32', '32t', '64'] as const;
export type StutterSub = (typeof STUTTER_SUBS)[number];
export const STUTTER_SUB_LABEL: Record<StutterSub, string> = { 8: '1/8', 16: '1/16', '16t': '1/16T', 32: '1/32', '32t': '1/32T', 64: '1/64' };
/** Grid ticks between repeats (TPS = 12 a sixteenth). */
export const STUTTER_TICKS: Record<StutterSub, number> = { 8: 24, 16: 12, '16t': 8, 32: 6, '32t': 4, 64: 3 };
/** GATE lengths in quarter notes. */
export const GATE_LENGTHS = { short: 0.125, medium: 0.25, long: 0.5 } as const;

export interface ReverseFx {
  prob: number;
  /** PARTIAL: how much of the reversed sound plays, 0.1..1 */
  amount: number;
  mode: 'whole' | 'partial';
  pattern: 'hit' | 'alternate' | 'cluster';
}
export interface StutterFx {
  prob: number;
  /** extra strokes, 1..8 */
  repeats: number;
  sub: StutterSub;
  shape: 'even' | 'accel' | 'decel';
  vel: 'flat' | 'fade' | 'swell';
  /** semitones the repeats move by the last one, -12..12 */
  pitch: number;
}
export interface PitchFx {
  prob: number;
  /** semitones, 1..24 */
  range: number;
  dir: 'up' | 'down' | 'both';
  quantise: boolean;
  contour: 'fixed' | 'dive' | 'rise';
}
export interface GateFx {
  prob: number;
  /** quarter notes, 1/16..1 (SHORT, MEDIUM, LONG set 1/8, 1/4, 1/2 of a quarter) */
  len: number;
  shape: 'hard' | 'soft';
  rhythmic: boolean;
}
export interface TapeFx {
  prob: number;
  /** slowdown, quarter notes 0.25..2 */
  len: number;
  /** PITCH FALL: how far the speed falls, 0.2..0.95 (0.95 = to 5%) */
  fall: number;
  end: 'cut' | 'resume';
}
export interface DestroySettings2 {
  on: boolean;
  /** MASTER AMOUNT 0..1: scales every probability */
  master: number;
  matrix: Record<Category, DestroyEffect[]>;
  stutter: StutterFx;
  pitch: PitchFx;
  reverse: ReverseFx;
  gate: GateFx;
  tape: TapeFx;
  /** RE-DESTROY: the take (another draw of which hits are destroyed) */
  take: number;
}

export interface Destroy2Report {
  /** hits each effect took */
  hits: Partial<Record<DestroyEffect, number>>;
  /** hits added (a stutter's repeats) and dropped (a tape stop) */
  added: number;
  dropped: number;
  notes: string[];
}

/** At most this many hits DESTROY adds to a pattern. */
export const MAX_NEW = 384;
const MAX_REPEATS = 8;

export const defaultMatrix = (): Record<Category, DestroyEffect[]> => ({
  kick: ['pitch', 'tape'],
  snare: ['stutter', 'pitch', 'reverse', 'gate', 'tape'],
  ghost: [],
  clap: ['stutter', 'reverse', 'gate'],
  htom: ['pitch', 'reverse'],
  mtom: ['pitch', 'reverse'],
  ltom: ['pitch', 'reverse'],
  hat: ['stutter', 'gate'],
  open: ['reverse', 'gate'],
  ride: [],
  crash: ['reverse'],
  perc: ['stutter', 'pitch'],
  fx: ['pitch', 'reverse', 'tape'],
});

export const defaultDestroy2 = (): DestroySettings2 => ({
  on: false,
  master: 1,
  matrix: defaultMatrix(),
  stutter: { prob: 0.2, repeats: 3, sub: '32', shape: 'even', vel: 'fade', pitch: 0 },
  pitch: { prob: 0.15, range: 7, dir: 'down', quantise: true, contour: 'fixed' },
  reverse: { prob: 0.15, amount: 0.6, mode: 'whole', pattern: 'hit' },
  gate: { prob: 0.2, len: GATE_LENGTHS.medium, shape: 'hard', rhythmic: false },
  tape: { prob: 0.08, len: 1, fall: 0.8, end: 'cut' },
  take: 0,
});

const one = <T extends string>(v: unknown, xs: readonly T[], d: T): T => ((xs as readonly string[]).includes(String(v)) ? (v as T) : d);
const num = (v: unknown, lo: number, hi: number, d: number) => (v !== undefined && v !== null && Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d);

/** Stored DESTROY settings made safe (anything missing or invalid takes its default). */
export function sanitiseDestroy2(v: unknown): DestroySettings2 | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<DestroySettings2>;
  const d = defaultDestroy2();
  const m = (o.matrix ?? {}) as Partial<Record<Category, unknown>>;
  const matrix = Object.fromEntries(CATEGORIES.map((c) => [c, Array.isArray(m[c]) ? DESTROY_EFFECTS.filter((x) => (m[c] as unknown[]).includes(x)) : o.matrix ? [] : d.matrix[c]])) as Record<Category, DestroyEffect[]>;
  const st = (o.stutter ?? {}) as Partial<StutterFx>;
  const pi = (o.pitch ?? {}) as Partial<PitchFx>;
  const re = (o.reverse ?? {}) as Partial<ReverseFx>;
  const ga = (o.gate ?? {}) as Partial<GateFx>;
  const ta = (o.tape ?? {}) as Partial<TapeFx>;
  return {
    on: o.on === true,
    master: num(o.master, 0, 1, d.master),
    matrix,
    stutter: { prob: num(st.prob, 0, 1, d.stutter.prob), repeats: Math.round(num(st.repeats, 1, MAX_REPEATS, d.stutter.repeats)), sub: one(st.sub, STUTTER_SUBS, d.stutter.sub), shape: one(st.shape, ['even', 'accel', 'decel'] as const, 'even'), vel: one(st.vel, ['flat', 'fade', 'swell'] as const, 'fade'), pitch: Math.round(num(st.pitch, -12, 12, 0)) },
    pitch: { prob: num(pi.prob, 0, 1, d.pitch.prob), range: Math.round(num(pi.range, 1, 24, d.pitch.range)), dir: one(pi.dir, ['up', 'down', 'both'] as const, 'down'), quantise: pi.quantise !== false, contour: one(pi.contour, ['fixed', 'dive', 'rise'] as const, 'fixed') },
    reverse: { prob: num(re.prob, 0, 1, d.reverse.prob), amount: num(re.amount, 0.1, 1, d.reverse.amount), mode: one(re.mode, ['whole', 'partial'] as const, 'whole'), pattern: one(re.pattern, ['hit', 'alternate', 'cluster'] as const, 'hit') },
    gate: { prob: num(ga.prob, 0, 1, d.gate.prob), len: num(ga.len, 1 / 16, 1, d.gate.len), shape: one(ga.shape, ['hard', 'soft'] as const, 'hard'), rhythmic: ga.rhythmic === true },
    tape: { prob: num(ta.prob, 0, 1, d.tape.prob), len: num(ta.len, 0.25, 2, d.tape.len), fall: num(ta.fall, 0.2, 0.95, d.tape.fall), end: one(ta.end, ['cut', 'resume'] as const, 'cut') },
    take: Math.max(0, Math.floor(Number(o.take) || 0)) >>> 0,
  };
}

/** Is DESTROY changing the pattern (on, MASTER above 0, and some effect with a probability on some track)? */
export function destroy2Active(s: DestroySettings2 | undefined | null): s is DestroySettings2 {
  if (!s || !s.on || s.master <= 0) return false;
  return CATEGORIES.some((c) => s.matrix[c]?.some((x) => s[x].prob > 0));
}

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const at = (t: number) => ({ bar: Math.floor(t / TPB), step: Math.floor((t % TPB) / TPS), sub: t % TPS });
const keyOf = (e: Pick<BreakEvent, 'cat' | 'bar' | 'step' | 'sub'>) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
/** Ticks per quarter note. */
const TPQ = TPB / 4;

export interface Destroy2Context {
  /** the BEAT seed */
  seed: number;
  bars: number;
}

interface Chain {
  src: BreakEvent;
  key: string;
  items: BreakEvent[];
  /** ticks between repeats (0: a single hit) */
  gap: number;
}

/** DESTROY on a pattern's events. */
export function destroy2(events: BreakEvent[], s: DestroySettings2 | undefined, ctx: Destroy2Context): { events: BreakEvent[]; report?: Destroy2Report } {
  if (!destroy2Active(s)) return { events };
  const report: Destroy2Report = { hits: {}, added: 0, dropped: 0, notes: [] };
  const draw = (fx: DestroyEffect, k: string, salt = '') => stream(ctx.seed, `d2:${s.take}:${fx}:${k}${salt}`).next();
  const takes = (fx: DestroyEffect, e: BreakEvent, k: string) => !e.manual && (s.matrix[e.cat] ?? []).includes(fx) && s[fx].prob > 0 && draw(fx, k) < s[fx].prob * s.master;
  const count = (fx: DestroyEffect) => (report.hits[fx] = (report.hits[fx] ?? 0) + 1);
  const loopEnd = ctx.bars * TPB;
  const sorted = [...events].sort((a, b) => tickOf(a) - tickOf(b));
  const chains: Chain[] = sorted.map((e) => ({ src: e, key: keyOf(e), items: [{ ...e }], gap: 0 }));
  const nextOfTrack = (e: BreakEvent) => {
    const t = tickOf(e);
    const n = sorted.find((x) => x.cat === e.cat && tickOf(x) > t);
    return n ? tickOf(n) : loopEnd;
  };

  // ---- STUTTER
  let budget = MAX_NEW;
  const st = s.stutter;
  for (const c of chains) {
    if (!takes('stutter', c.src, c.key)) continue;
    const t0 = tickOf(c.src);
    const limit = Math.min(nextOfTrack(c.src), loopEnd);
    const base = STUTTER_TICKS[st.sub];
    const n = Math.min(st.repeats, MAX_REPEATS);
    let t = t0;
    let gap = base;
    const reps: number[] = [];
    for (let k = 1; k <= n; k++) {
      const step = Math.max(2, Math.round(st.shape === 'accel' ? base * 0.8 ** (k - 1) : st.shape === 'decel' ? base * 1.25 ** (k - 1) : base));
      if (t + step >= limit) break;
      t += step;
      gap = Math.min(gap, step);
      reps.push(t);
    }
    if (!reps.length) continue;
    if (reps.length > budget) {
      report.notes.push(`STUTTER: the ${MAX_NEW}-hit limit was reached; later hits were not stuttered`);
      break;
    }
    budget -= reps.length;
    count('stutter');
    const N = reps.length;
    reps.forEach((tk, i) => {
      const k = i + 1;
      const f = N ? k / N : 0;
      const vel = st.vel === 'fade' ? c.src.vel * (1 - 0.6 * f) : st.vel === 'swell' ? c.src.vel * (0.45 + 0.55 * f) : c.src.vel;
      const { manual: _m, ...rest } = c.src;
      c.items.push({ ...rest, ...at(tk), vel: clamp(Math.round(vel), 1, 127), role: 'stutter', ...(st.pitch ? { pitch: clamp((c.src.pitch ?? 0) + Math.round(st.pitch * f), -MAX_PITCH, MAX_PITCH) } : {}), why: `DESTROY ▸ STUTTER: repeat ${k} of ${N} of the ${c.src.cat} (${STUTTER_SUB_LABEL[st.sub]}${st.shape !== 'even' ? `, ${st.shape.toUpperCase()}` : ''})` });
    });
    c.gap = gap;
    report.added += N;
  }

  // ---- PITCH
  const pi = s.pitch;
  for (const c of chains) {
    if (!takes('pitch', c.src, c.key)) continue;
    count('pitch');
    const mag = pi.range * (0.35 + 0.65 * draw('pitch', c.key, ':mag'));
    const sign = pi.dir === 'up' ? 1 : pi.dir === 'down' ? -1 : draw('pitch', c.key, ':dir') < 0.5 ? -1 : 1;
    const shift = sign * mag;
    const n = c.items.length;
    c.items.forEach((e, i) => {
      // FIXED: the same shift on every hit of the chain; DIVE and RISE: along the chain (or, on a single hit, a glide within it)
      const f = pi.contour === 'fixed' || n === 1 ? 1 : (i + 1) / n;
      const signed = pi.contour === 'rise' ? Math.abs(shift) : pi.contour === 'dive' ? -Math.abs(shift) : shift;
      const total = clamp((e.pitch ?? 0) + signed * f, -MAX_PITCH, MAX_PITCH);
      const whole = pi.quantise ? Math.round(total) : Math.trunc(total);
      const cents = pi.quantise ? 0 : Math.round((total - whole) * 100);
      if (pi.contour !== 'fixed' && n === 1) {
        // a glide on a single hit: from its pitch to the shift over a quarter note (a playback-rate ramp)
        e.tape = { len: 1, from: 1, to: 2 ** ((signed * f) / 12), hold: true };
        e.why = `${e.why}, DESTROY ▸ PITCH: a ${signed < 0 ? 'dive' : 'rise'} of ${Math.abs(Math.round(signed))} semitones`;
        return;
      }
      if (whole) e.pitch = whole;
      else delete e.pitch;
      if (cents) e.detune = cents;
      e.why = `${e.why}, DESTROY ▸ PITCH ${signed * f > 0 ? '+' : ''}${(signed * f).toFixed(pi.quantise ? 0 : 2)} st`;
    });
  }

  // ---- REVERSE
  const re = s.reverse;
  const revAt = new Set<string>();
  const reverse = (e: BreakEvent, why: string) => {
    e.reverse = true;
    if (re.mode === 'partial') e.revFrac = Math.round(re.amount * 100) / 100;
    else delete e.revFrac;
    e.why = `${e.why}, DESTROY ▸ REVERSE${re.mode === 'partial' ? ` ${Math.round(re.amount * 100)}%` : ''}${why}`;
  };
  const alternate = new Map<Category, number>();
  for (const c of chains) {
    if (!takes('reverse', c.src, c.key)) continue;
    count('reverse');
    if (re.pattern === 'alternate') {
      if (c.items.length > 1) c.items.forEach((e, i) => i % 2 === 1 && reverse(e, ' (alternate repeats)'));
      else {
        // along the track: every other chosen hit
        const k = alternate.get(c.src.cat) ?? 0;
        alternate.set(c.src.cat, k + 1);
        if (k % 2 === 0) reverse(c.items[0]!, ' (every other one)');
      }
    } else {
      for (const e of c.items) reverse(e, '');
      if (re.pattern === 'cluster') revAt.add(c.key);
    }
  }
  if (revAt.size) {
    // CLUSTER: the next hits of the same track within the beat are reversed with it
    for (const c of chains) {
      if (!revAt.has(c.key)) continue;
      const t0 = tickOf(c.src);
      let n = 0;
      for (const d of chains) {
        const t = tickOf(d.src);
        if (d === c || d.src.cat !== c.src.cat || t <= t0 || t >= t0 + TPQ || d.src.manual || n >= 2) continue;
        n++;
        for (const e of d.items) if (!e.reverse) reverse(e, ' (cluster)');
      }
    }
  }

  // ---- GATE
  const ga = s.gate;
  for (const c of chains) {
    if (!takes('gate', c.src, c.key)) continue;
    count('gate');
    // a stutter's repeats never smear into each other: the gate is no longer than the gap between them
    const len = c.gap ? Math.min(ga.len, c.gap / TPQ) : ga.len;
    const fade = ga.shape === 'soft' ? len * 0.5 : Math.min(len * 0.25, 0.01);
    for (const e of c.items) {
      e.gate = { len: Math.round(len * 1e4) / 1e4, fade: Math.round(fade * 1e4) / 1e4, ...(ga.rhythmic ? { chop: Math.round(len * 1e4) / 1e4 } : {}) };
      e.why = `${e.why}, DESTROY ▸ GATE ${ga.rhythmic ? 'RHYTHMIC ' : ''}${ga.shape.toUpperCase()}`;
    }
  }

  // ---- TAPE STOP
  const ta = s.tape;
  const drop = new Set<BreakEvent>();
  const L = ta.len;
  const r = Math.max(0.05, 1 - ta.fall);
  const W = ta.end === 'resume' ? 2 * L : L;
  /** tape position (quarters) at time u after the stop begins */
  const P = (u: number) => (u <= L ? u - ((1 - r) * u * u) / (2 * L) : L * (1 + r) / 2 + r * (u - L) + ((1 - r) * (u - L) ** 2) / (2 * L));
  const rate = (u: number) => (u <= L ? 1 - ((1 - r) * u) / L : r + ((1 - r) * (u - L)) / L);
  const reach = P(W);
  const all = () => chains.flatMap((c) => c.items);
  for (const c of chains) {
    const head = c.items[0]!;
    if (drop.has(head) || !takes('tape', c.src, c.key)) continue;
    count('tape');
    const t0 = tickOf(head);
    head.tape = { len: L, from: 1, to: r, ...(ta.end === 'resume' ? { back: L } : {}) };
    head.why = `${head.why}, DESTROY ▸ TAPE STOP (${ta.end.toUpperCase()})`;
    // the rest of the track inside the window: carried later and slower by the tape, or never reached
    for (const e of all()) {
      // a hand-edited hit stays where the user put it, as it was
      if (e === head || e.cat !== head.cat || drop.has(e) || e.manual) continue;
      const t = tickOf(e);
      if (t <= t0 || t >= t0 + W * TPQ) continue;
      const d = (t - t0) / TPQ;
      if (d >= reach) {
        drop.add(e);
        continue;
      }
      let lo = 0;
      let hi = W;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (P(mid) < d) lo = mid;
        else hi = mid;
      }
      const u = (lo + hi) / 2;
      const nt = Math.min(loopEnd - 1, Math.round(t0 + u * TPQ));
      Object.assign(e, at(nt));
      const rho = rate(u);
      e.tape = u <= L ? { len: Math.round((L - u) * 1e4) / 1e4, from: rho, to: r, ...(ta.end === 'resume' ? { back: L } : {}) } : { len: Math.round((W - u) * 1e4) / 1e4, from: rho, to: 1 };
      e.why = `${e.why}, carried by the TAPE STOP (${Math.round(rho * 100)}% speed)`;
    }
  }
  report.dropped = drop.size;
  const out = all()
    .filter((e) => !drop.has(e))
    .sort((a, b) => tickOf(a) - tickOf(b) || a.cat.localeCompare(b.cat));
  return { events: out, report };
}

/** One line on what DESTROY did. */
export function describeDestroy2(s: DestroySettings2 | undefined, r: Destroy2Report | undefined): string {
  if (!s?.on) return 'DESTROY OFF: the pattern as it is (the settings are kept).';
  if (!destroy2Active(s)) return 'DESTROY ON, NOTHING TO DO: every probability, the MASTER AMOUNT or the matrix is empty.';
  const parts = EFFECT_ORDER.filter((x) => r?.hits[x]).map((x) => `${EFFECT_LABEL[x]} ${r!.hits[x]}`);
  return `DESTROY TAKE ${s.take + 1}: ${parts.join(' · ') || 'NO HIT CHOSEN'}${r?.added ? ` · +${r.added} REPEATS` : ''}${r?.dropped ? ` · ${r.dropped} DROPPED BY TAPE STOP` : ''}`;
}

/**
 * CHAOS: the effects' settings randomised from a seed, within each effect's range, for the
 * effects the matrix uses (the matrix itself and the MASTER AMOUNT are kept). Deterministic.
 */
export function chaosDestroy(s: DestroySettings2, seed: number): DestroySettings2 {
  const rng = stream(seed, 'destroy-chaos');
  const used = new Set(CATEGORIES.flatMap((c) => s.matrix[c] ?? []));
  const p = () => Math.round(rng.range(0.08, 0.6) * 100) / 100;
  const out: DestroySettings2 = JSON.parse(JSON.stringify(s)) as DestroySettings2;
  out.on = true;
  if (used.has('stutter')) out.stutter = { prob: p(), repeats: 1 + rng.int(MAX_REPEATS), sub: rng.pick(STUTTER_SUBS), shape: rng.pick(['even', 'accel', 'decel'] as const), vel: rng.pick(['flat', 'fade', 'swell'] as const), pitch: rng.chance(0.35) ? rng.pick([-12, -7, -5, 5, 7, 12]) : 0 };
  if (used.has('pitch')) out.pitch = { prob: p(), range: rng.pick([2, 3, 5, 7, 12, 19, 24]), dir: rng.pick(['up', 'down', 'both'] as const), quantise: rng.chance(0.7), contour: rng.pick(['fixed', 'dive', 'rise'] as const) };
  if (used.has('reverse')) out.reverse = { prob: p(), amount: Math.round(rng.range(0.2, 1) * 100) / 100, mode: rng.pick(['whole', 'partial'] as const), pattern: rng.pick(['hit', 'alternate', 'cluster'] as const) };
  if (used.has('gate')) out.gate = { prob: p(), len: rng.pick([GATE_LENGTHS.short, GATE_LENGTHS.medium, GATE_LENGTHS.long]), shape: rng.pick(['hard', 'soft'] as const), rhythmic: rng.chance(0.35) };
  if (used.has('tape')) out.tape = { prob: Math.round(rng.range(0.04, 0.25) * 100) / 100, len: rng.pick([0.5, 1, 1.5, 2]), fall: Math.round(rng.range(0.5, 0.95) * 100) / 100, end: rng.pick(['cut', 'resume'] as const) };
  out.take = s.take;
  return sanitiseDestroy2(out)!;
}
