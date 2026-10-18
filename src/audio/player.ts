/**
 * Live playback. Hits are scheduled ahead on the AudioContext clock (a short look-ahead driven
 * by a timer), so sample-accurate Web Audio timing does the triggering, not JavaScript timers.
 * Playback goes through Slop Factory Core's Mixer and NotePlayer: the same instruments, voices
 * and choke groups the offline renderer uses for TAKEAWAY.
 *
 * OUTPUT: the master output chain (audio/output.ts) runs between the mixer and MASTER LEVEL.
 *
 * Pattern requests use a safe bar, loop or immediate boundary beyond scheduled audio. SOLO and MUTE use Core's mixer gates, so they act at once, also
 * on sounds already ringing, and never change the break's events.
 *
 * MIDI: the same schedule also goes out as MIDI (midi/router.ts), every hit of the score (sampled
 * or not), stamped in performance.now() time so it is heard together with the audio. The schedule
 * runs on SONG TIME: with the INTERNAL clock that is the audio clock itself; with an EXTERNAL MIDI
 * clock (midi/clockIn.ts) every incoming pulse anchors song time to audio time, so the break
 * follows the sequencer's tempo and never drifts from it. The internal clock can be sent out (MIDI
 * Clock with Start and Stop).
 */
import { Mixer, NotePlayer } from '@slopfactory/core/audio';
import { emptyChain, loadOutputChain, type ChainConfig } from '@slopfactory/core/engines';
import { CATEGORIES, type Break } from '../engine/types';
import { audible as isAudible, emptyMix, mixerStrips, safeGain, sanitiseMix, type MixState } from '../app/mix';
import { CLOCK, CLOCK_PPQ, START, STOP, songPosition } from '../midi/messages';
import type { MidiRouter } from '../midi/router';
import type { Ingredients } from './ingredients';
import { eventSeconds, hatChoke, ROOT_PITCH } from './timeline';
import { CHAIN_WORKLET_URL, OUTPUT_SEED } from './output';

export type SwitchMode = 'bar' | 'loop' | 'immediate';
const LOOKAHEAD = 0.15;
const TICK_MS = 25;
export const LIVE_SAMPLE_RATE = 44100;
export const DEFAULT_LEVEL = 1;
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
  sec: number;
  e: Break['events'][number];
  /** sent as MIDI (false when the track is not routed or not audible, or a louder hit on the same key at the same time is sent instead) */
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
  private meters = new Map<string, { nodes: AnalyserNode[]; data: Float32Array<ArrayBuffer>; peak: number }>();
  private masterSplit: ChannelSplitterNode | null = null;
  private attachMeter(id: string, source: AudioNode, output?: number): void {
    const nodes: AnalyserNode[] = [];
    const split = output === undefined ? this.ctx!.createChannelSplitter(2) : null;
    if (split) source.connect(split);
    for (let c = 0; c < (split ? 2 : 1); c++) {
      const node = this.ctx!.createAnalyser(); node.fftSize = 1024;
      (split ?? source).connect(node, split ? c : output!); nodes.push(node);
    }
    this.meters.set(id, { nodes, data: new Float32Array(1024), peak: 0 });
  }
  meter(id: string): number {
    const m = this.meters.get(id); if (!m) return 0;
    if (!this.playing) return m.peak = 0;
    let peak = 0;
    for (const node of m.nodes) {
      node.getFloatTimeDomainData(m.data);
      for (const v of m.data) peak = Math.max(peak, Math.abs(v));
    }
    return m.peak = Math.max(peak, m.peak * 0.85);
  }
  /** Ingredient and hit previews bypass the transport's channel mix. */
  private previewMixer: Mixer | null = null;
  private preview: NotePlayer | null = null;
  private ticker: { stop(): void } | null = null;
  private current: Break | null = null;
  private pending: Break | null = null;
  private switchAt = Infinity;
  private audible: Break | null = null;
  private audibleStart = 0;
  private activations: { b: Break; time: number; start: number }[] = [];
  switchMode: SwitchMode = 'bar';
  private tempo = 120;
  private list: Scheduled[] = [];
  private idx = 0;
  private loopStart = 0;
  /** audio time up to which hits are already scheduled */
  private scheduledUntil = 0;
  private seq = 0;
  /** song time = sync.song + (audio time - sync.audio) * sync.rate (INTERNAL: the identity) */
  private sync = { song: 0, audio: 0, rate: 1 };
  /** the next MIDI Clock pulse to send (INTERNAL clock), counted from `clockStart` */
  private clockPulse = 0;
  private clockStart = 0;
  /** the last external pulse received (-1: none yet since Start or Continue) */
  private extPulse = -1;
  /** performance.now() milliseconds minus audio-context milliseconds, as heard (smoothed) */
  private perfOffset: number | null = null;
  /** where musical time comes from (app/midi.ts sets it) */
  clock: ClockMode = 'internal';
  /** live MIDI out (null: MIDI is off) */
  midi: MidiRouter | null = null;
  playing = false;
  loop = true;
  level = DEFAULT_LEVEL;
  private mix: MixState = emptyMix();
  private output: ChainConfig = emptyChain();
  /** false until the output chain's worklet has loaded (or when the browser cannot run it) */
  outputProcessing = false;
  private building: Promise<void> | null = null;
  onState: () => void = () => {};
  /** A scheduled replacement has reached the audio clock. */
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
      this.building = this.buildGraph(this.ctx);
    }
    // resume first: the gesture that allows it must not wait behind the worklet
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    await this.building;
    return this.ctx.state === 'running';
  }

  /** The playback graph: transport mixer (with the OUTPUT chain) and the preview mixer. */
  private async buildGraph(ctx: AudioContext): Promise<void> {
    const chainAvailable = await loadOutputChain(ctx, CHAIN_WORKLET_URL);
    this.outputProcessing = chainAvailable;
    this.mixer = new Mixer(ctx, { voices: [...CATEGORIES], masterGain: this.level, fxAvailable: false, seed: OUTPUT_SEED, masterChain: this.output, chainAvailable });
    this.mixer.output.connect(ctx.destination);
    this.applyMix();
    for (const c of CATEGORIES) this.attachMeter(c, this.mixer.processedTap(c));
    this.masterSplit = ctx.createChannelSplitter(2);
    this.mixer.output.connect(this.masterSplit);
    this.attachMeter('L', this.masterSplit, 0); this.attachMeter('R', this.masterSplit, 1);
    this.notes = new NotePlayer(ctx, this.mixer, (_voice, note) => this.ingredients.instrument(note.instrument), { maxPerVoice: 16, choke: hatChoke });
    // previews (ingredients, a clicked hit) skip the channel mix and the OUTPUT chain
    this.previewMixer = new Mixer(ctx, { voices: [...CATEGORIES], masterGain: this.level, fxAvailable: false });
    this.previewMixer.output.connect(ctx.destination);
    this.preview = new NotePlayer(ctx, this.previewMixer, (_voice, note) => this.ingredients.instrument(note.instrument), { maxPerVoice: 4, choke: hatChoke });
    this.onState();
  }

  /** The OUTPUT chain changed: heard at once, crossfaded (no click). */
  setOutput(config: ChainConfig): void {
    this.output = config;
    this.mixer?.setMasterChain(config);
  }

  setLevel(v: number): void {
    v = safeGain(v);
    this.level = v;
    this.mixer?.setMasterGain(v);
    this.previewMixer?.setMasterGain(v);
  }

  /** One authoritative mix; gates are resolved with mute priority before passing to Core. MIDI out follows. */
  setMix(mix: MixState): void {
    this.mix = sanitiseMix(mix);
    this.applyMix();
    this.markMidi();
  }

  private applyMix(): void {
    if (!this.mixer) return;
    const strips = mixerStrips(this.mix);
    for (const c of CATEGORIES) this.mixer.setStrip(c, strips[c]!);
  }

  private build(b: Break): void {
    this.current = b;
    const bpm = this.playing ? this.tempo : b.recipe.bpm;
    // every hit: the sampled ones play here, and all of them go out as MIDI
    this.list = b.events
      .map((e) => ({ sec: eventSeconds(e, bpm), e, midi: false }))
      .sort((x, y) => x.sec - y.sec);
    this.markMidi();
    this.idx = 0;
  }

  /** Which hits go out as MIDI: audible, routed, and one per key and moment (the louder), as in the MIDI file. */
  private markMidi(): void {
    const best = new Map<string, Scheduled>();
    const quarter = 60 / (this.playing ? this.tempo : (this.current?.recipe.bpm ?? this.tempo));
    for (const s of this.list) {
      s.midi = false;
      const key = this.midi && isAudible(this.mix, s.e.cat) ? this.midi.routeKey(s.e.cat) : null;
      if (!key) continue;
      const id = `${Math.round((s.sec / quarter) * SAME_TIME)}:${key}`;
      const had = best.get(id);
      if (!had || s.e.vel > had.e.vel) best.set(id, s);
    }
    for (const s of best.values()) s.midi = true;
  }

  /** The MIDI routing changed (app/midi.ts): hits still to come follow the new one. */
  rerouted(): void {
    this.markMidi();
  }

  // ---------------------------------------------------------------- clocks

  private toSong(audioTime: number): number {
    return this.sync.song + (audioTime - this.sync.audio) * this.sync.rate;
  }

  private toAudio(songTime: number): number {
    return this.sync.audio + (songTime - this.sync.song) / this.sync.rate;
  }

  /** Song time now (the audio clock, with the INTERNAL clock). */
  private songNow(): number {
    return this.toSong(this.ctx!.currentTime);
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

  private get pulseSeconds(): number {
    return 60 / this.tempo / CLOCK_PPQ;
  }

  private sendClock(bytes: number[], audioTime: number): void {
    if (this.clock === 'internal') this.midi?.clock(bytes, this.perfTime(audioTime));
  }

  /** INTERNAL clock out: the MIDI Clock pulses up to a song time. */
  private flushClock(until: number, inclusive: boolean): void {
    if (this.clock !== 'internal' || !this.midi?.settings.clockOut) return;
    for (;;) {
      const t = this.clockStart + this.clockPulse * this.pulseSeconds;
      if (inclusive ? t > until + 1e-9 : t >= until - 1e-9) return;
      this.sendClock([CLOCK], this.toAudio(t));
      this.clockPulse++;
    }
  }

  // ---------------------------------------------------------------- transport

  async play(b: Break): Promise<boolean> {
    if (!(await this.ensure())) return false;
    this.stop();
    this.tempo = b.recipe.bpm;
    this.build(b);
    this.audible = b;
    this.pending = null;
    this.sync = { song: 0, audio: 0, rate: 1 };
    this.syncClocks();
    this.loopStart = this.ctx!.currentTime + 0.06;
    this.audibleStart = this.loopStart;
    this.scheduledUntil = this.ctx!.currentTime;
    this.clockStart = this.loopStart;
    this.clockPulse = 0;
    this.extPulse = -1;
    this.playing = true;
    this.mixer?.resetFx(this.loopStart);
    this.sendClock([START], this.loopStart);
    this.ticker = makeTicker(() => this.pump());
    this.pump();
    this.onState();
    return true;
  }

  /**
   * EXTERNAL clock (Start, or Continue): play from pulse `from` (24 per quarter from the start of
   * the song) as the pulses arrive. A Continue mid-loop starts at the right place in the break.
   * Song time counts from the start of the song at the break's own tempo; pulses map it to audio.
   */
  async follow(b: Break, from: number): Promise<boolean> {
    if (!(await this.ensure())) return false;
    this.stop();
    this.tempo = b.recipe.bpm;
    this.build(b);
    this.audible = b;
    this.pending = null;
    this.syncClocks();
    const at = Math.max(0, from) * this.pulseSeconds;
    const len = this.duration(b);
    this.loopStart = Math.floor(at / len + 1e-9) * len;
    this.audibleStart = this.loopStart;
    this.idx = this.list.findIndex((s) => this.loopStart + s.sec >= at - 1e-9);
    if (this.idx < 0) this.idx = this.list.length;
    this.scheduledUntil = at;
    // nothing is scheduled until the first pulse anchors song time to the audio clock
    this.sync = { song: at, audio: this.ctx!.currentTime, rate: 1 };
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
    const rate = periodMs !== null && periodMs > 0 ? this.pulseSeconds / (periodMs / 1000) : this.sync.rate;
    this.sync = { song: n * this.pulseSeconds, audio: this.audioTime(ms), rate };
    this.extPulse = n;
    this.pump();
  }

  /** EXTERNAL clock lost while playing: end every MIDI note; nothing more is scheduled until pulses return. */
  clockLost(): void {
    this.midi?.releaseAll(false);
  }

  /** Never replace audio already handed to Web Audio. Quantise beyond that frontier. */
  setBreak(b: Break): void {
    if (!this.playing || !this.ctx || !this.current) {
      this.current = this.audible = b;
      return;
    }
    this.pending = b;
    if (this.switchAt !== Infinity) return; // newest request wins at the same boundary
    const safe = Math.max(this.songNow() + 0.005, this.scheduledUntil + 0.000001);
    const unit = this.switchMode === 'loop' ? this.duration(this.current) : 240 / this.tempo;
    this.switchAt = this.switchMode === 'immediate' ? safe
      : this.loopStart + Math.max(1, Math.ceil((safe - this.loopStart) / unit)) * unit;
  }

  private duration(b: Break): number { return b.recipe.bars * 240 / this.tempo; }

  private announce(): void {
    while (this.activations.length && this.activations[0]!.time <= this.songNow()) {
      const a = this.activations.shift()!;
      this.audible = a.b;
      this.audibleStart = a.start;
      this.onSwap(a.b);
    }
  }

  /** Hand edits use the selected transition policy too. */
  update(b: Break): void { this.setBreak(b); }

  stop(): void {
    for (const meter of this.meters.values()) meter.peak = 0;
    this.ticker?.stop();
    this.ticker = null;
    if (this.ctx && this.notes) this.notes.stopAll(this.ctx.currentTime);
    // every MIDI note ends: queued note-ons are dropped where the browser can, note-offs follow the rest
    this.midi?.releaseAll(true);
    const selected = this.pending ?? this.activations.at(-1)?.b ?? this.current;
    this.pending = null;
    this.switchAt = Infinity;
    this.activations = [];
    this.current = this.audible = selected;
    if (this.playing) {
      this.playing = false;
      if (this.ctx && this.clock === 'internal' && this.midi) {
        this.sendClock([STOP], this.ctx.currentTime);
        this.sendClock(songPosition(0), this.ctx.currentTime);
      }
      this.onState();
    }
    this.sync = { song: 0, audio: 0, rate: 1 };
  }

  pump(): void {
    const ctx = this.ctx;
    const b = this.current;
    if (!ctx || !b || !this.playing) return;
    if (this.clock === 'external' && this.extPulse < 0) return;
    if (this.midi) this.syncClocks();
    this.announce();
    let horizon = this.toSong(ctx.currentTime + LOOKAHEAD);
    if (this.clock === 'external') horizon = Math.min(horizon, (this.extPulse + EXT_MAX_AHEAD_PULSES) * this.pulseSeconds);
    this.schedule(horizon);
    if (!this.playing) return;
    this.flushClock(horizon, false);
    this.midi?.flush(this.perfTime(this.toAudio(horizon)));
  }

  /** Schedule everything up to a song time. */
  private schedule(horizon: number): void {
    const ctx = this.ctx!;
    for (let guard = 0; guard < 2000; guard++) {
      const next = this.list[this.idx];
      if (this.pending && this.switchAt <= horizon &&
          (!next || this.loopStart + next.sec >= this.switchAt)) {
        const time = this.switchAt;
        const p = this.pending;
        this.pending = null;
        this.switchAt = Infinity;
        // Keep bar/loop phase; immediate changes skip the already scheduled part.
        const phase = (time - this.loopStart) % this.duration(p);
        this.loopStart = time - phase;
        this.build(p);
        this.idx = this.list.findIndex(x => this.loopStart + x.sec >= time - 1e-9);
        if (this.idx < 0) this.idx = this.list.length;
        this.activations.push({ b: p, time, start: this.loopStart });
        continue;
      }
      if (this.idx >= this.list.length) {
        const end = this.loopStart + this.duration(this.current!);
        if (end > horizon) return;
        if (!this.loop) {
          // let the last hits ring, then stop
          if (ctx.currentTime > this.toAudio(end) + 0.05) {
            this.stop();
          }
          return;
        }
        this.loopStart = end;
        this.idx = 0;

        continue;
      }
      const s = this.list[this.idx]!;
      const t = this.loopStart + s.sec;
      if (t > horizon) return;
      this.flushClock(t, true);
      this.scheduledUntil = t;
      const a = this.toAudio(t);
      if (a >= ctx.currentTime - (this.clock === 'external' ? EXT_LATE : 0.005)) {
        const at = Math.max(a, ctx.currentTime);
        if (s.e.sample) this.trigger(s.e.cat, s.e.sample, s.e.vel, at);
        if (s.midi) this.midi?.hit(s.e.cat, s.e.vel, this.perfTime(at), this.perfTime(this.toAudio(t + GATE_QUARTERS * (60 / this.tempo))));
      }
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

  /**
   * A hit played live (MIDI input), now, through the main mixer so the channel mix applies. False
   * when audio has not started (the browser starts it only after a click or key on the page).
   */
  live(voice: string, sample: string, vel: number): boolean {
    if (!this.ctx || this.ctx.state !== 'running' || !this.notes) return false;
    this.trigger(voice, sample, vel, this.ctx.currentTime);
    return true;
  }

  /** Current position: bar index and fractional sixteenth, or null when stopped. */
  position(): { loop: number; frac: number } | null {
    if (!this.playing || !this.ctx || !this.current) return null;
    const len = this.duration(this.audible ?? this.current);
    const t = this.toSong(this.ctx.currentTime - (this.ctx.outputLatency || 0)) - this.audibleStart;
    const frac = t < 0 ? 0 : (t % len) / len;
    return { loop: 0, frac: Math.max(0, Math.min(0.99999, frac)) };
  }

  /** The bar now playing, or null when stopped (PER BAR picks for live hits). */
  currentBar(): number | null {
    const p = this.position();
    const b = this.audible ?? this.current;
    return p && b ? Math.min(b.recipe.bars - 1, Math.floor(p.frac * b.recipe.bars)) : null;
  }

  /** A selected break is waiting to be heard. */
  get queued(): boolean {
    return !!this.pending || this.activations.length > 0;
  }

  get break(): Break | null {
    return this.audible;
  }
}
