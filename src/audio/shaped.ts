/**
 * DESTROY's sound shaping (destroy2.ts), as an instrument: a sample played with a partial reverse,
 * a gate, a fine detune or a continuous playback-rate ramp (TAPE STOP, a PITCH glide). It is
 * Slop Factory Core's SampleInstrument note, with those added, built from the same buffer and zone,
 * so live playback (player.ts) and the offline render (takeaway.ts) play exactly the same notes:
 * both resolve the instrument id through Ingredients.instrument, and the id carries the shaping
 * (fxSuffix below), in seconds at the tempo it is played at.
 *
 * Every start and every cut is faded (2 ms, or the gate's own fade), so nothing clicks.
 */
import { fadeOut, GainEnvelope, type Instrument, type NoteHandle, type NoteRequest } from '@slopfactory/core/audio';
import { playbackRate, region, velocityGain, type SampleInstrument } from '@slopfactory/core/sampler';
import type { BreakEvent } from '../engine/types';

const EDGE = 0.002;
const STOP_FADE = 0.005;

/** The shaping of one note, in seconds (what fxSuffix encodes). */
export interface Shape {
  /** partial reverse: the share of the (reversed) sound that plays, 0..1 */
  frac?: number;
  /** cents */
  detune?: number;
  /** gate: open for `len` s, closing over `fade` s; `chop` s = open and shut every `chop` s */
  gate?: { len: number; fade: number; chop?: number };
  /** rate ramp: from `from` to `to` over `len` s, then back to 1 over `back` s, or held (`hold`), or cut */
  tape?: { len: number; from: number; to: number; back?: number; hold?: boolean };
  /** the sound is a reversed copy (a gate then keeps its end) */
  rev?: boolean;
  /** OPEN-HAT CHOKE off: this closed hat does not cut a ringing open hat */
  free?: boolean;
}

/** The marker of a shaped instrument id: `<sample>[~rev]~fx:<json>`. */
export const FX = '~fx:';

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** The id suffix for an event's DESTROY shaping at a tempo ('' when there is none). */
export function fxSuffix(e: Pick<BreakEvent, 'revFrac' | 'detune' | 'gate' | 'tape' | 'free' | 'reverse'>, bpm: number): string {
  const q = 60 / bpm;
  const s: Shape = {};
  if (e.reverse && e.revFrac !== undefined && e.revFrac < 1) s.frac = r4(e.revFrac);
  if (e.detune) s.detune = Math.round(e.detune);
  if (e.gate) s.gate = { len: r4(e.gate.len * q), fade: r4(e.gate.fade * q), ...(e.gate.chop ? { chop: r4(e.gate.chop * q) } : {}) };
  if (e.tape) s.tape = { len: r4(e.tape.len * q), from: r4(e.tape.from), to: r4(e.tape.to), ...(e.tape.back ? { back: r4(e.tape.back * q) } : {}), ...(e.tape.hold ? { hold: true } : {}) };
  if (e.reverse && (s.gate || s.frac !== undefined)) s.rev = true;
  if (e.free) s.free = true;
  return Object.keys(s).length ? FX + JSON.stringify(s) : '';
}

/** The shaping in an id, and the id without it (null when the id has none or it cannot be read). */
export function parseFx(id: string): { base: string; shape: Shape } | null {
  const i = id.lastIndexOf(FX);
  if (i < 0) return null;
  try {
    const shape = JSON.parse(id.slice(i + FX.length)) as Shape;
    return shape && typeof shape === 'object' ? { base: id.slice(0, i), shape } : null;
  } catch {
    return null;
  }
}

/** Seconds of buffer consumed after `t` seconds of the rate envelope (rate x `base`). */
function consumed(sh: Shape['tape'], base: number, t: number): number {
  if (!sh) return base * t;
  const { len, from, to } = sh;
  const a = Math.min(t, len);
  let c = base * (from * a + ((to - from) * a * a) / (2 * len));
  if (t <= len) return c;
  if (sh.back) {
    const b = Math.min(t - len, sh.back);
    c += base * (to * b + ((1 - to) * b * b) / (2 * sh.back));
    if (t <= len + sh.back) return c;
    return c + base * (t - len - sh.back);
  }
  return sh.hold ? c + base * to * (t - len) : c;
}

/** The sampler note, shaped. */
export class ShapedInstrument implements Instrument {
  constructor(
    private readonly inst: SampleInstrument,
    private readonly shape: Shape,
  ) {}

  start(ctx: BaseAudioContext, out: AudioNode, note: NoteRequest): NoteHandle | null {
    const z = this.inst.zone;
    const buffer = this.inst.buffer;
    if (z.mute || buffer.length === 0) return null;
    const sh = this.shape;
    const r = region(z, buffer.duration);
    const rate = playbackRate(z, note.pitch) * 2 ** ((sh.detune ?? 0) / 1200);
    const t = note.time;
    const peak = z.volume * velocityGain(z, note.velocity) * (buffer.numberOfChannels === 1 ? Math.SQRT2 : 1);
    const loop = z.mode === 'loop';
    let from = r.start;
    if (sh.frac !== undefined && !loop) from = r.end - Math.max(0.001, sh.frac * (r.end - r.start));
    // a reversed sound that is gated keeps its end: the swell into the hit, not its tail
    if (sh.rev && sh.gate && !sh.gate.chop && !loop) from = Math.max(from, r.end - sh.gate.len * rate);
    const length = r.end - from;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const pr = src.playbackRate;
    if (sh.tape) {
      const tp = sh.tape;
      pr.setValueAtTime(rate * tp.from, t);
      pr.linearRampToValueAtTime(Math.max(0.01, rate * tp.to), t + tp.len);
      if (tp.back) pr.linearRampToValueAtTime(rate, t + tp.len + tp.back);
    } else pr.value = rate;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = z.pan;
    src.connect(g).connect(pan).connect(out);
    const env = new GainEnvelope();
    const fadeIn = from > r.start || r.trimmedStart ? EDGE : 0;
    if (fadeIn) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + fadeIn);
      env.set(t, 0).ramp(t + fadeIn, peak);
    } else {
      g.gain.setValueAtTime(peak, t);
      env.set(t, peak);
    }

    // when the sound ends: the buffer runs out (through the rate envelope), a tape CUT, or the gate
    let end = Infinity;
    if (loop) {
      src.loop = true;
      src.loopStart = r.loopStart;
      src.loopEnd = r.loopEnd;
      src.start(t, r.start);
    } else {
      src.start(t, from, length);
      // the time at which `length` seconds of buffer are used up (bisection over the envelope)
      let lo = 0;
      let hi = length / Math.max(0.01, rate * 0.01) + 1;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (consumed(sh.tape, rate, mid) < length) lo = mid;
        else hi = mid;
      }
      end = t + hi;
      if (sh.tape && !sh.tape.back && !sh.tape.hold) end = Math.min(end, t + sh.tape.len);
    }
    if (sh.gate) {
      const gt = sh.gate;
      if (gt.chop) {
        // RHYTHMIC: open and shut every `chop` seconds while it rings
        const stopAt = Number.isFinite(end) ? end : t + 2;
        for (let k = 0; t + (2 * k + 1) * gt.chop < stopAt && k < 64; k++) {
          const close = t + (2 * k + 1) * gt.chop;
          const open = close + gt.chop;
          const f = Math.min(Math.max(EDGE, gt.fade), gt.chop / 2);
          g.gain.setValueAtTime(peak, close - f);
          g.gain.linearRampToValueAtTime(0, close);
          env.set(close - f, peak).ramp(close, 0);
          if (open < stopAt) {
            g.gain.setValueAtTime(0, open);
            g.gain.linearRampToValueAtTime(peak, open + EDGE);
            env.set(open, 0).ramp(open + EDGE, peak);
          }
        }
      } else end = Math.min(end, t + gt.len);
    }
    if (Number.isFinite(end)) {
      const f = sh.gate && !sh.gate.chop ? Math.min(Math.max(EDGE, sh.gate.fade), Math.max(EDGE, end - t - fadeIn)) : EDGE;
      if (end - t > f + fadeIn) {
        g.gain.setValueAtTime(peak, end - f);
        g.gain.linearRampToValueAtTime(0, end);
        env.set(end - f, peak).ramp(end, 0);
      }
      src.stop(end + 0.001);
    }
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      pan.disconnect();
    };
    const handle: NoteHandle & { end: number } = {
      end,
      release(time: number) {
        if (z.mode === 'oneshot' || time >= handle.end) return;
        const stopAt = Math.max(time, t) + z.release;
        fadeOut(g.gain, Math.max(time, t), z.release, env);
        src.stop(stopAt);
        handle.end = Math.min(handle.end, stopAt);
      },
      stop(time: number, fade = STOP_FADE) {
        if (time >= handle.end) return;
        const at = Math.max(time, t);
        const fd = Math.max(0.001, fade);
        fadeOut(g.gain, at, fd, env);
        src.stop(at + fd + 0.001);
        handle.end = at + fd + 0.001;
      },
    };
    return handle;
  }
}
