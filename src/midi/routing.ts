/**
 * MIDI routing: per drum track (category), where its hits go out (device, channel, note) and which
 * incoming notes play it (device, channel or OMNI, note). Pure: no Web MIDI, no audio. The MIDI
 * window edits these settings; the live router (midi/router.ts), the input handler (midi/rig.ts)
 * and the MIDI file (midi/breakMidi.ts) read them.
 *
 * Defaults are General MIDI drums on channel 10, the notes the MIDI file has always written.
 * GHOST shares SNARE's GM 38 on the way out (a ghost is a quiet snare). On the way in GHOST is off
 * by default, so an incoming 38 plays SNARE once (its VELOCITY pick mode gives soft hits the quiet
 * samples); turn GHOST on with its own note to play ghost samples from a pad of their own.
 */
import { CATEGORIES, GM_NOTE, type Category } from '../engine/types';

/** A track's device: follow the window's default device. */
export const DEFAULT_PORT = '';
/** The default input: every connected input. */
export const ANY_PORT = '*';
/** Input channel 0: OMNI (any channel). */
export const OMNI = 0;
/** General MIDI drums. */
export const GM_DRUM_CHANNEL = 10;

export interface TrackOut {
  on: boolean;
  /** device id, or DEFAULT_PORT */
  device: string;
  /** 1..16 */
  channel: number;
  /** 0..127 */
  note: number;
}

export interface TrackIn {
  on: boolean;
  /** device id, ANY_PORT, or DEFAULT_PORT */
  device: string;
  /** 1..16, or OMNI */
  channel: number;
  /** 0..127 */
  note: number;
}

export type ClockSource = 'internal' | 'external';

export interface MidiSettings {
  /** the user turned MIDI on (access is asked for again on the next visit) */
  enabled: boolean;
  /** default output device id ('' = none) */
  output: string;
  /** default input device id (ANY_PORT = every input) */
  input: string;
  clock: ClockSource;
  /** where an external clock comes from (ANY_PORT = any input) */
  clockIn: string;
  /** where the internal clock is sent ('' = nowhere) */
  clockOut: string;
  /** device names by id, to find a device again if the browser gives it a new id */
  names: Record<string, string>;
  tracks: Record<Category, { out: TrackOut; in: TrackIn }>;
}

export const defaultOut = (cat: Category): TrackOut => ({ on: true, device: DEFAULT_PORT, channel: GM_DRUM_CHANNEL, note: GM_NOTE[cat] });
export const defaultIn = (cat: Category): TrackIn => ({ on: cat !== 'ghost', device: DEFAULT_PORT, channel: OMNI, note: GM_NOTE[cat] });

export function defaultMidiSettings(): MidiSettings {
  return {
    enabled: false,
    output: '',
    input: ANY_PORT,
    clock: 'internal',
    clockIn: ANY_PORT,
    clockOut: '',
    names: {},
    tracks: Object.fromEntries(CATEGORIES.map((c) => [c, { out: defaultOut(c), in: defaultIn(c) }])) as MidiSettings['tracks'],
  };
}

const int = (v: unknown, lo: number, hi: number, fallback: number): number => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** Settings from storage (or anything else): unknown fields dropped, numbers clamped, defaults filled in. */
export function sanitiseMidiSettings(s: unknown): MidiSettings {
  const d = defaultMidiSettings();
  if (!s || typeof s !== 'object') return d;
  const o = s as Partial<Record<keyof MidiSettings, unknown>>;
  const names: Record<string, string> = {};
  if (o.names && typeof o.names === 'object') for (const [k, v] of Object.entries(o.names)) if (typeof v === 'string') names[k] = v;
  const tracks = d.tracks;
  const t = o.tracks && typeof o.tracks === 'object' ? (o.tracks as Record<string, { out?: Partial<TrackOut>; in?: Partial<TrackIn> }>) : {};
  for (const c of CATEGORIES) {
    const out = t[c]?.out;
    const inp = t[c]?.in;
    if (out && typeof out === 'object') tracks[c].out = { on: out.on !== false, device: str(out.device, DEFAULT_PORT), channel: int(out.channel, 1, 16, GM_DRUM_CHANNEL), note: int(out.note, 0, 127, GM_NOTE[c]) };
    if (inp && typeof inp === 'object') tracks[c].in = { on: typeof inp.on === 'boolean' ? inp.on : d.tracks[c].in.on, device: str(inp.device, DEFAULT_PORT), channel: int(inp.channel, OMNI, 16, OMNI), note: int(inp.note, 0, 127, GM_NOTE[c]) };
  }
  // routings stored before CLAP existed (Phase 15): PERC was the clap track. If it still listens on
  // CLAP's note, the new CLAP track does not listen too (one key, one track, as before)
  if (!t.clap && t.perc?.in) {
    const p = tracks.perc.in;
    const c = tracks.clap.in;
    if (p.on && p.note === c.note && (p.channel === OMNI || c.channel === OMNI || p.channel === c.channel)) c.on = false;
  }
  return {
    enabled: o.enabled === true,
    output: str(o.output, ''),
    input: str(o.input, ANY_PORT) || ANY_PORT,
    clock: o.clock === 'external' ? 'external' : 'internal',
    clockIn: str(o.clockIn, ANY_PORT) || ANY_PORT,
    clockOut: str(o.clockOut, ''),
    names,
    tracks,
  };
}

/** Where a track's hits go: the device (its own, or the default), channel and note; null = not sent. */
export function outRoute(s: MidiSettings, cat: Category): { device: string; channel: number; note: number } | null {
  const o = s.tracks[cat].out;
  const device = o.device || s.output;
  if (!o.on || !device) return null;
  return { device, channel: o.channel, note: o.note };
}

/** The tracks an incoming note-on plays (several when they share device, channel and note: they layer). */
export function inputTargets(s: MidiSettings, deviceId: string, channel: number, note: number): Category[] {
  return CATEGORIES.filter((c) => {
    const i = s.tracks[c].in;
    if (!i.on || i.note !== note || (i.channel !== OMNI && i.channel !== channel)) return false;
    const device = i.device || s.input;
    return device === ANY_PORT || device === deviceId;
  });
}

/** Channel and note per track, for the MIDI file (every track, whether or not it is sent live). */
export function fileMapping(s: MidiSettings): Record<Category, { channel: number; note: number }> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, { channel: s.tracks[c].out.channel, note: s.tracks[c].out.note }])) as Record<Category, { channel: number; note: number }>;
}

/** Is the mapping the General MIDI default (every track on channel 10 at its GM note)? */
export const isGmMapping = (m: Record<Category, { channel: number; note: number }>): boolean => CATEGORIES.every((c) => m[c].channel === GM_DRUM_CHANNEL && m[c].note === GM_NOTE[c]);

/**
 * A stored device id, found among the ports that exist now: by id, or else by the name it had
 * (browsers may give a replugged device a new id). Returns the id to use, or the stored one when
 * the device is simply absent (it is shown as disconnected, and works again when it returns).
 */
export function resolvePort(id: string, ports: readonly { id: string; name: string }[], names: Record<string, string>): string {
  if (!id || id === ANY_PORT || ports.some((p) => p.id === id)) return id;
  const name = names[id];
  const same = name ? ports.filter((p) => p.name === name) : [];
  return same.length === 1 ? same[0]!.id : id;
}
