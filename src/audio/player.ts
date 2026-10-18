/**
 * Live playback. Hits are scheduled ahead on the AudioContext clock (a short look-ahead driven
 * by a timer), so sample-accurate Web Audio timing does the triggering, not JavaScript timers.
 * Playback goes through Slop Factory Core's Mixer and NotePlayer: the same instruments, voices
 * and choke groups the offline renderer uses for TAKEAWAY.
 *
 * A new break (BAKE, or choosing a BATCH candidate) waits for the loop point while playing, so
 * the music never jumps mid-bar. SOLO and MUTE use Core's mixer gates, so they act at once, also
 * on sounds already ringing, and never change the break's events.
 */
import { Mixer, NotePlayer } from '@slopfactory/core/audio';
import { CATEGORIES, type Break } from '../engine/types';
import { emptyMix, type MixState } from '../app/mix';
import type { Ingredients } from './ingredients';
import { eventSeconds, hatChoke, loopSeconds, ROOT_PITCH } from './timeline';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
export const LIVE_SAMPLE_RATE = 44100;
export const DEFAULT_LEVEL = 0.45;

interface Scheduled {
  sec: number;
  e: Break['events'][number];
}

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
  private loopStart = 0;
  private seq = 0;
  playing = false;
  loop = true;
  level = DEFAULT_LEVEL;
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

  /** SOLO / MUTE per category (Core's mixer: any solo wins; otherwise muted voices are silent). */
  setMix(mix: MixState): void {
    this.mix = JSON.parse(JSON.stringify(mix)) as MixState;
    this.applyMix();
  }

  private applyMix(): void {
    if (!this.mixer) return;
    for (const c of CATEGORIES) this.mixer.setStrip(c, { mute: this.mix[c].mute, solo: this.mix[c].solo });
  }

  private build(b: Break): void {
    this.current = b;
    const bpm = b.recipe.bpm;
    this.list = b.events
      .filter((e) => e.sample)
      .map((e) => ({ sec: eventSeconds(e, bpm), e }))
      .sort((x, y) => x.sec - y.sec);
    this.idx = 0;
  }

  async play(b: Break): Promise<boolean> {
    if (!(await this.ensure())) return false;
    this.stop();
    this.build(b);
    this.pending = null;
    this.loopStart = this.ctx!.currentTime + 0.06;
    this.playing = true;
    this.ticker = makeTicker(() => this.pump());
    this.pump();
    this.onState();
    return true;
  }

  /** Change the break: at the loop point while playing, else at once. */
  setBreak(b: Break): void {
    if (this.playing) this.pending = b;
    else this.current = b;
  }

  stop(): void {
    this.ticker?.stop();
    this.ticker = null;
    if (this.ctx && this.notes) this.notes.stopAll(this.ctx.currentTime);
    if (this.playing) {
      this.playing = false;
      if (this.pending) {
        this.current = this.pending;
        this.onSwap(this.pending);
        this.pending = null;
      }
      this.onState();
    }
  }

  private pump(): void {
    const ctx = this.ctx;
    const b = this.current;
    if (!ctx || !b || !this.playing) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (let guard = 0; guard < 2000; guard++) {
      if (this.idx >= this.list.length) {
        const end = this.loopStart + loopSeconds(this.current!);
        if (end > horizon) return;
        if (!this.loop) {
          // let the last hits ring, then stop
          if (ctx.currentTime > end + 0.05) {
            this.ticker?.stop();
            this.ticker = null;
            this.playing = false;
            this.onState();
          }
          return;
        }
        this.loopStart = end;
        if (this.pending) {
          const p = this.pending;
          this.pending = null;
          this.build(p);
          this.onSwap(p);
        } else this.idx = 0;
        continue;
      }
      const s = this.list[this.idx]!;
      const t = this.loopStart + s.sec;
      if (t > horizon) return;
      if (t >= ctx.currentTime - 0.005) this.trigger(s.e.cat, s.e.sample!, s.e.vel, Math.max(t, ctx.currentTime));
      this.idx++;
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

  /** Current position: bar index and fractional sixteenth, or null when stopped. */
  position(): { loop: number; frac: number } | null {
    if (!this.playing || !this.ctx || !this.current) return null;
    const len = loopSeconds(this.current);
    const t = this.ctx.currentTime - (this.ctx.outputLatency || 0) - this.loopStart;
    const frac = t < 0 ? (t + len) / len : t / len;
    return { loop: 0, frac: Math.max(0, Math.min(0.99999, frac)) };
  }

  /** a new break is waiting for the loop point */
  get queued(): boolean {
    return !!this.pending;
  }

  get break(): Break | null {
    return this.current;
  }
}
