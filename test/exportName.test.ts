/**
 * Export names (Phase 15): the ordered component builder, separators, the LOOP suffix, stems,
 * the batch, sanitising, and the migration of the Phase 14 preferences.
 */
import { describe, expect, it } from 'vitest';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { buildFileName, defaultNaming, loadNaming, masterSuffix, migrateNaming, movePart, NAME_PARTS, sanitiseNaming, saveNaming, stemFileNames, uniqueName, type NamePart, type NamingPrefs } from '../src/audio/exportName';
import { midiTakeaway } from '../src/audio/takeaway';
import { CATEGORIES, CATEGORY_LABEL, type Break } from '../src/engine/types';

const b = bake(defaultRecipe('jungle', 2), seedsFrom(724273));
const hc: Break = { ...bake({ ...defaultRecipe('hardcore', 2), bpm: 152 }, seedsFrom(5)), seedName: 'CHICKENHAT' };
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

/** Prefs with these components on, in this order (the rest off, after them). */
const only = (ids: NamePart[], o: Partial<NamingPrefs> = {}): NamingPrefs => ({ ...defaultNaming(), parts: [...ids.map((id) => ({ id, on: true })), ...NAME_PARTS.filter((x) => !ids.includes(x)).map((id) => ({ id, on: false }))], ...o });

describe('export names: the component builder', () => {
  it('the spec examples: order is the user’s', () => {
    expect(buildFileName(defaultNaming(), hc, '', 'wav')).toBe('152_HARDCORE_CHICKENHAT.wav');
    expect(buildFileName(only(['seed', 'recipe', 'bpm']), hc, '', 'wav')).toBe('CHICKENHAT_HARDCORE_152.wav');
    expect(stemFileNames(defaultNaming(), hc, ['KICK'])[0]).toBe('152_HARDCORE_CHICKENHAT_KICK.wav');
  });
  it('the master gets _LOOP only with stems (by default), always, or never', () => {
    const p = defaultNaming();
    expect(p.loop).toBe('stems');
    expect(buildFileName(p, hc, masterSuffix(p, false), 'wav')).toBe('152_HARDCORE_CHICKENHAT.wav');
    expect(buildFileName(p, hc, masterSuffix(p, true), 'wav')).toBe('152_HARDCORE_CHICKENHAT_LOOP.wav');
    expect(masterSuffix({ ...p, loop: 'always' }, false)).toBe('LOOP');
    expect(masterSuffix({ ...p, loop: 'never' }, true)).toBe('');
  });
  it('separators: underscore, hyphen, space; never doubled or trailing', () => {
    expect(buildFileName({ ...defaultNaming(), sep: 'hyphen' }, hc, 'LOOP', 'wav')).toBe('152-HARDCORE-CHICKENHAT-LOOP.wav');
    expect(buildFileName({ ...defaultNaming(), sep: 'space' }, hc, 'HIGH TOM', 'wav')).toBe('152 HARDCORE CHICKENHAT HIGH TOM.wav');
    expect(buildFileName(only(['custom', 'bpm'], { custom: '__My break__' }), hc, '', 'wav')).toBe('My break_152.wav');
    expect(buildFileName(only(['custom', 'bpm'], { custom: '--x--', sep: 'hyphen' }), hc, '', 'wav')).toBe('x-152.wav');
    expect(buildFileName(only(['custom', 'personality', 'bpm'], { custom: 'A' }), hc, '', 'wav')).toBe('A_152.wav'); // no personality: skipped, no double separator
    expect(buildFileName(only(['custom'], { custom: 'A' }), hc, 'HIGH TOM', 'wav')).toBe('A_HIGH_TOM.wav');
  });
  it('sanitises; keeps Unicode; never empty or a device name', () => {
    expect(buildFileName(only(['custom'], { custom: '   ' }), b, '', 'wav')).toBe('The Breakery.wav');
    expect(buildFileName(only([], {}), b, '', 'wav')).toBe('The Breakery.wav');
    expect(buildFileName(only(['custom'], { custom: 'Break: Version / 2' }), b, '', 'wav')).toBe('Break Version 2.wav');
    expect(buildFileName(only(['custom'], { custom: 'My Break.wav' }), b, '', 'wav')).toBe('My Break.wav');
    expect(buildFileName(only(['custom'], { custom: 'CON' }), b, '', 'wav')).toBe('CON_.wav');
    expect(buildFileName(only(['custom'], { custom: 'a\u0001b' }), b, '', 'wav')).toBe('ab.wav');
    expect(buildFileName(only(['custom'], { custom: 'Café Brötchen 🥐' }), b, '', 'wav')).toBe('Café Brötchen 🥐.wav');
  });
  it('limits the whole name and keeps the suffix and extension', () => {
    const n = buildFileName(only(['custom', 'bpm'], { custom: 'x'.repeat(500) }), b, 'STEMS', 'zip');
    expect(n.length).toBeLessThanOrEqual(120);
    expect(n.endsWith('_STEMS.zip')).toBe(true);
  });
  it('kit name, personality and BREAK DNA components', () => {
    const p = only(['kit', 'personality', 'dna']);
    const x = { ...bake({ ...defaultRecipe('funk', 2), personality: { id: 'dilla', amount: 0.7 }, dna: { id: 'amen', amount: 0.5 } }, seedsFrom(3)) } as Break;
    expect(buildFileName(p, x, '', 'wav', 'My Kit')).toBe(`My Kit_DILLA_${'AMEN'}.wav`.replace('AMEN', buildFileName(only(['dna']), x, '', 'wav').replace('.wav', '')));
    expect(buildFileName(p, x, '', 'wav')).not.toMatch(/^_/);
  });
  it('stem names are unique (against the master too)', () => {
    const names = stemFileNames(defaultNaming(), hc, CATEGORIES.map((c) => CATEGORY_LABEL[c]), null, ['152_HARDCORE_CHICKENHAT_LOOP.wav']);
    expect(new Set(names.map((s) => s.toLowerCase())).size).toBe(CATEGORIES.length);
    expect(names).toContain('152_HARDCORE_CHICKENHAT_HIGH_TOM.wav');
    expect(names).toContain('152_HARDCORE_CHICKENHAT_CLAP.wav');
    expect(names).toContain('152_HARDCORE_CHICKENHAT_FX.wav');
    const dup = stemFileNames(defaultNaming(), hc, ['kick', 'Kick', 'kick']);
    expect(new Set(dup.map((s) => s.toLowerCase())).size).toBe(3);
  });
  it('batch names are unique within the ZIP', () => {
    const seen = new Set<string>();
    const p = only(['recipe']);
    expect([uniqueName(buildFileName(p, b, '', 'wav'), seen, p), uniqueName(buildFileName(p, b, '', 'wav'), seen, p)]).toEqual(['JUNGLE.wav', 'JUNGLE_2.wav']);
  });
  it('moving a component up and down', () => {
    const p = movePart(defaultNaming(), 'seed', -1);
    expect(p.parts.slice(0, 3).map((x) => x.id)).toEqual(['bpm', 'seed', 'recipe']);
    expect(movePart(p, 'bpm', -1)).toBe(p); // already first
  });
  it('MIDI name changes but content does not', () => {
    const a = midiTakeaway(b, undefined, undefined, only(['custom'], { custom: 'My Jungle Break' }));
    const legacy = midiTakeaway(b);
    expect(a.name).toBe('My Jungle Break.mid');
    expect(Array.from(a.bytes)).toEqual(Array.from(legacy.bytes));
  });
});

describe('export names: preferences', () => {
  it('Phase 14 preferences migrate: base name first, then RECIPE, BPM, SEED as ticked', () => {
    mem.set('breakery.exportName', JSON.stringify({ name: 'My Jungle Break', recipe: true, bpm: false, seed: true }));
    const p = loadNaming();
    expect(p.parts.filter((x) => x.on).map((x) => x.id)).toEqual(['custom', 'recipe', 'seed']);
    expect(p.custom).toBe('My Jungle Break');
    expect(buildFileName(p, b, '', 'wav')).toBe('My Jungle Break_JUNGLE_724273.wav');
    // an untouched Phase 14 default keeps its name
    expect(buildFileName(migrateNaming({ name: 'The Breakery', recipe: false, bpm: false, seed: false }), b, '', 'wav')).toBe('The Breakery.wav');
  });
  it('persist, order included; damaged data is repaired', () => {
    const p = movePart({ ...defaultNaming(), sep: 'hyphen', loop: 'never', custom: 'Kept' }, 'dna', -1);
    saveNaming(p);
    expect(loadNaming()).toEqual(p);
    const fixed = sanitiseNaming({ parts: [{ id: 'seed', on: true }, { id: 'seed', on: false }, { id: 'bogus', on: true }], sep: 'tab', loop: 'x' });
    expect(fixed.parts.map((x) => x.id).sort()).toEqual([...NAME_PARTS].sort());
    expect(fixed.parts[0]).toEqual({ id: 'seed', on: true });
    expect(fixed.sep).toBe('underscore');
    expect(fixed.loop).toBe('stems');
  });
});
