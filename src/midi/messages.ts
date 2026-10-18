/**
 * MIDI message helpers. Channels are 1-16 at the API surface. DOWNBEAT's (src/midi/messages.ts
 * there), the builders step 1 of Slop Factory Core's MIDI roadmap starts from, kept the same so
 * the apps converge on one set when Core grows a shared implementation.
 */

export const CLOCK = 0xf8;
export const START = 0xfa;
export const CONTINUE = 0xfb;
export const STOP = 0xfc;
export const SONG_POSITION = 0xf2;
/** MIDI Clock pulses per quarter note. */
export const CLOCK_PPQ = 24;

const ch = (c: number) => (Math.min(16, Math.max(1, Math.round(c))) - 1) & 0x0f;
const d7 = (v: number) => Math.min(127, Math.max(0, Math.round(v))) & 0x7f;

export const noteOn = (c: number, note: number, vel: number): number[] => [0x90 | ch(c), d7(note), Math.max(1, d7(vel))];
export const noteOff = (c: number, note: number): number[] => [0x80 | ch(c), d7(note), 0];
export const controlChange = (c: number, cc: number, v: number): number[] => [0xb0 | ch(c), d7(cc), d7(v)];
export const allNotesOff = (c: number): number[] => controlChange(c, 123, 0);
export const allSoundOff = (c: number): number[] => controlChange(c, 120, 0);

/** Song Position Pointer in MIDI beats (sixteenth notes = 6 clocks). */
export const songPosition = (beats: number): number[] => {
  const b = Math.max(0, Math.min(16383, Math.round(beats)));
  return [SONG_POSITION, b & 0x7f, (b >> 7) & 0x7f];
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Note name with the octave numbering where middle C (60) is C3, as many drum machines use. */
export const noteName = (n: number): string => `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 2}`;

/** A channel message, parsed. Channels 1-16. A note-on at velocity 0 is a note-off. */
export type ChannelMessage = { type: 'noteon'; channel: number; note: number; velocity: number } | { type: 'noteoff'; channel: number; note: number } | { type: 'other' };

export function parseChannel(bytes: ArrayLike<number>): ChannelMessage {
  const s = bytes[0] ?? 0;
  const hi = s & 0xf0;
  const channel = (s & 0x0f) + 1;
  if (bytes.length < 3) return { type: 'other' };
  const note = bytes[1]! & 0x7f;
  const velocity = bytes[2]! & 0x7f;
  if (hi === 0x90 && velocity > 0) return { type: 'noteon', channel, note, velocity };
  if (hi === 0x80 || hi === 0x90) return { type: 'noteoff', channel, note };
  return { type: 'other' };
}
