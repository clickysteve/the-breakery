/**
 * CHOP ▸ DESTROY: the edits a producer makes to wreck a break on purpose (stutters, reversed
 * beats, pitch dives, gates, skips, a frozen beat, a tape stop), done to the sequencer's events
 * after CHOP. Nothing here processes audio. Where the real effect is audio processing (a gate, a
 * tape stop), DESTROY makes an event-level approximation of it, and says so in the hit's
 * explanation:
 *   STUTTER     the start of a beat repeated across it (1/32 retriggers with ROLL GENERATION on,
 *               1/16 repeats with it off: no new rolls)
 *   REVERSE     the beat's hits played backwards (and, at higher AMOUNT, its order mirrored)
 *   PITCH DIVE  the beat's hits pitched progressively down (by playback rate)
 *   PITCH RISE  the same, upwards
 *   GATE        a 1/16 on/off gate: the hits in its closed halves are removed (approximation)
 *   SKIP        a skipping record: the beat jumps a sixteenth ahead, its last sixteenth silent
 *   FREEZE      the beat before played again in place of this one (a beat repeat)
 *   TAPE STOP   the beat slowing to a halt: hits later, lower and softer, the rest of it silent
 *               (approximation: per-hit pitch and timing, not a continuous slowdown)
 *
 * Deterministic and non-compounding, like CHOP: computed from the events before it at every bake,
 * from the BEAT seed and the VARIANT (DICE). The beats are ranked once, so a higher AMOUNT is the
 * same edits plus more of them, and AMOUNT 0 is the pattern exactly. The loop's first beat and
 * every crash are never touched.
 */
import { stream } from './rng';
import { clamp, safePitch, TPB, TPS, type BarRole, type BreakEvent, type Category } from './types';

export const DESTROY_STYLES = ['stutter', 'pitch', 'reverse', 'gate', 'chaos'] as const;
export type DestroyStyle = (typeof DESTROY_STYLES)[number];
export const DESTROY_STYLE_LABEL: Record<DestroyStyle, string> = { stutter: 'STUTTER', pitch: 'PITCH', reverse: 'REVERSE', gate: 'GATE', chaos: 'CHAOS' };

export const DESTROY_OPS = ['stutter', 'reverse', 'dive', 'rise', 'gate', 'skip', 'freeze', 'tapestop'] as const;
export type DestroyOp = (typeof DESTROY_OPS)[number];
export const DESTROY_OP_LABEL: Record<DestroyOp, string> = { stutter: 'STUTTER', reverse: 'REVERSE', dive: 'PITCH DIVE', rise: 'PITCH RISE', gate: 'GATE', skip: 'SKIP', freeze: 'FREEZE', tapestop: 'TAPE STOP' };

export interface DestroySettings {
  on: boolean;
  /** 0..1: how many beats are destroyed (0 = none) */
  amount: number;
  style: DestroyStyle;
  /** DICE: another take (0 = the first, from the BEAT seed) */
  variant: number;
}

export interface DestroyReport {
  beats: number;
  edited: number;
  ops: Partial<Record<DestroyOp, number>>;
}

export const defaultDestroy = (): DestroySettings => ({ on: false, amount: 0.3, style: 'stutter', variant: 0 });
export const destroyActive = (d: DestroySettings | undefined | null): d is DestroySettings => !!d && d.on && d.amount > 0;

export function sanitiseDestroy(v: unknown): DestroySettings | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<DestroySettings>;
  return {
    on: o.on === true,
    amount: clamp(Number(o.amount) || 0, 0, 1),
    style: (DESTROY_STYLES as readonly string[]).includes(String(o.style)) ? o.style! : 'stutter',
    variant: Math.max(0, Math.floor(Number(o.variant) || 0)) >>> 0,
  };
}

/** Which operations each STYLE leans on (CHAOS: all of them). */
const STYLE_OPS: Record<DestroyStyle, Partial<Record<DestroyOp, number>>> = {
  stutter: { stutter: 3, freeze: 1.5, skip: 1 },
  pitch: { dive: 2, rise: 1.5, tapestop: 1.5 },
  reverse: { reverse: 3, freeze: 0.8, stutter: 0.6 },
  gate: { gate: 3, skip: 1.5, stutter: 0.5 },
  chaos: { stutter: 1, reverse: 1, dive: 1, rise: 1, gate: 1, skip: 1, freeze: 1, tapestop: 1 },
};
/** How much each bar of the phrase may be destroyed. */
const BAR_WEIGHT: Record<BarRole, number> = { A: 0.7, A2: 0.9, B: 1.1, F: 1.2, T: 1.4 };
/** Which drum a stutter repeats, in order of preference. */
const LEAD: Category[] = ['snare', 'kick', 'perc', 'htom', 'mtom', 'ltom', 'open', 'hat', 'ride', 'ghost'];
/** A beat: the window DESTROY works on. */
const BEAT = 4 * TPS;
/** At most this many hits a destroyed beat (a stutter cannot flood the voice). */
const MAX_PER_BEAT = 16;

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const at = (e: BreakEvent, t: number, extra: Partial<BreakEvent> = {}): BreakEvent => {
  const bar = Math.floor(t / TPB);
  const step = Math.floor((t - bar * TPB) / TPS);
  return { ...e, bar, step, sub: t - bar * TPB - step * TPS, ...extra };
};
const pos = (t: number) => `${Math.floor(t / TPB) + 1}.${Math.floor((t % TPB) / BEAT) + 1}`;

export interface DestroyContext {
  plan: BarRole[];
  /** the BEAT seed */
  seed: number;
  bpm: number;
  /** ROLL GENERATION off (revision 1 on): no new rolls */
  noRolls: boolean;
}

export function destroy(source: readonly BreakEvent[], s: DestroySettings, ctx: DestroyContext): { events: BreakEvent[]; report: DestroyReport } {
  const bars = ctx.plan.length;
  const beats = bars * 4;
  const report: DestroyReport = { beats, edited: 0, ops: {} };
  if (!destroyActive(s)) return { events: source as BreakEvent[], report };
  const tag = s.variant ? `:${s.variant}` : '';
  // rank the beats once (weighted keys): AMOUNT takes the first ones, so more AMOUNT adds to the same edits
  const rank = stream(ctx.seed, `destroy-rank${tag}`);
  const keyed = Array.from({ length: beats }, (_, w) => {
    const u = Math.max(1e-9, rank.next());
    const weight = BAR_WEIGHT[ctx.plan[Math.floor(w / 4)] ?? 'A'] * (0.8 + 0.15 * (w % 4));
    return { w, key: w === 0 ? -Infinity : Math.log(u) / weight }; // the loop's first beat is never destroyed
  }).sort((a, b) => b.key - a.key);
  const count = Math.min(beats - 1, Math.round(s.amount * (beats - 1) * 0.65));
  const chosen = new Set(keyed.slice(0, count).map((k) => k.w));
  const ms = 60000 / ctx.bpm / (4 * TPS);
  const opsOf = STYLE_OPS[s.style];
  const opNames = DESTROY_OPS.filter((o) => (opsOf[o] ?? 0) > 0);

  let events = source.map((e) => ({ ...e }));
  for (const w of [...chosen].sort((a, b) => a - b)) {
    // each beat's operation and details come from its own stream: independent of AMOUNT and of the other beats
    const r = stream(ctx.seed, `destroy:${w}${tag}`);
    const opI = r.weighted(opNames.map((o) => opsOf[o]!));
    const op = opNames[Math.max(0, opI)]!;
    const w0 = w * BEAT;
    const w1 = w0 + BEAT;
    const inBeat = (e: BreakEvent) => tickOf(e) >= w0 && tickOf(e) < w1 && e.cat !== 'crash';
    const here = events.filter(inBeat);
    const rest = events.filter((e) => !inBeat(e));
    const label = `DESTROY ${DESTROY_OP_LABEL[op]} at ${pos(w0)}`;
    const why = (e: BreakEvent, note = '') => `${label}${note} (${e.why})`;
    let made: BreakEvent[] = here;
    if (op === 'stutter') {
      const lead = LEAD.find((c) => here.some((e) => e.cat === c));
      const grain = ctx.noRolls ? TPS : r.chance(0.5) ? TPS / 2 : TPS;
      const src = here.filter((e) => tickOf(e) < w0 + grain && (!lead || e.cat === lead || tickOf(e) === w0));
      if (src.length) {
        made = [];
        for (let k = 0, t = w0; t < w1 && made.length < MAX_PER_BEAT; k++, t += grain)
          for (const e of src) {
            if (tickOf(e) + k * grain >= w1) continue;
            const g = 0.92 ** k;
            made.push(at(e, tickOf(e) + k * grain, { vel: clamp(Math.round(e.vel * g), 1, 127), level: e.level * g, role: k ? (grain < TPS ? 'roll' : 'chop') : e.role, why: why(e, grain < TPS ? ' (1/32 retrigger)' : ' (1/16 repeat)') }));
          }
      }
    } else if (op === 'freeze') {
      const prev = events.filter((e) => tickOf(e) >= w0 - BEAT && tickOf(e) < w0 && e.cat !== 'crash');
      if (w > 0 && prev.length) made = prev.map((e) => at(e, tickOf(e) + BEAT, { role: e.role === 'roll' ? 'roll' : 'chop', vel: clamp(Math.round(e.vel * 0.95), 1, 127), why: why(e, ': the beat before, frozen') }));
    } else if (op === 'reverse') {
      const mirror = s.amount > 0.6;
      made = here.map((e) => {
        const t = tickOf(e);
        const step = mirror ? Math.floor((w0 + BEAT - 1 - (t - w0)) / TPS) * TPS + (t % TPS) : t;
        return at(e, Math.max(w0, Math.min(w1 - 1, step)), { reverse: true, why: why(e, mirror ? ': reversed and mirrored' : ': reversed') });
      });
    } else if (op === 'dive' || op === 'rise') {
      const depth = Math.round(5 + 7 * r.next() + 6 * s.amount);
      made = here.map((e) => {
        const f = (tickOf(e) - w0) / BEAT;
        return { ...e, pitch: safePitch((e.pitch ?? 0) + (op === 'dive' ? -1 : 1) * Math.round(depth * (0.25 + 0.75 * f))), why: why(e) };
      });
    } else if (op === 'gate') {
      // a 1/16 gate: the open sixteenths keep their hits, the closed ones lose them
      made = here.filter((e) => Math.floor((tickOf(e) - w0) / TPS) % 2 === 0).map((e) => ({ ...e, why: why(e, ' (gate approximated by removing the hits in its closed sixteenths)') }));
    } else if (op === 'skip') {
      made = here.filter((e) => tickOf(e) >= w0 + TPS).map((e) => at(e, tickOf(e) - TPS, { role: 'chop', why: why(e, ': a sixteenth skipped') }));
    } else if (op === 'tapestop') {
      // playback rate falling linearly to 0 over the beat: content c (0..½ of the beat) is heard at 1 - √(1 - 2c)
      made = [];
      for (const e of here) {
        const c = (tickOf(e) - w0) / BEAT;
        if (c > 0.48) continue;
        const tau = 1 - Math.sqrt(1 - 2 * c);
        const rate = Math.max(0.06, 1 - tau);
        const exact = w0 + tau * BEAT;
        const t = Math.min(w1 - 1, Math.floor(exact));
        made.push(at(e, t, { offsetMs: Math.round((e.offsetMs + (exact - t) * ms) * 10) / 10 || 0, pitch: safePitch((e.pitch ?? 0) + 12 * Math.log2(rate)), vel: clamp(Math.round(e.vel * Math.sqrt(rate)), 1, 127), level: e.level * Math.sqrt(rate), role: c ? 'chop' : e.role, why: why(e, ' (tape stop approximated per hit: later, lower and softer)') }));
      }
    }
    // one hit per drum and place (the louder), and the loop's first hit never early
    const seen = new Map<string, BreakEvent>();
    for (const e of made) {
      const k = `${e.cat}|${tickOf(e)}`;
      const had = seen.get(k);
      if (!had || e.vel > had.vel) seen.set(k, e);
    }
    made = [...seen.values()].slice(0, MAX_PER_BEAT);
    for (const e of made) if (tickOf(e) === 0) e.offsetMs = Math.max(0, e.offsetMs);
    events = rest.concat(made);
    report.edited++;
    report.ops[op] = (report.ops[op] ?? 0) + 1;
  }
  events.sort((a, b) => tickOf(a) - tickOf(b) || a.cat.localeCompare(b.cat));
  return { events, report };
}

/** One line on what DESTROY did. */
export function describeDestroy(r: DestroyReport | undefined, s?: DestroySettings): string {
  if (!s?.on) return 'DESTROY off.';
  if (!r || !r.edited) return 'DESTROY: nothing destroyed at this AMOUNT.';
  const ops = DESTROY_OPS.filter((o) => r.ops[o]).map((o) => `${r.ops[o]} ${DESTROY_OP_LABEL[o]}`);
  return `DESTROY: ${r.edited} of ${r.beats} beats (${ops.join(', ')}).`;
}

