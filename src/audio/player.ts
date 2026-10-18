/**
 * Live playback. Hits are scheduled ahead on the AudioContext clock (a short look-ahead driven
 * by a timer), so sample-accurate Web Audio timing does the triggering, not JavaScript timers.
 * Playback goes through Slop Factory Core's Mixer and NotePlayer: the same instruments, voices
 * and choke groups the offline renderer uses for TAKEAWAY.
 *
 * A new break (BAKE, or choosing a BATCH candidate) waits for the loop point while playing, so
 * the music never jumps mid-bar. SOLO and MUTE use Core's mixer gates, so they act at once, also
 * on sounds already ringing, and never change the break's events.
 *
 * MIDI: the same schedule also goes out as MIDI (midi/router.ts), every hit of the score (sampled
 * or not), stamped in performance.now() time so it is heard together with the audio. Musical time
 * is kept in quarter notes from the start of playback and mapped to audio time through an anchor:
 * with the INTERNAL clock the anchor moves only when the tempo changes (a new break, at the loop
 * point); with an EXTERNAL MIDI clock (midi/clockIn.ts) every incoming pulse is an anchor, so the
 * break follows the sequencer's tempo and never drifts from it. The internal clock can be sent
 * out (MIDI Clock with Start and Stop).
 */
import { Mixer, NotePlayer } from '@slopfactory/core/audio';
import { CATEGORIES, type Break, type BreakEvent } from '../engine/types';
import { audible, emptyMix, type MixState } from '../app/mix';
import { CLOCK, CLOCK_PPQ, START, STOP, songPosition } from '../midi/messages';
import type { MidiRouter } from '../midi/router';
import type { Ingredients } from './ingredients';
import { CORE_PPQ, eventTick, hatChoke, ROOT_PITCH } from './timeline';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
export const LIVE_SAMPLE_RATE = 44100;
export const DEFAULT_LEVEL = 0.45;
/** MIDI note length: a 64th note, as in the MIDI file. */
export const GATE_QUARTERS = 1 / 16;
/** Hits on the same MIDI key closer than this (quarter notes: one tick at 960 PPQ, as in the file) are sent once. */
const SAME_TIME = 960;
/** EXTERNAL clock: never schedule further than this past the last pulse received (a stopped clock stops the music). */
const EXT_MAX_AHEAD_PULSES = 12;
/**
 * EXTERNAL clock: a hit due up to this long ago still plays (at once). On Start the downbeat is
 * only known when its pulse arrives, already in the past by the audio output latency; after
 * that the look-ahead keeps every hit on time.
 */
const EXT_LATE = 0.06;

interface Scheduled {
  /** quarter notes from the start of the loop (swing and microtiming included) */
  q: number;
  e: BreakEvent;
  /** sent as MIDI (false when the track is not routed or muted, or a louder hit on the same key at the same time is sent instead) */
  midi: boolean;
}

export type ClockMode = 'internal' | 'external';

/** A timer that keeps running in background tabs (a Worker's timers are throttled less). */
function makeTicker(fn: () => void): { stop(): void } {
  try {
    const src = `let t=setInterval(()=>postMessage(0),${TICK_MS});onmessage=()=>{clearInterval(t);close()}`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = fn;
    return { stop: () => w.postMessage(0) };
  } catch {
    const t = setInterval(fn, TICK_MS);
    return { stop: () => clearInterval(t) };
  }
}

export class Player {
  ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private notes: NotePlayer | null = null;
  /** previews (INGREDIENTS ▶, clicking a hit) bypass solo/mute: a second, ungated mixer */
  private previewMixer: Mixer | null = null;
  private preview: NotePlayer | null = null;
  private ticker: { stop(): void } | null = null;
  private current: Break | null = null;
  private pending: Break | null = null;
  private list: Scheduled[] = [];
  private idx = 0;
  /** musical position (quarters from the start of playback) where the current loop began */
  private loopStartQ = 0;
  /** position of the last hit scheduled */
  private scheduledQ = 0;
  /** quarter `q` is heard at audio time `t`; `spq` seconds per quarter from there */
  private anchor = { q: 0, t: 0 };
  private spq = 0.5;
  /** the next MIDI Clock pulse to send (internal clock) */
  private clockPulse = 0;
  /** the last external pulse received (-1: none yet since Start or Continue) */
  private extPulse = -1;
  /** performance.now() milliseconds minus audio-context milliseconds, as heard (smoothed) */
  private perfOffset: number | null = null;
  private seq = 0;
  playing = false;
  loop = true;
  level = DEFAULT_LEVEL;
  /** where musical time comes from (midi/rig.ts sets it) */
  clock: ClockMode = 'internal';
  /** live MIDI out (null: MIDI is off) */
  midi: MidiRouter | null = null;
  private mix: MixState = emptyMix();
  onState: () => void = () => {};
  /** a pending break became current (at the loop point) */
  onSwap: (b: Break) => void = () => {};

  constructor(private ingredients: Ingredients) {}

  /** Create or resume the audio context (must follow a user gesture). */
  async ensure(): Promise<boolean> {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: LIVE_SAMPLE_RATE });
      } catch {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      }
      this.mixer = new Mixer(this.ctx, { voices: [...CATEGORIES], masterGain: this.level, fxAvailable: false });
      this.mixer.output.connect(this.ctx.destination);
      this.applyMix();
      this.notes = new NotePlayer(this.ctx, this.mixer, (_voice, note) => this.ingredients.instrument(note.instrument), { maxPerVoice: 16, choke: hatChoke });
      this.previewMixer = new Mixer(this.ctx, { voices: [...CATEGORIES], masterGain: this.level, fxAvailable: false });
      this.previewMixer.output.connect(this.ctx.destination);
      this.preview = new NotePlayer(this.ctx, this.previewMixer, (_voice, note) => this.ingredients.instrument(note.instrument), { maxPerVoice: 4, choke: hatChoke });
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === 'running';
  }

  setLevel(v: number): void {
    this.level = v;
    this.mixer?.setMasterGain(v);
    this.previewMixer?.setMasterGain(v);
  }

  /** SOLO / MUTE per category (Core's mixer: any solo wins; otherwise muted voices are silent). MIDI out follows. */
  setMix(mix: MixState): void {
    this.mix = JSON.parse(JSON.stringify(mix)) as MixState;
    this.applyMix();
    this.markMidi();
  }

  private applyMix(): void {
    if (!this.mixer) return;
    for (const c of CATEGORIES) this.mixer.setStrip(c, { mute: this.mix[c].mute, solo: this.mix[c].solo });
  }

  private build(b: Break): void {
    this.current = b;
    const bpm = b.recipe.bpm;
    // every hit: the sampled ones play here, and all of them go out as MIDI
    this.list = b.events.map((e) => ({ q: eventTick(e, bpm) / CORE_PPQ, e, midi: false })).sort((x, y) => x.q - y.q);
    this.markMidi();
    this.idx = 0;
  }

  /** Which hits go out as MIDI: audible, routed, and one per key and moment (the louder), as in the MIDI file. */
  private markMidi(): void {
    const best = new Map<string, Scheduled>();
    for (const s of this.list) {
      s.midi = false;
      const key = this.midi && audible(this.mix, s.e.cat) ? this.midi.routeKey(s.e.cat) : null;
      if (!key) continue;
      const id = `${Math.round(s.q * SAME_TIME)}:${key}`;
      const had = best.get(id);
      if (!had || s.e.vel > had.e.vel) best.set(id, s);
    }
    for (const s of best.values()) s.midi = true;
  }

  /** The MIDI routing changed (midi/rig.ts): hits still to come follow the new one. */
  rerouted(): void {
    this.markMidi();
  }

  private loopQuarters(b: Break): number {
    return b.recipe.bars * 4;
  }

  /** Audio time of a musical position. */
  private time(q: number): number {
    return this.anchor.t + (q - this.anchor.q) * this.spq;
  }

  /** Musical position heard at an audio time. */
  private quarterAt(t: number): number {
    return this.anchor.q + (t - this.anchor.t) / this.spq;
  }

  /** Measure how performance.now() relates to the audio clock (as heard), so MIDI and audio come out together. */
  private syncClocks(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const off = ts && ts.performanceTime && ts.contextTime ? ts.performanceTime - ts.contextTime * 1000 : now - (ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;
    // the mapping wobbles by a fraction of a millisecond, and can jump once (about 20 ms) as output starts
    if (this.perfOffset === null || Math.abs(off - this.perfOffset) > 15) this.perfOffset = off;
    else this.perfOffset += (off - this.perfOffset) * 0.05;
  }

  /** performance.now() time at which audio time `t` is heard. */
  perfTime(t: number): number {
    if (this.perfOffset === null) this.syncClocks();
    return (this.perfOffset ?? 0) + t * 1000;
  }

  /** Audio time heard at performance.now() time `ms`. */
  audioTime(ms: number): number {
    if (this.perfOffset === null) this.syncClocks();
    return (ms - (this.perfOffset ?? 0)) / 1000;
  }

  private sendClock(bytes: number[], t: number): void {
    if (this.clock === 'internal') this.midi?.clock(bytes, this.perfTime(t));
  }

  async play(b: Break): Promise<boolean> {
    if (!(await this.ensure())) return false;
    this.stop();
    this.build(b);
    this.pending = null;
    this.syncClocks();
    this.anchor = { q: 0, t: this.ctx!.currentTime + 0.06 };
    this.spq = 60 / b.recipe.bpm;
    this.loopStartQ = 0;
    this.scheduledQ = 0;
    this.clockPulse = 0;
    this.extPulse = -1;
    this.playing = true;
    this.sendClock([START], this.anchor.t);
    this.ticker = makeTicker(() => this.pump());
    this.pump();
    this.onState();
    return true;
  }

  /**
   * EXTERNAL clock (Start, or Continue): play from pulse `from` (24 per quarter from the start of
   * the song) as the pulses arrive. A Continue mid-loop starts at the right place in the break.
   */
  async follow(b: Break, from: number): Promise<boolean> {
    if (!(await this.ensure())) return false;
    this.stop();
    this.build(b);
    this.pending = null;
    this.syncClocks();
    const q = Math.max(0, from) / CLOCK_PPQ;
    const len = this.loopQuarters(b);
    this.loopStartQ = Math.floor(q / len + 1e-9) * len;
    this.idx = this.list.findIndex((s) => this.loopStartQ + s.q >= q - 1e-9);
    if (this.idx < 0) this.idx = this.list.length;
    this.scheduledQ = q;
    this.spq = 60 / b.recipe.bpm;
    this.anchor = { q, t: this.ctx!.currentTime + 0.05 };
    this.extPulse = -1;
    this.playing = true;
    this.ticker = makeTicker(() => this.pump());
    this.onState();
    return true;
  }

  /** EXTERNAL clock: pulse `n` was received at performance.now() time `ms`; `periodMs`, the measured pulse period. */
  pulse(n: number, ms: number, periodMs: number | null): void {
    if (!this.playing || this.clock !== 'external' || !this.ctx) return;
    this.syncClocks();
    if (periodMs !== null && periodMs > 0) this.spq = (periodMs * CLOCK_PPQ) / 1000;
    this.anchor = { q: n / CLOCK_PPQ, t: this.audioTime(ms) };
    this.extPulse = n;
    this.pump();
  }

  /** EXTERNAL clock lost while playing: end every MIDI note; nothing more is scheduled until pulses return. */
  clockLost(): void {
    this.midi?.releaseAll(false);
  }

  /** Change the break: at the loop point while playing, else at once. */
  setBreak(b: Break): void {
    if (this.playing) this.pending = b;
    else this.current = b;
  }

  /**
   * The same break, edited by hand: heard from the next unscheduled hit, not at the loop point
   * (hits already scheduled, at most the look-ahead of 150 ms, still play). A change of length
   * waits for the loop point like a new break.
   */
  update(b: Break): void {
    if (!this.playing || !this.ctx || !this.current) {
      this.current = b;
      this.pending = null;
      return;
    }
    if (b.recipe.bars !== this.current.recipe.bars || b.recipe.bpm !== this.current.recipe.bpm || this.pending) {
      this.pending = b;
      return;
    }
    const done = this.idx >= this.list.length;
    this.build(b);
    if (done) this.idx = this.list.length;
    else {
      const until = this.scheduledQ - this.loopStartQ;
      this.idx = this.list.findIndex((x) => x.q > until + 1e-9);
      if (this.idx < 0) this.idx = this.list.length;
    }
  }

  stop(): void {
    this.ticker?.stop();
    this.ticker = null;
    if (this.ctx && this.notes) this.notes.stopAll(this.ctx.currentTime);
    // every MIDI note ends: queued note-ons are dropped where the browser can, note-offs follow the rest
    this.midi?.releaseAll(true);
    if (this.playing) {
      this.playing = false;
      if (this.ctx && this.clock === 'internal' && this.midi) {
        const t = this.ctx.currentTime;
        this.sendClock([STOP], t);
        this.sendClock(songPosition(0), t);
      }
      if (this.pending) {
        this.current = this.pending;
        this.onSwap(this.pending);
        this.pending = null;
      }
      this.onState();
    }
  }

  /** The ticker: schedule everything up to the look-ahead. */
  pump(): void {
    const ctx = this.ctx;
    if (!ctx || !this.current || !this.playing) return;
    if (this.clock === 'external' && this.extPulse < 0) return;
    this.syncClocks();
    let horizon = this.quarterAt(ctx.currentTime + LOOKAHEAD);
    if (this.clock === 'external') horizon = Math.min(horizon, (this.extPulse + EXT_MAX_AHEAD_PULSES) / CLOCK_PPQ);
    this.advance(horizon);
  }

  private advance(horizon: number): void {
    const ctx = this.ctx!;
    for (let guard = 0; guard < 4000; guard++) {
      if (this.idx >= this.list.length) {
        const end = this.loopStartQ + this.loopQuarters(this.current!);
        if (end > horizon) break;
        if (!this.loop) {
          this.flushClock(end, false);
          // let the last hits ring, then stop
          if (ctx.currentTime > this.time(end) + 0.05) {
            this.ticker?.stop();
            this.ticker = null;
            this.playing = false;
            this.midi?.releaseAll(false);
            this.sendClock([STOP], ctx.currentTime);
            this.onState();
          }
          return;
        }
        // clock pulses before the loop point keep the old tempo
        this.flushClock(end, false);
        this.loopStartQ = end;
        if (this.pending) {
          const p = this.pending;
          this.pending = null;
          if (this.clock === 'internal' && p.recipe.bpm !== this.current!.recipe.bpm) {
            this.anchor = { q: end, t: this.time(end) };
            this.spq = 60 / p.recipe.bpm;
          }
          this.build(p);
          this.onSwap(p);
        } else this.idx = 0;
        continue;
      }
      const s = this.list[this.idx]!;
      const q = this.loopStartQ + s.q;
      if (q > horizon) break;
      this.flushClock(q, true);
      const t = this.time(q);
      this.scheduledQ = q;
      if (t >= ctx.currentTime - (this.clock === 'external' ? EXT_LATE : 0.005)) {
        const at = Math.max(t, ctx.currentTime);
        if (s.e.sample) this.trigger(s.e.cat, s.e.sample, s.e.vel, at);
        if (s.midi) this.midi?.hit(s.e.cat, s.e.vel, this.perfTime(at), this.perfTime(this.time(q + GATE_QUARTERS)));
      }
      this.idx++;
    }
    this.flushClock(horizon, false);
    this.midi?.flush(this.perfTime(this.time(horizon)));
  }

  /** INTERNAL clock out: the MIDI Clock pulses up to a position. */
  private flushClock(until: number, inclusive: boolean): void {
    if (this.clock !== 'internal' || !this.midi?.settings.clockOut) return;
    while (inclusive ? this.clockPulse / CLOCK_PPQ <= until + 1e-9 : this.clockPulse / CLOCK_PPQ < until - 1e-9) {
      this.sendClock([CLOCK], this.time(this.clockPulse / CLOCK_PPQ));
      this.clockPulse++;
    }
  }

  private trigger(voice: string, sample: string, vel: number, time: number): void {
    const key = `n${this.seq++}`;
    this.notes!.noteOn(key, voice, { time, pitch: ROOT_PITCH, velocity: vel, instrument: sample });
  }

  /** Play one sample now (INGREDIENTS preview, clicking a hit in the pattern). */
  async audition(voice: string, sample: string, vel = 110): Promise<void> {
    if (!(await this.ensure())) return;
    this.preview!.noteOn(`p${this.seq++}`, voice, { time: this.ctx!.currentTime + 0.005, pitch: ROOT_PITCH, velocity: vel, instrument: sample });
  }

  /**
   * A hit played live (MIDI input), now, through the main mixer so SOLO and MUTE apply. False when
   * audio has not started (the browser starts it only after a click or key on the page).
   */
  live(voice: string, sample: string, vel: number): boolean {
    if (!this.ctx || this.ctx.state !== 'running' || !this.notes) return false;
    this.trigger(voice, sample, vel, this.ctx.currentTime);
    return true;
  }

  /** Current position: bar index and fractional sixteenth, or null when stopped. */
  position(): { loop: number; frac: number } | null {
    if (!this.playing || !this.ctx || !this.current) return null;
    if (this.clock === 'external' && this.extPulse < 0) return { loop: 0, frac: 0 };
    const len = this.loopQuarters(this.current);
    const q = this.quarterAt(this.ctx.currentTime - (this.ctx.outputLatency || 0)) - this.loopStartQ;
    const frac = q < 0 ? (q + len) / len : q / len;
    return { loop: 0, frac: Math.max(0, Math.min(0.99999, frac)) };
  }

  /** The bar now playing, or null when stopped (PER BAR picks for live hits). */
  currentBar(): number | null {
    const p = this.position();
    return p && this.current ? Math.min(this.current.recipe.bars - 1, Math.floor(p.frac * this.current.recipe.bars)) : null;
  }

  /** a new break is waiting for the loop point */
  get queued(): boolean {
    return !!this.pending;
  }

  get break(): Break | null {
    return this.current;
  }
}
