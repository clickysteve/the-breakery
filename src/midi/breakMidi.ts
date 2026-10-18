/**
 * Break -> Standard MIDI File. Pure: the same events, velocities and timing as the audio, as
 * General MIDI drums on channel 10, or on each track's channel and note from the MIDI window
 * (midi/routing.ts), so the file plays the same sounds as the live MIDI out.
 *
 * Timing goes through `eventTick` (audio/timeline.ts), the one function that turns grid, swing and
 * microtiming into time, so the file keeps the feel exactly as it plays (to 1/960 of a quarter,
 * about 0.6 ms at 100 BPM). Type 1: a conductor track (tempo, 4/4) and one track per drum
 * category that plays, named after it, so ghosts can be moved or muted apart from the snare even
 * though both are GM note 38. Every hit of the score is written, sampled or not. Two hits on the
 * same channel and note at the same tick are written once, at the louder velocity.
 */
import { CORE_PPQ, eventTick } from '../audio/timeline';
import { CATEGORIES, CATEGORY_LABEL, GM_NOTE, clamp, type Break, type Category } from '../engine/types';
import { writeSmf, type SmfTrack } from './smf';

/** File resolution: divides Core's 96 000 evenly, fine enough for microtiming, standard in DAWs. */
export const MIDI_PPQ = 960;
/** General MIDI drums, channel 10 (0-based 9). */
export const DRUM_CHANNEL = 9;

/** Channel (1..16) and note per category. */
export type MidiMapping = Record<Category, { channel: number; note: number }>;
export const GM_MAPPING: MidiMapping = Object.fromEntries(CATEGORIES.map((c) => [c, { channel: DRUM_CHANNEL + 1, note: GM_NOTE[c] }])) as MidiMapping;
/** Drum hits are short: a 64th note, ended a tick before the same key is struck again if that is sooner. */
export const GATE_TICKS = MIDI_PPQ / 16;

export interface BreakMidi {
  bytes: Uint8Array;
  /** notes written (hits on the same key at the same tick are written once, at the louder velocity) */
  notes: number;
}

/** `only`: write just these categories (AUDIBLE MIX); every category by default. `map`: channel and note per category (GM drums on 10 by default). */
export function breakMidi(b: Break, only?: readonly Category[], map: MidiMapping = GM_MAPPING): BreakMidi {
  const bpm = b.recipe.bpm;
  type Note = { tick: number; ch: number; key: number; vel: number; cat: (typeof CATEGORIES)[number] };
  const byPlace = new Map<string, Note>();
  for (const e of b.events) {
    if (only && !only.includes(e.cat)) continue;
    const m = map[e.cat];
    const n: Note = { tick: Math.round((eventTick(e, bpm) * MIDI_PPQ) / CORE_PPQ), ch: (clamp(Math.round(m.channel), 1, 16) - 1) & 0x0f, key: clamp(Math.round(m.note), 0, 127), vel: clamp(Math.round(e.vel), 1, 127), cat: e.cat };
    const id = `${n.tick}:${n.ch}:${n.key}`;
    const had = byPlace.get(id);
    if (!had || n.vel > had.vel) byPlace.set(id, n);
  }
  const notes = [...byPlace.values()].sort((x, y) => x.tick - y.tick);
  // a note-off must come before the next note-on of the same channel and key, even across tracks (GM drums share channel 10)
  const nextOn = new Map<number, number>();
  const offTick = new Map<Note, number>();
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const k = n.ch * 128 + n.key;
    const next = nextOn.get(k);
    offTick.set(n, n.tick + (next === undefined ? GATE_TICKS : clamp(next - n.tick - 1, 1, GATE_TICKS)));
    nextOn.set(k, n.tick);
  }
  const tracks: SmfTrack[] = CATEGORIES.map((cat) => ({
    name: CATEGORY_LABEL[cat],
    events: notes
      .filter((n) => n.cat === cat)
      .flatMap((n) => [
        { tick: n.tick, bytes: [0x90 | n.ch, n.key, n.vel] },
        { tick: offTick.get(n)!, bytes: [0x80 | n.ch, n.key, 0x40] },
      ]),
  })).filter((t) => t.events.length);
  const length = b.recipe.bars * 4 * MIDI_PPQ;
  const last = Math.max(0, ...tracks.flatMap((t) => t.events.map((e) => e.tick)));
  const bytes = writeSmf({ format: 1, ppq: MIDI_PPQ, bpm, timeSig: [4, 4], name: 'The Breakery', tracks, endTick: Math.max(length, last) });
  return { bytes, notes: notes.length };
}
