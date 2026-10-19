/**
 * TOMS: three tom categories through the whole instrument (generation, samples, solo / mute,
 * export, MIDI, editing, import); TOM ACTIVITY's phrases (revision 1), an intensity that is
 * musical, independent of ROLLS, adapted to the toms the kit has, and never a takeover; and the
 * tom fills as released (revision 0), which saved breaks still reproduce exactly.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { audible, audibleCategories, emptyMix, sanitiseMix } from '../src/app/mix';
import { suggestCategory } from '../src/audio/categorise';
import { demoKit } from '../src/audio/demoKit';
import { breakTimeline } from '../src/audio/timeline';
import { addHit, findRef } from '../src/engine/edits';
import { bake, reseed, sanitiseRecipe, seedsFrom } from '../src/engine/generate';
import { hashString } from '../src/engine/rng';
import { spread, tomVoices } from '../src/engine/toms';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { defaultRecipe, FLOURISH } from '../src/engine/styles';
import { CATEGORIES, CURRENT_REVISION, GM_NOTE, isTom, STEPS, STYLES, TOMS, TPS, type Bars, type Break, type BreakEvent, type Category, type Recipe, type Seeds } from '../src/engine/types';
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
/** the same as released, before TOM ACTIVITY's phrases (revision 0) */
const r0 = (style: Recipe['style'], bars: Bars, patch: Partial<Recipe> = {}): Recipe => r(style, bars, { revision: 0, ...patch });
/** TOM ACTIVITY's phrases as revision 1 made them (saved breaks reproduce them; revision 2 recalibrated the curve) */
const r1 = (style: Recipe['style'], bars: Bars, patch: Partial<Recipe> = {}): Recipe => r(style, bars, { revision: 1, ...patch });
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

describe('tom fills as released (revision 0, kept for saved breaks)', () => {
  it('TOMS 0 adds no toms anywhere; the defaults add some in fills', () => {
    let some = 0;
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 10)) {
        expect(toms(bake(r0(style, 4, { toms: 0 }), seedsFrom(seed), fullKit()))).toHaveLength(0);
        if (toms(bake(r0(style, 4), seedsFrom(seed), fullKit())).length) some++;
      }
    expect(some).toBeGreaterThan(10);
  });

  it('play in fills and development, never in the groove bar, and every answer bar is the same', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 12)) {
        const b = bake(r0(style, 8, { toms: 1, fills: 0.8, variation: 0.9 }), seedsFrom(seed), fullKit());
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
      for (const seed of SEEDS) n += toms(bake(r0(style, 4), seedsFrom(seed), fullKit())).length;
      expect(n / (SEEDS.length * 4)).toBeLessThan(1);
      for (const seed of SEEDS.slice(0, 10)) {
        const b = bake(r0(style, 4, { toms: 1, fills: 1 }), seedsFrom(seed), fullKit());
        for (let bar = 0; bar < 4; bar++) expect(toms(b).filter((e) => e.bar === bar).length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('change nothing else: every other hit keeps its velocity, timing and sample; only hands in the fill make room', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 8)) {
        const base = bake(r0(style, 4, { toms: 0, fills: 0.7 }), seedsFrom(seed), fullKit());
        const withToms = bake(r0(style, 4, { toms: 1, fills: 0.7 }), seedsFrom(seed), fullKit());
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
        const b = bake(r0(style, 4, { toms: 1, fills: 0.8 }), seedsFrom(seed), fullKit());
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
    for (const style of STYLES) for (const seed of SEEDS.slice(0, 6)) expect(toms(bake(r0(style, 8, { toms: 1, fills: 0, variation: 0 }), seedsFrom(seed), fullKit()))).toHaveLength(0);
  });

  it('follow the recipe: hip-hop, boom bap and garage use fewer toms than funk and half-time', () => {
    const count = (style: Recipe['style']) => SEEDS.reduce((n, s) => n + toms(bake(r0(style, 4, { toms: 0.6, fills: 0.6 }), seedsFrom(s), fullKit())).length, 0);
    expect(count('funk')).toBeGreaterThan(count('boombap'));
    expect(count('halftime')).toBeGreaterThan(count('garage'));
    expect(FLOURISH.funk.tomP).toBeGreaterThan(FLOURISH.hiphop.tomP);
  });

  it('are deterministic, and FREEZE BEAT keeps them where they are', () => {
    const a = bake(r0('funk', 4, { toms: 0.9, fills: 0.7 }), seedsFrom(31), fullKit());
    const b = bake(r0('funk', 4, { toms: 0.9, fills: 0.7 }), seedsFrom(31), fullKit());
    expect(toms(a).map(posKey)).toEqual(toms(b).map(posKey));
    let kept = 0;
    for (const seed of SEEDS.slice(0, 15)) {
      const s0 = seedsFrom(seed);
      const s1 = reseed(s0, { beat: true });
      const x = bake(r0('funk', 4, { toms: 0.9, fills: 0.7 }), s0, fullKit());
      const y = bake(r0('funk', 4, { toms: 0.9, fills: 0.7 }), s1, fullKit());
      if (toms(x).length) {
        kept++;
        expect(toms(y).map(posKey)).toEqual(toms(x).map(posKey));
      }
    }
    expect(kept).toBeGreaterThan(3);
  });

  it('reproduce saved breaks exactly: tom and roll fingerprints from before revision 1', () => {
    const golden = JSON.parse(readFileSync(new URL('./fixtures/toms-rolls-rev0-golden.json', import.meta.url), 'utf8')) as { recipe: Recipe; seeds: Seeds; n: number; hash: string }[];
    const k = emptyKit();
    for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`];
    const flat = (b: Break) => b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.role, e.sample]);
    expect(golden.length).toBe(110);
    for (const g of golden) {
      expect('revision' in g.recipe).toBe(false);
      const b = bake(g.recipe, g.seeds, k);
      expect(b.events.length).toBe(g.n);
      expect(hashString(JSON.stringify(flat(b))).toString(16)).toBe(g.hash);
    }
  });

  it('engine 1 never plays toms (it is frozen as released)', () => {
    for (const seed of SEEDS.slice(0, 10)) expect(toms(bake({ ...defaultRecipe('funk', 4, 1), toms: 1, fills: 1 }, seedsFrom(seed), fullKit()))).toHaveLength(0);
  });
});

describe('TOM ACTIVITY: tom phrases (revision 1)', () => {
  const S = SEEDS.slice(0, 24);
  const breaks = (style: Recipe['style'], t: number, bars: Bars = 4, patch: Partial<Recipe> = {}, kit: KitIndex = fullKit()) => S.map((s) => bake(r1(style, bars, { toms: t, ...patch }), seedsFrom(s), kit));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const tomPos = (b: Break) => toms(b).map(posKey);
  const isBackbeat = (e: BreakEvent) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');
  /** tom phrases: tom hits of one bar, a new phrase after a gap of more than an eighth */
  const phrases = (b: Break) => {
    let n = 0;
    for (let bar = 0; bar < b.plan.length; bar++) {
      const st = toms(b).filter((e) => e.bar === bar).map((e) => e.step).sort((x, y) => x - y);
      st.forEach((x, i) => (i === 0 || x - st[i - 1]! > 2) && n++);
    }
    return n;
  };

  it('new recipes are baked with it; recipes saved before keep revision 0, engine 1 has none', () => {
    expect(defaultRecipe('funk', 4).revision).toBe(CURRENT_REVISION);
    expect('revision' in sanitiseRecipe({ ...defaultRecipe('funk', 4), revision: undefined })).toBe(false);
    expect(sanitiseRecipe({ ...defaultRecipe('funk', 4), revision: 99 }).revision).toBe(CURRENT_REVISION);
    expect('revision' in sanitiseRecipe({ ...defaultRecipe('funk', 4, 1), revision: 1 })).toBe(false);
  });

  it('0% adds no toms, and the break is exactly what it was before revision 1', () => {
    for (const style of STYLES)
      for (const seed of S.slice(0, 8)) {
        // (revision 2: revision 3 changes the rest of the break too)
        const rec = { ...defaultRecipe(style, 4), toms: 0, revision: 2 };
        const b = bake(rec, seedsFrom(seed), fullKit());
        // tom rolls belong to ROLLS, not to TOM ACTIVITY
        expect(toms(b).filter((e) => e.role !== 'roll')).toHaveLength(0);
        expect(toms(bake({ ...rec, rolls: 0 }, seedsFrom(seed), fullKit()))).toHaveLength(0);
        expect(b.events).toEqual(bake({ ...rec, revision: 0 }, seedsFrom(seed), fullKit()).events);
      }
  });

  it('is an intensity: 20% sparse, 50% clearly more, 75% more again, 100% substantial in every recipe', () => {
    for (const style of STYLES) {
      const m = [0.2, 0.5, 0.75, 1].map((t) => mean(breaks(style, t).map((b) => toms(b).length)));
      const ph = [0.2, 0.5, 1].map((t) => mean(breaks(style, t).map(phrases)));
      expect(m[0], style).toBeGreaterThan(0.3);
      expect(m[0], style).toBeLessThan(4);
      expect(m[1], style).toBeGreaterThan(m[0]! * 1.8);
      expect(m[2], style).toBeGreaterThan(m[1]!);
      expect(m[3], style).toBeGreaterThan(m[2]!);
      expect(m[3], style).toBeGreaterThanOrEqual(6);
      // more phrases, not only longer ones
      expect(ph[2], style).toBeGreaterThan(ph[0]! + 1);
    }
  });

  it('at 100% no four-bar pattern is left nearly without toms: several hits, in at least two bars, on at least two toms', () => {
    for (const style of STYLES)
      for (const b of breaks(style, 1)) {
        const t = toms(b);
        expect(t.length, style).toBeGreaterThanOrEqual(3);
        expect(new Set(t.map((e) => e.bar)).size, style).toBeGreaterThanOrEqual(2);
        expect(new Set(t.map((e) => e.cat)).size, style).toBeGreaterThanOrEqual(2);
      }
  });

  it('at 100% is not clutter: at most ten tom strokes in a bar, and under a third of the pattern’s sixteenths', () => {
    for (const style of STYLES)
      for (const bars of [4, 8] as const)
        for (const b of breaks(style, 1, bars, { fills: 1 })) {
          for (let bar = 0; bar < bars; bar++) expect(toms(b).filter((e) => e.bar === bar).length).toBeLessThanOrEqual(10);
          expect(new Set(toms(b).map((e) => e.bar * STEPS + e.step)).size).toBeLessThan((bars * STEPS) / 3);
        }
  });

  it('follows the recipe: hip-hop, boom bap and garage sparser than funk, hardcore and breakcore', () => {
    const n = (style: Recipe['style']) => mean(breaks(style, 0.75).map((b) => toms(b).length));
    for (const sparse of ['hiphop', 'boombap', 'garage'] as const) for (const busy of ['funk', 'hardcore', 'breakcore'] as const) expect(n(sparse), `${sparse} < ${busy}`).toBeLessThan(n(busy));
    // D&B keeps to fills and transitions: fewer phrases inside the bar than BROKEN's call and response
    const inside = (style: Recipe['style']) => mean(breaks(style, 1).map((b) => toms(b).filter((e) => e.role === 'accent').length));
    expect(inside('dnb')).toBeLessThan(inside('broken'));
  });

  it('is independent of ROLLS: the toms are the same with roll generation off or on, and at any roll probability', () => {
    for (const style of STYLES)
      for (const seed of S.slice(0, 10)) {
        const rec = r1(style, 4, { toms: 1, rolls: 1, rollPlace: 'anywhere' });
        const nonRoll = (b: Break) => toms(b).filter((e) => e.role !== 'roll').map(posKey);
        const on = bake(rec, seedsFrom(seed), fullKit());
        expect(nonRoll(bake({ ...rec, rollsOn: false }, seedsFrom(seed), fullKit())), style).toEqual(nonRoll(on));
        expect(nonRoll(bake({ ...rec, rolls: 0 }, seedsFrom(seed), fullKit())), style).toEqual(nonRoll(on));
      }
  });

  it('with roll generation completely off, plays tom fills as ordinary hits: descending runs and snare into toms', () => {
    let down = 0;
    let snare = 0;
    for (const style of STYLES)
      for (const b of breaks(style, 1, 4, { rollsOn: false })) {
        expect(b.events.some((e) => e.role === 'roll')).toBe(false);
        for (let bar = 0; bar < 4; bar++) {
          const t = toms(b).filter((e) => e.bar === bar && e.role === 'fill');
          if (t.some((e) => e.why.startsWith('tom fill descending'))) down++;
          if (t.some((e) => e.why.startsWith('snare into a tom fill'))) snare++;
        }
      }
    expect(down).toBeGreaterThan(20);
    expect(snare).toBeGreaterThan(10);
  });

  it('plays musical figures: descending runs go high → low, rising ones low → high; never on a backbeat or a downbeat', () => {
    let runs = 0;
    for (const style of STYLES)
      for (const b of breaks(style, 1, 8)) {
        for (let bar = 0; bar < 8; bar++) {
          const t = toms(b).filter((e) => e.bar === bar && e.role === 'fill');
          const order = t.map((e) => TOMS.indexOf(e.cat as (typeof TOMS)[number]));
          if (t.length >= 3 && t[0]!.why.includes('descending')) {
            runs++;
            for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!);
          } else if (t.length >= 3 && t[0]!.why.startsWith('rising')) for (let i = 1; i < order.length; i++) expect(order[i]!).toBeLessThanOrEqual(order[i - 1]!);
        }
        for (const e of toms(b)) {
          expect(e.step === 0 && e.sub === 0).toBe(false);
          expect(b.events.some((x) => isBackbeat(x) && x.bar === e.bar && x.step === e.step && x.sub === e.sub)).toBe(false);
        }
      }
    expect(runs).toBeGreaterThan(40);
  });

  it('places phrases through the pattern, at phrase ends first: the turnaround nearly always, more bars as it rises, the first bar never', () => {
    for (const style of STYLES) {
      const at = (t: number) => breaks(style, t, 8);
      const lastBar = at(0.5).filter((b) => toms(b).some((e) => e.bar === 7)).length;
      expect(lastBar / S.length, style).toBeGreaterThan(0.8);
      const barsWith = (t: number) => mean(at(t).map((b) => new Set(toms(b).map((e) => e.bar)).size));
      expect(barsWith(1), style).toBeGreaterThan(barsWith(0.2) + 2);
      for (const b of at(1)) expect(toms(b).some((e) => e.bar === 0)).toBe(false);
      // not only at the very end of the pattern
      expect(mean(at(0.75).map((b) => toms(b).filter((e) => e.bar < 7).length)), style).toBeGreaterThan(2);
    }
  });

  it('keeps the phrase structure: every answer bar gets the same toms, and the groove bars stay the groove at moderate activity', () => {
    for (const style of STYLES)
      for (const b of breaks(style, 0.75, 8)) {
        const a2 = b.plan.flatMap((p, i) => (p === 'A2' ? [i] : []));
        const at = (bar: number, t: boolean) => b.events.filter((e) => e.bar === bar && isTom(e.cat) === t).map((e) => `${e.cat}${e.step}.${e.sub}`).join(' ');
        for (const i of a2) if (at(i, false) === at(a2[0]!, false)) expect(at(i, true)).toBe(at(a2[0]!, true));
      }
    for (const style of STYLES)
      for (const b of breaks(style, 0.4, 8)) for (const e of toms(b)) expect(b.plan[e.bar], style).not.toBe('A');
  });

  it('changes nothing else: every other hit keeps its velocity, timing and sample; only hands in a fill, and snares it re-voices, make room', () => {
    for (const style of STYLES)
      for (const seed of S.slice(0, 8)) {
        const base = bake(r1(style, 4, { toms: 0 }), seedsFrom(seed), fullKit());
        const withToms = bake(r1(style, 4, { toms: 1 }), seedsFrom(seed), fullKit());
        const byKey = new Map(base.events.map((e) => [posKey(e), e]));
        for (const e of withToms.events) {
          const was = byKey.get(posKey(e));
          if (was) expect(same(e, was)).toBe(true);
          else expect(isTom(e.cat) || e.role === 'fill').toBe(true);
        }
        const kept = new Set(withToms.events.map(posKey));
        for (const e of base.events.filter((x) => !kept.has(posKey(x)))) {
          expect(['hat', 'open', 'ride', 'ghost', 'perc', 'snare']).toContain(e.cat);
          if (e.cat === 'snare') expect(isBackbeat(e)).toBe(false);
        }
      }
  });

  it('stays inside the pattern', () => {
    for (const style of STYLES)
      for (const bars of [1, 2, 3, 4, 5, 6, 7, 8] as const)
        for (const b of breaks(style, 1, bars).slice(0, 6))
          for (const e of toms(b)) {
            expect(e.bar).toBeGreaterThanOrEqual(0);
            expect(e.bar).toBeLessThan(bars);
            expect(e.step).toBeGreaterThanOrEqual(0);
            expect(e.step).toBeLessThan(STEPS);
            expect(e.sub).toBeGreaterThanOrEqual(0);
            expect(e.sub).toBeLessThan(TPS);
          }
  });

  it('is deterministic, and FREEZE BEAT keeps the phrases where they are', () => {
    for (const style of STYLES) {
      const a = bake(r1(style, 4, { toms: 0.8 }), seedsFrom(31), fullKit());
      expect(bake(r1(style, 4, { toms: 0.8 }), seedsFrom(31), fullKit()).events).toEqual(a.events);
    }
    let kept = 0;
    for (const seed of S.slice(0, 15)) {
      const s0 = seedsFrom(seed);
      const x = bake(r1('funk', 4, { toms: 0.9 }), s0, fullKit());
      const y = bake(r1('funk', 4, { toms: 0.9 }), reseed(s0, { beat: true }), fullKit());
      if (toms(x).length) {
        kept++;
        expect(tomPos(y)).toEqual(tomPos(x));
      }
    }
    expect(kept).toBeGreaterThan(10);
  });

  it('no longer needs FILLS or VARIATION: TOM ACTIVITY alone decides', () => {
    for (const style of STYLES) expect(mean(breaks(style, 1, 4, { fills: 0, variation: 0 }).map((b) => toms(b).length)), style).toBeGreaterThan(4);
  });

  it('plays its phrases on the toms the kit has, on the same rhythm: three, two, one, or (for MIDI) none', () => {
    const only = (...cats: Category[]) => ({ ...fullKit(), htom: [], mtom: [], ltom: [], ...Object.fromEntries(cats.map((c) => [c, [`${c}-a`]])) }) as KitIndex;
    expect(tomVoices(fullKit())).toEqual(['htom', 'mtom', 'ltom']);
    expect(tomVoices(only('htom', 'ltom'))).toEqual(['htom', 'ltom']);
    expect(tomVoices(only('mtom'))).toEqual(['mtom']);
    expect(tomVoices(noTomKit())).toEqual(['htom', 'mtom', 'ltom']);
    let three = 0;
    for (const style of ['funk', 'jungle', 'broken', 'dnb'] as const)
      for (const seed of S.slice(0, 10)) {
        const rec = r1(style, 4, { toms: 1 });
        const full = bake(rec, seedsFrom(seed), fullKit());
        if (new Set(toms(full).map((e) => e.cat)).size === 3) three++;
        const where = (b: Break) => toms(b).map((e) => `${e.bar}|${e.step}|${e.sub}`);
        for (const [kit, cats] of [[only('htom', 'ltom'), ['htom', 'ltom']], [only('mtom'), ['mtom']], [only('ltom'), ['ltom']]] as [KitIndex, Category[]][]) {
          const b = bake(rec, seedsFrom(seed), kit);
          expect(where(b)).toEqual(where(full));
          for (const e of toms(b)) {
            expect(cats).toContain(e.cat);
            expect(e.sample).toBe(`${e.cat}-a`);
          }
          if (cats.length === 2) expect(new Set(toms(b).map((e) => e.cat)).size).toBe(2);
        }
        // no tom samples: the same phrases, on all three toms (MIDI plays them), silent here
        const none = bake(rec, seedsFrom(seed), noTomKit());
        expect(tomPos(none)).toEqual(tomPos(full));
        for (const e of toms(none)) expect(e.sample).toBeNull();
      }
    expect(three).toBeGreaterThan(30);
    // the voice spread: a run always reaches the last voice
    expect([0, 1, 2, 3].map((k) => spread(k, 4, true, TOMS))).toEqual(['htom', 'mtom', 'mtom', 'ltom']);
    expect([0, 1, 2].map((k) => spread(k, 3, false, ['htom', 'ltom']))).toEqual(['ltom', 'htom', 'htom']);
    expect(spread(0, 1, true, ['mtom'])).toBe('mtom');
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
