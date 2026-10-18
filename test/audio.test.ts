import { describe, expect, it } from 'vitest';
import { encodeWav16, wavInfo } from '@slopfactory/core/export';
import { validateTimeline } from '@slopfactory/core/events';
import { demoKit, DEMO_RATE } from '../src/audio/demoKit';
import { guessCategory } from '../src/audio/ingredients';
import { foldLoop, takeawayName, defaultTakeaway } from '../src/audio/takeaway';
import { breakTimeline, CORE_PPQ, eventQuarters, eventSeconds, hatChoke, loopSeconds } from '../src/audio/timeline';
import { bake, seedsFrom } from '../src/engine/generate';
import { emptyKit } from '../src/engine/kit';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, STYLES, type BreakEvent } from '../src/engine/types';

const ev = (p: Partial<BreakEvent>): BreakEvent => ({ cat: 'kick', step: 0, sub: 0, level: 1, role: 'kick', why: '', bar: 0, vel: 100, swing: 0, offsetMs: 0, sample: 'x', ...p });

describe('event timing', () => {
  it('converts grid, swing and microtiming to time', () => {
    expect(eventQuarters(ev({ bar: 1, step: 4 }), 120)).toBe(5);
    expect(eventQuarters(ev({ step: 1, swing: 0.32 }), 120)).toBeCloseTo(1.32 / 4);
    expect(eventQuarters(ev({ step: 2, sub: 6 }), 120)).toBeCloseTo(2.5 / 4);
    // +10 ms at 120 BPM = 0.02 quarter notes
    expect(eventQuarters(ev({ step: 4, offsetMs: 10 }), 120)).toBeCloseTo(1.02);
    // never before the start
    expect(eventQuarters(ev({ offsetMs: -5 }), 120)).toBe(0);
    expect(eventSeconds(ev({ step: 4 }), 120)).toBeCloseTo(0.5, 6);
  });
  it('loop length is bars × 4 beats', () => {
    const b = bake(defaultRecipe('funk', 4), seedsFrom(1));
    expect(loopSeconds(b)).toBeCloseTo((4 * 4 * 60) / b.recipe.bpm);
  });
});

describe('timeline', () => {
  const kit = emptyKit();
  for (const c of CATEGORIES) kit[c] = [`${c}-1`];
  it('is a valid Core timeline with one voice per category and every playable hit', () => {
    for (const style of STYLES) {
      const b = bake(defaultRecipe(style, 4), seedsFrom(77), kit);
      const t = breakTimeline(b);
      expect(validateTimeline(t)).toEqual([]);
      expect(t.voices.map((v) => v.id)).toEqual([...CATEGORIES]);
      expect(t.events.length).toBe(b.events.length);
      expect(t.length).toBe(4 * 4 * CORE_PPQ);
      for (const e of t.events) {
        expect(e.tick).toBeGreaterThanOrEqual(0);
        expect(e.tick).toBeLessThan(t.length + CORE_PPQ); // only a late microtimed last hit may pass the bar line
      }
      for (let i = 1; i < t.events.length; i++) expect(t.events[i]!.tick).toBeGreaterThanOrEqual(t.events[i - 1]!.tick);
    }
  });
  it('leaves out hits without a sample', () => {
    const b = bake(defaultRecipe('funk', 2), seedsFrom(5));
    expect(breakTimeline(b).events.length).toBe(0);
  });
  it('chokes an open hat with the closed hat', () => {
    expect(hatChoke('hat', { time: 0, pitch: 60, velocity: 100 })).toMatchObject({ group: 'hats', cuts: true, cutBy: false });
    expect(hatChoke('open', { time: 0, pitch: 60, velocity: 100 })).toMatchObject({ group: 'hats', cutBy: true });
    expect(hatChoke('kick', { time: 0, pitch: 60, velocity: 100 })).toBeNull();
  });
});

describe('takeaway helpers', () => {
  it('folds a tail back onto the start for a seamless loop', () => {
    const x = new Float32Array([1, 2, 3, 4, 10, 20, 100]);
    expect([...foldLoop(x, 4)]).toEqual([1 + 10 + 0, 2 + 20, 3 + 100, 4].map((v, i) => (i === 0 ? 11 : v)));
    expect(foldLoop(new Float32Array([1, 1, 1, 1, 1]), 2).length).toBe(2);
    expect([...foldLoop(new Float32Array([1, 1, 1, 1, 1]), 2)]).toEqual([3, 2]);
  });
  it('names files by style, tempo, bars and seed', () => {
    const b = bake(defaultRecipe('hiphop', 2), seedsFrom(42));
    expect(takeawayName(b, defaultTakeaway(), 'wav')).toBe('breakery_hip-hop_90bpm_2bar_seed42.wav');
    expect(takeawayName(b, { ...defaultTakeaway(), mode: 'loop' }, 'wav')).toBe('breakery_hip-hop_90bpm_2bar_seed42_loop.wav');
  });
  it('encodes 16-bit WAV of the right length and rate', async () => {
    const kick = demoKit().find((d) => d.cat === 'kick')!;
    const bytes = await encodeWav16([kick.data, kick.data], DEMO_RATE);
    const info = wavInfo(bytes);
    expect(info).toMatchObject({ format: 1, channels: 2, sampleRate: 44100, bitsPerSample: 16, frames: kick.data.length });
  });
});

describe('demo kit', () => {
  it('has sounds for every category, finite, not clipping and not silent', () => {
    const kit = demoKit();
    for (const c of CATEGORIES) expect(kit.some((d) => d.cat === c)).toBe(true);
    for (const d of kit) {
      let peak = 0;
      for (const v of d.data) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.2);
      expect(peak).toBeLessThanOrEqual(1);
      expect(d.data.length / DEMO_RATE).toBeLessThan(4);
    }
    expect(demoKit()).toBe(kit); // built once
  });
});

describe('ingredients', () => {
  it('guesses categories from file names (reassignable later)', () => {
    expect(guessCategory('BD_Funky_01.wav')).toBe('kick');
    expect(guessCategory('kick hard.wav')).toBe('kick');
    expect(guessCategory('Snare 3.wav')).toBe('snare');
    expect(guessCategory('snare_ghost.wav')).toBe('ghost');
    expect(guessCategory('HH closed.wav')).toBe('hat');
    expect(guessCategory('hat_open.wav')).toBe('open');
    expect(guessCategory('OH_1.wav')).toBe('open');
    expect(guessCategory('ride bell.wav')).toBe('ride');
    expect(guessCategory('crash.aif')).toBe('crash');
    expect(guessCategory('tambourine.wav')).toBe('perc');
    expect(guessCategory('mystery.wav')).toBe('unsorted');
  });
});
