import { describe, expect, it } from 'vitest';
import { CORE_PPQ, eventTick } from '../src/audio/timeline';
import { midiTakeaway, takeawayName, defaultTakeaway } from '../src/audio/takeaway';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, CATEGORY_LABEL, GM_NOTE, STYLES, type Break, type BreakEvent } from '../src/engine/types';
import { breakMidi, DRUM_CHANNEL, GATE_TICKS, MIDI_PPQ } from '../src/midi/breakMidi';
import { parseSmf, SmfError, writeSmf } from '../src/midi/smf';

const ev = (p: Partial<BreakEvent>): BreakEvent => ({ cat: 'kick', step: 0, sub: 0, level: 1, role: 'kick', why: '', bar: 0, vel: 100, swing: 0, offsetMs: 0, sample: 'x', ...p });
const withEvents = (events: BreakEvent[], bpm = 120, bars: 1 | 2 | 4 = 1): Break => {
  const b = bake(defaultRecipe('funk', bars), seedsFrom(1));
  return { ...b, recipe: { ...b.recipe, bpm, bars }, events };
};
const ascii = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
const u32 = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;

describe('SMF writer', () => {
  it('writes a type 1 header and chunk lengths that add up to the file', () => {
    const f = writeSmf({ format: 1, ppq: 960, bpm: 120, timeSig: [4, 4], name: 'T', tracks: [{ name: 'A', events: [] }, { name: 'B', events: [] }] });
    expect(ascii(f, 0)).toBe('MThd');
    expect(u32(f, 4)).toBe(6);
    expect([...f.subarray(8, 14)]).toEqual([0, 1, 0, 3, 960 >> 8, 960 & 255]); // format 1, 3 tracks, 960 PPQ
    let p = 14;
    let tracks = 0;
    while (p < f.length) {
      expect(ascii(f, p)).toBe('MTrk');
      const len = u32(f, p + 4);
      p += 8 + len;
      expect([...f.subarray(p - 3, p)]).toEqual([0xff, 0x2f, 0x00]); // every track ends with End of Track
      tracks++;
    }
    expect(p).toBe(f.length);
    expect(tracks).toBe(3);
  });

  it('writes tempo, time signature and variable-length delta times', () => {
    const f = writeSmf({
      format: 0,
      ppq: 960,
      bpm: 100,
      timeSig: [4, 4],
      name: 'X',
      tracks: [{ name: 'X', events: [{ tick: 0, bytes: [0x99, 36, 100] }, { tick: 200, bytes: [0x89, 36, 64] }] }],
      endTick: 3840,
    });
    const track = [...f.subarray(22)];
    // name, tempo (600 000 µs per quarter = 100 BPM), 4/4, note-on, delta 200 = 0x81 0x48, note-off, delta 3640 = 0x9C 0x38, End of Track
    expect(track).toEqual([0, 0xff, 0x03, 1, 88, 0, 0xff, 0x51, 3, 0x09, 0x27, 0xc0, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0x99, 36, 100, 0x81, 0x48, 0x89, 36, 64, 0x9c, 0x38, 0xff, 0x2f, 0]);
    expect(u32(f, 18)).toBe(track.length);
  });

  it('puts note-offs before note-ons at the same tick', () => {
    const f = writeSmf({ format: 0, ppq: 96, bpm: 120, timeSig: [4, 4], name: 'X', tracks: [{ name: 'X', events: [{ tick: 10, bytes: [0x99, 38, 90] }, { tick: 10, bytes: [0x89, 38, 64] }, { tick: 0, bytes: [0x99, 38, 80] }] }] });
    const s = parseSmf(f);
    expect(s.notes.map((n) => [n.tick, n.offTick, n.velocity])).toEqual([
      [0, 10, 80],
      [10, null, 90],
    ]);
  });

  it('rejects files that are not MIDI', () => {
    expect(() => parseSmf(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(SmfError);
    expect(() => parseSmf(writeSmf({ format: 0, ppq: 96, bpm: 120, timeSig: [4, 4], name: 'X', tracks: [] }).subarray(0, 20))).toThrow(SmfError);
  });
});

describe('break MIDI file', () => {
  it('round-trips every hit of a break: GM note, channel 10, velocity and timing', () => {
    for (const style of STYLES) {
      for (const bars of [1, 2, 4] as const) {
        const b = bake({ ...defaultRecipe(style, bars), humanise: 0.8, swing: 0.6 }, seedsFrom(31 + bars));
        const { bytes, notes } = breakMidi(b);
        const s = parseSmf(bytes);
        expect(s.format).toBe(1);
        expect(s.ppq).toBe(MIDI_PPQ);
        expect(s.bpm).toBeCloseTo(b.recipe.bpm, 3);
        expect(s.timeSig).toEqual([4, 4]);
        expect(s.notes.length).toBe(notes);
        const places = new Set(b.events.map((e) => `${Math.round((eventTick(e, b.recipe.bpm) * MIDI_PPQ) / CORE_PPQ)}:${GM_NOTE[e.cat]}`));
        expect(notes).toBe(places.size);
        expect(notes).toBeGreaterThan(b.events.length * 0.95);
        for (const n of s.notes) {
          expect(n.channel).toBe(DRUM_CHANNEL + 1);
          expect(places.has(`${n.tick}:${n.note}`)).toBe(true);
          // every note-on has its note-off, short and before the key's next note-on
          expect(n.offTick).not.toBeNull();
          expect(n.offTick! - n.tick).toBeGreaterThanOrEqual(1);
          expect(n.offTick! - n.tick).toBeLessThanOrEqual(GATE_TICKS);
          const next = s.notes.find((m) => m.note === n.note && m.tick > n.tick);
          if (next) expect(n.offTick!).toBeLessThan(next.tick);
        }
        // conductor track, then one named track per category that plays, in display order
        const played = CATEGORIES.filter((c) => b.events.some((e) => e.cat === c));
        expect(s.trackNames).toEqual(['The Breakery', ...played.map((c) => CATEGORY_LABEL[c])]);
        expect(s.lastTick).toBeGreaterThanOrEqual(bars * 4 * MIDI_PPQ);
      }
    }
  });

  it('keeps swing and microtiming (converted from Core ticks, not quantised)', () => {
    const b = withEvents([ev({ step: 0 }), ev({ cat: 'hat', step: 1, swing: 0.32 }), ev({ cat: 'snare', step: 4, offsetMs: 10 }), ev({ cat: 'ghost', step: 6, sub: 6, vel: 30 })], 120);
    const s = parseSmf(breakMidi(b).bytes);
    expect(s.notes.map((n) => [n.tick, n.note, n.velocity, n.track])).toEqual([
      [0, 36, 100, 1],
      [Math.round(1.32 * 240), 42, 100, 4],
      [960 + 19, 38, 100, 2], // +10 ms at 120 BPM = 0.02 quarter = 19.2 ticks
      [Math.round(6.5 * 240), 38, 30, 3],
    ]);
  });

  it('writes a snare and a ghost on the same tick once, at the louder velocity', () => {
    const b = withEvents([ev({ cat: 'snare', step: 4, vel: 110 }), ev({ cat: 'ghost', step: 4, vel: 40 })]);
    const r = breakMidi(b);
    expect(r.notes).toBe(1);
    expect(parseSmf(r.bytes).notes.map((n) => n.velocity)).toEqual([110]);
  });

  it('ends a note before the same key is struck again, even across tracks', () => {
    // a drag: ghost a tick-and-a-bit before the snare, both GM 38
    const b = withEvents([ev({ cat: 'ghost', step: 4, offsetMs: -1, vel: 40 }), ev({ cat: 'snare', step: 4, vel: 110 })], 120);
    const [g, sn] = parseSmf(breakMidi(b).bytes).notes;
    expect(g!.offTick!).toBeLessThan(sn!.tick);
    expect(g!.offTick! - g!.tick).toBeGreaterThanOrEqual(1);
  });

  it('includes hits without a sample (MIDI plays its own sounds)', () => {
    const b = bake(defaultRecipe('funk', 2), seedsFrom(5));
    expect(b.events.every((e) => e.sample === null)).toBe(true);
    expect(parseSmf(breakMidi(b).bytes).notes.length).toBeGreaterThan(0);
  });

  it('is named like the WAV, with .mid and never "loop"', () => {
    const b = bake(defaultRecipe('jungle', 2), seedsFrom(9));
    const m = midiTakeaway(b);
    expect(m.name).toBe(takeawayName(b, defaultTakeaway(), 'mid'));
    expect(m.name).toMatch(/^breakery_.*\.mid$/);
    expect(m.name).not.toMatch(/loop/);
    expect(m.type).toBe('audio/midi');
  });
});
