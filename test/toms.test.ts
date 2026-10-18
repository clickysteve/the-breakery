/**
 * TOMS: three tom categories through the whole instrument (generation, samples, solo / mute,
 * export, MIDI, editing, import), and tom fills that are musical, optional and never take over.
 */
import { describe, expect, it } from 'vitest';
import { audible, audibleCategories, emptyMix, sanitiseMix } from '../src/app/mix';
import { suggestCategory } from '../src/audio/categorise';
import { demoKit } from '../src/audio/demoKit';
import { breakTimeline } from '../src/audio/timeline';
import { addHit, findRef } from '../src/engine/edits';
import { bake, reseed, sanitiseRecipe, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { defaultRecipe, FLOURISH } from '../src/engine/styles';
import { CATEGORIES, GM_NOTE, isTom, STYLES, TOMS, type Bars, type Break, type BreakEvent, type Recipe } from '../src/engine/types';
import { breakMidi } from '../src/midi/breakMidi';
import { parseSmf } from '../src/midi/smf';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);
const fullKit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
const noTomKit = (): KitIndex => ({ ...fullKit(), htom: [], mtom: [], ltom: [] });
/** a recipe with ROLLS off unless asked for (tom rolls are ROLLS' business, tested with the rolls) */
const r = (style: Recipe['style'], bars: Bars, patch: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, bars), rolls: 0, ...patch });
const toms = (b: Break) => b.events.filter((e) => isTom(e.cat));
const same = (a: BreakEvent, b: BreakEvent) => a.cat === b.cat && a.bar === b.bar && a.step === b.step && a.sub === b.sub && a.vel === b.vel && a.offsetMs === b.offsetMs && a.swing === b.swing && a.sample === b.sample;
const posKey = (e: BreakEvent) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;

describe('tom categories', () => {
  it('are three distinct categories with their own GM notes, labels and demo sounds', () => {
    expect(TOMS).toEqual(['htom', 'mtom', 'ltom']);
    expect([GM_NOTE.htom, GM_NOTE.mtom, GM_NOTE.ltom]).toEqual([50, 47, 45]);
    for (const t of TOMS) expect(demoKit().filter((d) => d.cat === t)).toHaveLength(1);
  });

  it('are suggested from file and folder names; a plain "tom" is left for you to choose', () => {
    expect(suggestCategory('Kit/Toms/Hi Tom.wav').cat).toBe('htom');
    expect(suggestCategory('rack tom 2.wav').cat).toBe('htom');
    expect(suggestCategory('MidTom_01.wav').cat).toBe('mtom');
    expect(suggestCategory('Floor Tom.aif').cat).toBe('ltom');
    expect(suggestCategory('808/LT.wav').cat).toBe('ltom');
    expect(suggestCategory('Low Toms/tom 3.wav').cat).toBe('ltom');
    const plain = suggestCategory('Kit/Toms/tom 2.wav');
    expect(plain.cat).toBe('unsorted');
    expect(plain.reason).toContain('HIGH, MID or LOW');
    // words that merely contain "tom" are not toms
    expect(suggestCategory('custom snare.wav').cat).toBe('snare');
    expect(suggestCategory('atomic hat.wav').cat).toBe('hat');
  });

  it('solo and mute include the toms, and AUDIBLE MIX follows', () => {
    const m = emptyMix();
    m.mtom.mute = true;
    expect(audible(m, 'mtom')).toBe(false);
    expect(audibleCategories(m)).not.toContain('mtom');
    m.ltom.solo = true;
    expect(audibleCategories(m)).toEqual(['ltom']);
    expect(sanitiseMix({ htom: { solo: true } }).htom.solo).toBe(true);
    // a mix saved before toms existed loads with them audible
    expect(audible(sanitiseMix({ kick: { mute: true } }), 'htom')).toBe(true);
  });
});

describe('tom fills', () => {
  it('TOMS 0 adds no toms anywhere; the defaults add some in fills', () => {
    let some = 0;
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 10)) {
        expect(toms(bake(r(style, 4, { toms: 0 }), seedsFrom(seed), fullKit()))).toHaveLength(0);
        if (toms(bake(r(style, 4), seedsFrom(seed), fullKit())).length) some++;
      }
    expect(some).toBeGreaterThan(10);
  });

  it('play in fills and development, never in the groove bar, and every answer bar is the same', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 12)) {
        const b = bake(r(style, 8, { toms: 1, fills: 0.8, variation: 0.9 }), seedsFrom(seed), fullKit());
        for (const e of toms(b)) expect(['T', 'F', 'B', 'A2']).toContain(b.plan[e.bar]);
        const a2 = b.plan.flatMap((p, i) => (p === 'A2' ? [i] : []));
        const at = (bar: number, t: boolean) => b.events.filter((e) => e.bar === bar && isTom(e.cat) === t).map((e) => `${e.cat}${e.step}.${e.sub}`).join(' ');
        // answers that are the same bar (breakcore cuts each one up differently) get the same toms
        for (const i of a2) if (at(i, false) === at(a2[0]!, false)) expect(at(i, true)).toBe(at(a2[0]!, true));
      }
  });

  it('never take over: with the defaults, well under one tom stroke per bar on average; at most eight in a bar even at TOMS 1', () => {
    for (const style of STYLES) {
      let n = 0;
      for (const seed of SEEDS) n += toms(bake(r(style, 4), seedsFrom(seed), fullKit())).length;
      expect(n / (SEEDS.length * 4)).toBeLessThan(1);
      for (const seed of SEEDS.slice(0, 10)) {
        const b = bake(r(style, 4, { toms: 1, fills: 1 }), seedsFrom(seed), fullKit());
        for (let bar = 0; bar < 4; bar++) expect(toms(b).filter((e) => e.bar === bar).length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('change nothing else: every other hit keeps its velocity, timing and sample; only hands in the fill make room', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 8)) {
        const base = bake(r(style, 4, { toms: 0, fills: 0.7 }), seedsFrom(seed), fullKit());
        const withToms = bake(r(style, 4, { toms: 1, fills: 0.7 }), seedsFrom(seed), fullKit());
        const byKey = new Map(base.events.map((e) => [posKey(e), e]));
        for (const e of withToms.events) {
          const was = byKey.get(posKey(e));
          if (was) expect(same(e, was)).toBe(true);
          else expect(isTom(e.cat) || e.role === 'fill').toBe(true); // a tom, or a kick / snare of the tom figure
        }
        // what the toms removed: timekeeping, ghosts and percussion in the fill, or the snare fill they re-voice; never a backbeat or the downbeat kick
        const kept = new Set(withToms.events.map(posKey));
        for (const e of base.events.filter((x) => !kept.has(posKey(x)))) {
          expect(['hat', 'open', 'ride', 'ghost', 'perc', 'snare']).toContain(e.cat);
          if (e.cat === 'snare') expect(e.role === 'backbeat' || e.role === 'displaced backbeat').toBe(false);
        }
      }
  });

  it('are musical figures: a descending fill goes high → mid → low; an ascending one the other way', () => {
    let runs = 0;
    for (const style of STYLES)
      for (const seed of SEEDS) {
        const b = bake(r(style, 4, { toms: 1, fills: 0.8 }), seedsFrom(seed), fullKit());
        const t = toms(b).filter((e) => e.bar === 3);
        if (t.length < 3) continue;
        const order = t.map((e) => TOMS.indexOf(e.cat as (typeof TOMS)[number]));
        const why = t[0]!.why;
        if (why.includes('descending')) {
          runs++;
          for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!);
        } else if (why.includes('rising')) for (let i = 1; i < order.length; i++) expect(order[i]!).toBeLessThanOrEqual(order[i - 1]!);
      }
    expect(runs).toBeGreaterThan(20);
  });

  it('follow FILLS: with FILLS 0 and VARIATION 0 there are no toms at all', () => {
    for (const style of STYLES) for (const seed of SEEDS.slice(0, 6)) expect(toms(bake(r(style, 8, { toms: 1, fills: 0, variation: 0 }), seedsFrom(seed), fullKit()))).toHaveLength(0);
  });

  it('follow the recipe: hip-hop, boom bap and garage use fewer toms than funk and half-time', () => {
    const count = (style: Recipe['style']) => SEEDS.reduce((n, s) => n + toms(bake(r(style, 4, { toms: 0.6, fills: 0.6 }), seedsFrom(s), fullKit())).length, 0);
    expect(count('funk')).toBeGreaterThan(count('boombap'));
    expect(count('halftime')).toBeGreaterThan(count('garage'));
    expect(FLOURISH.funk.tomP).toBeGreaterThan(FLOURISH.hiphop.tomP);
  });

  it('are deterministic, and FREEZE BEAT keeps them where they are', () => {
    const a = bake(r('funk', 4, { toms: 0.9, fills: 0.7 }), seedsFrom(31), fullKit());
    const b = bake(r('funk', 4, { toms: 0.9, fills: 0.7 }), seedsFrom(31), fullKit());
    expect(toms(a).map(posKey)).toEqual(toms(b).map(posKey));
    let kept = 0;
    for (const seed of SEEDS.slice(0, 15)) {
      const s0 = seedsFrom(seed);
      const s1 = reseed(s0, { beat: true });
      const x = bake(r('funk', 4, { toms: 0.9, fills: 0.7 }), s0, fullKit());
      const y = bake(r('funk', 4, { toms: 0.9, fills: 0.7 }), s1, fullKit());
      if (toms(x).length) {
        kept++;
        expect(toms(y).map(posKey)).toEqual(toms(x).map(posKey));
      }
    }
    expect(kept).toBeGreaterThan(3);
  });

  it('engine 1 never plays toms (it is frozen as released)', () => {
    for (const seed of SEEDS.slice(0, 10)) expect(toms(bake({ ...defaultRecipe('funk', 4, 1), toms: 1, fills: 1 }, seedsFrom(seed), fullKit()))).toHaveLength(0);
  });
});

describe('tom samples', () => {
  const tomBreak = (kit: KitIndex, samples = {}) => {
    for (const seed of SEEDS) {
      const b = bake(r('funk', 4, { toms: 1, fills: 0.9 }), seedsFrom(seed), kit, samples);
      if (toms(b).length >= 4) return b;
    }
    throw new Error('no tom fill');
  };

  it('without tom samples, tom hits are silent and nothing borrows or lends a sound', () => {
    const b = tomBreak(noTomKit());
    for (const e of toms(b)) expect(e.sample).toBeNull();
    for (const e of b.events.filter((x) => !isTom(x.cat))) expect(e.sample).not.toBeNull();
    // and the break itself is the same as with tom samples (the rhythm never depends on the kit)
    const withSamples = bake(b.recipe, b.seeds, fullKit());
    expect(withSamples.events.map(posKey)).toEqual(b.events.map(posKey));
    expect(breakTimeline(b).events.some((n) => n.type === 'note' && isTom(n.voice as never))).toBe(false);
  });

  it('every sample-selection mode works for toms', () => {
    const rr = tomBreak(fullKit(), { settings: { htom: { mode: 'roundrobin' }, mtom: { mode: 'fixed', fixed: 'mtom-c' }, ltom: { mode: 'velocity' } } });
    const hi = toms(rr).filter((e) => e.cat === 'htom');
    hi.forEach((e, i) => expect(e.sample).toBe(`htom-${'abc'[i % 3]}`));
    for (const e of toms(rr).filter((x) => x.cat === 'mtom')) expect(e.sample).toBe('mtom-c');
    for (const e of toms(rr).filter((x) => x.cat === 'ltom')) expect(e.sample).toMatch(/^ltom-/);
    for (const mode of ['auto', 'random', 'weighted', 'alternate', 'perbar'] as const) {
      const b = tomBreak(fullKit(), { settings: { htom: { mode }, mtom: { mode }, ltom: { mode } } });
      for (const e of toms(b)) expect(e.sample).toMatch(new RegExp(`^${e.cat}-`));
    }
  });

  it('reach the timeline (playback and WAV), the stems and the MIDI file', () => {
    const b = tomBreak(fullKit());
    const tl = breakTimeline(b);
    expect(tl.voices.map((v) => v.id)).toEqual(expect.arrayContaining([...TOMS]));
    const tomNotes = tl.events.filter((n) => n.type === 'note' && isTom(n.voice as never));
    expect(tomNotes.length).toBe(toms(b).length);
    // AUDIBLE MIX / stems: the timeline of just the toms
    expect(breakTimeline(b, ['htom', 'mtom', 'ltom']).events.length).toBe(toms(b).length);
    const smf = parseSmf(breakMidi(b).bytes);
    const keys = new Set(smf.notes.map((n) => n.note));
    for (const t of new Set(toms(b).map((e) => e.cat))) expect(keys.has(GM_NOTE[t])).toBe(true);
    // one track per category that plays, named after it
    expect(new TextDecoder().decode(breakMidi(b).bytes)).toMatch(/(HIGH|MID|LOW) TOM/);
  });

  it('can be edited by hand like any other hit', () => {
    const b = bake(r('funk', 2, { toms: 0 }), seedsFrom(5), fullKit());
    const e = addHit({ removed: [], changed: {}, added: [] }, b.events, { cat: 'ltom', bar: 1, step: 14, sub: 0 });
    const ed = bake(b.recipe, b.seeds, fullKit(), {}, (x) => x, e.edits);
    const t = findRef(ed.events, e.ref)!;
    expect(t.cat).toBe('ltom');
    expect(t.sample).toMatch(/^ltom-/);
    expect(t.vel).toBeGreaterThan(80);
  });

  it('recipes saved before toms existed load with TOMS 0', () => {
    const old = { ...defaultRecipe('funk', 2) } as Partial<Recipe>;
    delete old.toms;
    expect(sanitiseRecipe(old as Recipe).toms).toBe(0);
  });
});
