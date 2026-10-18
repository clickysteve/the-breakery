/**
 * The Breakery's MIDI: Web MIDI access (midi/access.ts), the live router that plays the break out
 * to devices (midi/router.ts), incoming notes that play the drum tracks, and the external clock
 * (midi/clockIn.ts). Settings (midi/routing.ts) are saved in this browser.
 *
 * Incoming notes play whether or not the break is playing: The Breakery is also a drum module for
 * an external sequencer. Each hit picks its sample with the track's PICK mode (LiveSamplePicker),
 * at the incoming velocity, through the main mixer (SOLO and MUTE apply).
 */
import type { App } from './app';
import { LiveSamplePicker } from '../engine/samples';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../engine/types';
import { MidiAccess } from '../midi/access';
import { ExternalClock } from '../midi/clockIn';
import { noteName, parseChannel } from '../midi/messages';
import { MidiRouter } from '../midi/router';
import { ANY_PORT, defaultIn, defaultOut, fileMapping, inputTargets, resolvePort, sanitiseMidiSettings, type ClockSource, type MidiSettings, type TrackIn, type TrackOut } from '../midi/routing';
import type { MidiMapping } from '../midi/breakMidi';

const MIDI_KEY = 'breakery.midi.v1';
/** a live hit that waited longer than this for audio to start is dropped (it would be late) */
const STALE_MS = 80;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class MidiRig {
  settings: MidiSettings;
  readonly access: MidiAccess;
  readonly clock: ExternalClock;
  readonly router: MidiRouter;
  /** the track whose input note the next incoming note sets (LEARN), or null */
  learning: Category | null = null;
  /** when each track was last played from MIDI input (performance.now()), for the window's activity lights */
  readonly activity: Record<Category, number> = Object.fromEntries(CATEGORIES.map((c) => [c, -Infinity])) as Record<Category, number>;
  private picker = new LiveSamplePicker();
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private waking: Promise<boolean> | null = null;
  private listeners: (() => void)[] = [];
  private warnedAudio = false;

  constructor(private app: App) {
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(MIDI_KEY) ?? 'null');
    } catch {
      saved = null;
    }
    this.settings = sanitiseMidiSettings(saved);
    this.access = new MidiAccess({
      ports: () => this.portsChanged(),
      lost: (kind, id, name) => this.lost(kind, id, name),
      returned: (kind, id, name) => this.returned(kind, id, name),
      message: (id, data, t) => this.message(id, data, t),
    });
    this.router = new MidiRouter(this.settings, (id) => this.access.output(id), now);
    this.clock = new ExternalClock(
      {
        start: (from) => this.followStart(from),
        stop: () => this.app.player.stop(),
        pulse: (n, ms, period) => this.app.player.pulse(n, ms, period),
        lost: () => {
          this.app.player.clockLost();
          this.app.say('MIDI CLOCK LOST: no clock for half a second. Notes released; the break carries on when the clock returns.');
        },
        changed: () => this.notify(),
      },
      now,
    );
    if (this.settings.enabled) void this.enable(true);
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private notify(): void {
    for (const f of this.listeners) f();
  }

  /** MIDI is on and the browser gave access. */
  get ready(): boolean {
    return this.settings.enabled && this.access.state === 'ready';
  }

  get external(): boolean {
    return this.ready && this.settings.clock === 'external';
  }

  /** Ask for Web MIDI and start routing. `quiet`: restoring a previous visit's choice. */
  async enable(quiet = false): Promise<boolean> {
    this.settings.enabled = true;
    this.save();
    const state = await this.access.request();
    if (state !== 'ready') {
      if (!quiet) this.app.say(this.access.message);
      this.notify();
      return false;
    }
    this.portsChanged();
    this.app.player.midi = this.router;
    this.app.player.rerouted();
    this.applyClock();
    if (!quiet) {
      const n = this.access.outputs().filter((p) => p.connected).length;
      const m = this.access.inputs().filter((p) => p.connected).length;
      this.app.say(`MIDI on: ${n} output${n === 1 ? '' : 's'}, ${m} input${m === 1 ? '' : 's'}. Choose devices in the MIDI window.`);
    }
    this.notify();
    return true;
  }

  /** Turn MIDI off: every note is ended, the clock goes back to internal. Settings are kept. */
  disable(): void {
    this.settings.enabled = false;
    this.save();
    if (this.external) this.app.player.stop();
    this.clock.setActive(false);
    this.stopWatch();
    this.router.releaseAll(false);
    this.app.player.midi = null;
    this.app.player.clock = 'internal';
    this.app.player.rerouted();
    this.learning = null;
    this.app.say('MIDI off. The Breakery plays its own sounds only.');
    this.notify();
  }

  private save(): void {
    // keep the names of the devices the settings use, to find them again under a new id
    const used = new Set([this.settings.output, this.settings.input, this.settings.clockIn, this.settings.clockOut, ...CATEGORIES.flatMap((c) => [this.settings.tracks[c].out.device, this.settings.tracks[c].in.device])]);
    const names: Record<string, string> = {};
    for (const id of used) if (id && this.settings.names[id]) names[id] = this.settings.names[id]!;
    this.settings.names = names;
    try {
      localStorage.setItem(MIDI_KEY, JSON.stringify(this.settings));
    } catch {
      /* no storage: this lasts for this visit */
    }
  }

  /** A setting changed: notes on the old routing end, the player follows the new one. */
  private changed(): void {
    this.save();
    this.router.setSettings(this.settings);
    this.app.player.rerouted();
    this.notify();
  }

  // ---------------------------------------------------------------- settings

  setTrackOut(cat: Category, patch: Partial<TrackOut>): void {
    this.settings.tracks[cat].out = { ...this.settings.tracks[cat].out, ...patch };
    this.changed();
  }

  setTrackIn(cat: Category, patch: Partial<TrackIn>): void {
    this.settings.tracks[cat].in = { ...this.settings.tracks[cat].in, ...patch };
    this.changed();
  }

  setDevices(patch: Partial<Pick<MidiSettings, 'output' | 'input' | 'clockIn' | 'clockOut'>>): void {
    const was = this.settings.clockIn;
    Object.assign(this.settings, patch);
    for (const p of [...this.access.outputs(), ...this.access.inputs()]) this.settings.names[p.id] = p.name;
    // following a different clock: start again from its next Start
    if (patch.clockIn !== undefined && patch.clockIn !== was && this.external) {
      this.clock.setActive(false);
      this.clock.setActive(true);
    }
    this.changed();
  }

  /** Every track back to General MIDI drums on channel 10, inputs OMNI. Devices are kept. */
  resetMapping(): void {
    for (const c of CATEGORIES) this.settings.tracks[c] = { out: { ...defaultOut(c), device: this.settings.tracks[c].out.device }, in: { ...defaultIn(c), device: this.settings.tracks[c].in.device } };
    this.changed();
    this.app.say('MIDI mapping reset: General MIDI drums on channel 10, inputs on any channel.');
  }

  setClock(source: ClockSource): void {
    if (source === this.settings.clock) return;
    this.settings.clock = source;
    this.save();
    this.applyClock();
    const off = this.ready ? '' : ' (MIDI is off: turn it on in the MIDI window for this to apply.)';
    this.app.say((source === 'external' ? 'CLOCK: EXTERNAL. The break plays when your sequencer sends Start (or Continue), at its tempo.' : 'CLOCK: INTERNAL. The break plays at its own BPM (Space).') + off);
    this.notify();
  }

  /** Put the player and the follower on the chosen clock. Changing clock always stops: the two disagree about where "now" is. */
  private applyClock(): void {
    const ext = this.external;
    if ((this.app.player.clock === 'external') !== ext) this.app.player.stop();
    this.app.player.clock = ext ? 'external' : 'internal';
    this.clock.setActive(ext);
    if (ext) this.startWatch();
    else this.stopWatch();
  }

  private startWatch(): void {
    if (!this.watchTimer) this.watchTimer = setInterval(() => this.clock.watch(), 100);
  }

  private stopWatch(): void {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
  }

  private followStart(from: number): void {
    void this.app.player.follow(this.app.current, from).then((ok) => {
      if (!ok) this.app.say('MIDI Start received, but the browser has not let audio start yet: click anywhere on The Breakery once, then start again.');
    });
  }

  /** PLAY pressed while following an external clock: rejoin a running clock, else explain. */
  playExternal(): void {
    if (this.app.player.playing) this.app.player.stop();
    else if (this.clock.running) this.followStart(this.clock.next);
    else this.app.say('CLOCK: EXTERNAL. Start your sequencer to play (or set CLOCK to INTERNAL in the MIDI window).');
  }

  panic(): void {
    this.router.panic();
    this.app.say('MIDI panic: All Notes Off and All Sound Off sent on every channel of every device in use.');
  }

  /** LEARN: the next incoming note sets this track's input note (and channel, unless it is OMNI). Again to cancel. */
  learn(cat: Category | null): void {
    this.learning = this.learning === cat ? null : cat;
    if (this.learning) this.app.say(`LEARN: play a note on your controller to trigger ${CATEGORY_LABEL[this.learning]}.`);
    this.notify();
  }

  /** The MIDI file's channel and note per track. */
  fileMapping(): MidiMapping {
    return fileMapping(this.settings);
  }

  // ---------------------------------------------------------------- devices

  private portsChanged(): void {
    const outs = this.access.outputs();
    const ins = this.access.inputs();
    const s = this.settings;
    const before = JSON.stringify(s);
    s.output = resolvePort(s.output, outs, s.names);
    s.clockOut = resolvePort(s.clockOut, outs, s.names);
    s.input = resolvePort(s.input, ins, s.names);
    s.clockIn = resolvePort(s.clockIn, ins, s.names);
    for (const c of CATEGORIES) {
      s.tracks[c].out.device = resolvePort(s.tracks[c].out.device, outs, s.names);
      s.tracks[c].in.device = resolvePort(s.tracks[c].in.device, ins, s.names);
    }
    for (const p of [...outs, ...ins]) s.names[p.id] = p.name;
    if (JSON.stringify(s) !== before) this.changed();
    else this.notify();
  }

  private lost(kind: 'input' | 'output', id: string, name: string): void {
    if (kind === 'output') this.router.deviceLost(id);
    if (this.inUse(kind, id)) this.app.say(`MIDI ${kind} “${name}” disconnected.${kind === 'output' ? ' Its notes were released.' : ''} It works again when it is reconnected.`);
  }

  private returned(kind: 'input' | 'output', id: string, name: string): void {
    if (kind === 'output') this.router.deviceReturned(id);
    if (this.inUse(kind, id)) this.app.say(`MIDI ${kind} “${name}” is back.`);
  }

  private inUse(kind: 'input' | 'output', id: string): boolean {
    const s = this.settings;
    if (kind === 'output') return [s.output, s.clockOut, ...CATEGORIES.map((c) => s.tracks[c].out.device)].includes(id);
    return [s.input, s.clockIn, ...CATEGORIES.map((c) => s.tracks[c].in.device)].some((d) => d === id || d === ANY_PORT);
  }

  // ---------------------------------------------------------------- input

  private message(inputId: string, data: Uint8Array, t: number): void {
    if (!this.settings.enabled || !data.length) return;
    const status = data[0]!;
    if (status >= 0xf0) {
      if (this.external && (this.settings.clockIn === ANY_PORT || this.settings.clockIn === inputId)) this.clock.receiveBytes(data, t);
      return;
    }
    const m = parseChannel(data);
    if (m.type !== 'noteon') return; // drums are one-shots: note-offs end nothing
    if (this.learning) {
      const cat = this.learning;
      const cur = this.settings.tracks[cat].in;
      this.learning = null;
      this.setTrackIn(cat, { note: m.note, on: true, channel: cur.channel === 0 ? 0 : m.channel });
      this.app.say(`${CATEGORY_LABEL[cat]} now plays from note ${m.note} (${noteName(m.note)})${cur.channel === 0 ? ' on any channel' : ` on channel ${m.channel}`}.`);
    }
    for (const cat of inputTargets(this.settings, inputId, m.channel, m.note)) this.play(cat, m.velocity);
  }

  /** Play one track from MIDI input, with its PICK mode and the incoming velocity. */
  play(cat: Category, velocity: number): void {
    const app = this.app;
    const sample = this.picker.pick(cat, velocity, app.ingredients.kit(), app.current.seeds.kit, { settings: app.samples, loudness: app.ingredients.loudness() }, app.player.currentBar(), app.current.events);
    this.activity[cat] = now();
    if (!sample) return;
    if (app.player.live(cat, sample, velocity)) return;
    const t0 = now();
    if (!this.waking) {
      // without a click or key on the page first, the browser keeps audio waiting (or refuses it)
      this.waking = app.player.ensure().finally(() => (this.waking = null));
      setTimeout(() => this.waking && this.warnAudio(), 300);
    }
    void this.waking.then((ok) => {
      if (ok && now() - t0 < STALE_MS) app.player.live(cat, sample, velocity);
      else if (!ok) this.warnAudio();
    });
  }

  private warnAudio(): void {
    if (this.warnedAudio) return;
    this.warnedAudio = true;
    this.app.say('MIDI notes are arriving, but the browser has not let audio start yet: click anywhere on The Breakery once.');
  }
}
