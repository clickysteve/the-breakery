import { describe, expect, it } from 'vitest';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { buildFileName, defaultNaming, loadNaming, saveNaming, stemFileNames } from '../src/audio/exportName';
import { midiTakeaway } from '../src/audio/takeaway';

const b = bake(defaultRecipe('jungle', 2), seedsFrom(724273));
const p = (o = {}) => ({ ...defaultNaming(), ...o });
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

describe('export names', () => {
  it('defaults and custom names', () => {
    expect(buildFileName(p(), b, '', 'wav')).toBe('The Breakery.wav');
    expect(buildFileName(p({ name: 'My Jungle Break' }), b, 'stems', 'zip')).toBe('My Jungle Break_stems.zip');
    expect(buildFileName(p({ name: 'My Jungle Break' }), b, 'loop', 'wav')).toBe('My Jungle Break_loop.wav');
  });
  it('sanitises', () => {
    expect(buildFileName(p({ name: '   ' }), b, '', 'wav')).toBe('The Breakery.wav');
    expect(buildFileName(p({ name: '  My Break' }), b, '', 'wav')).toBe('My Break.wav');
    expect(buildFileName(p({ name: 'Break: Version / 2' }), b, '', 'wav')).toBe('Break Version 2.wav');
    expect(buildFileName(p({ name: 'My Break.wav' }), b, '', 'wav')).toBe('My Break.wav');
    expect(buildFileName(p({ name: 'Break...' }), b, '', 'mid')).toBe('Break.mid');
    expect(buildFileName(p({ name: 'CON' }), b, '', 'wav')).toBe('CON_.wav');
    expect(buildFileName(p({ name: 'a\u0001b' }), b, '', 'wav')).toBe('ab.wav');
  });
  it('limits the whole name and keeps the extension', () => {
    const n = buildFileName(p({ name: 'x'.repeat(500), bpm: true }), b, 'stems', 'zip');
    expect(n.length).toBeLessThanOrEqual(120);
    expect(n.endsWith('BPM_stems.zip')).toBe(true);
  });
  it('suffix options in fixed order', () => {
    const on = p({ name: 'My Jungle Break', recipe: true, bpm: true, seed: true });
    expect(buildFileName(on, b, '', 'wav')).toBe(`My Jungle Break_Jungle_${b.recipe.bpm}BPM_724273.wav`);
    expect(buildFileName(on, b, 'stems', 'zip')).toBe(`My Jungle Break_Jungle_${b.recipe.bpm}BPM_724273_stems.zip`);
    expect(buildFileName(p({ name: 'M', bpm: true }), b, '', 'wav')).toBe(`M_${b.recipe.bpm}BPM.wav`);
    expect(buildFileName(p({ name: 'M', recipe: true }), b, '', 'wav')).toBe('M_Jungle.wav');
    expect(buildFileName(on, undefined, '', 'wav')).toBe('My Jungle Break.wav');
  });
  it('stem names share the base and never collide', () => {
    const names = stemFileNames(p({ name: 'My Jungle Break', bpm: true }), b, ['kick', 'snare', 'hat']);
    expect(names).toEqual([`My Jungle Break_${b.recipe.bpm}BPM_Kick.wav`, `My Jungle Break_${b.recipe.bpm}BPM_Snare.wav`, `My Jungle Break_${b.recipe.bpm}BPM_Hat.wav`]);
    const dup = stemFileNames(p(), b, ['kick', 'Kick', 'kick']);
    expect(new Set(dup.map((s) => s.toLowerCase())).size).toBe(3);
  });
  it('MIDI name changes but content does not', () => {
    const a = midiTakeaway(b, undefined, undefined, p({ name: 'My Jungle Break' }));
    const legacy = midiTakeaway(b);
    expect(a.name).toBe('My Jungle Break.mid');
    expect(Array.from(a.bytes)).toEqual(Array.from(legacy.bytes));
  });
  it('persists', () => {
    saveNaming(p({ name: 'Kept', bpm: true }));
    expect(loadNaming()).toEqual({ name: 'Kept', recipe: false, bpm: true, seed: false });
  });
});
