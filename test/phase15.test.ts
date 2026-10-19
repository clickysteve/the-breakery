/**
 * Phase 15: workflow, track expansion and state. CLAP and FX (GROOVE revision 5), and revision 4
 * reproducing exactly; the app-level features (New Patch, WILDCARD report, export names, undo)
 * are tested further down.
 */
import { describe, expect, it } from 'vitest';
import { bake, groove, mutate, sanitiseRecipe, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, CLAPFX_REVISION, CURRENT_REVISION, GM_NOTE, LEGACY_CATEGORIES, STEPS, STYLES, type Bars, type Break, type Recipe } from '../src/engine/types';
import { PERSONALITIES } from '../src/engine/personality';
import { DNA_IDS } from '../src/engine/dna';
import { defaultDestroy2 } from '../src/engine/destroy2';
import { CLAP_DEFAULT, clapActivity, FX_DEFAULT, fxActivity } from '../src/engine/clapfx';

const OLD = ['kick', 'snare', 'ghost', 'htom', 'mtom', 'ltom', 'hat', 'open', 'ride', 'crash', 'perc'] as const;
const kitOf = (cats: readonly string[]): KitIndex => {
  const k = emptyKit() as Record<string, string[]>;
  for (const c of cats) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k as KitIndex;
};
const K11 = kitOf(OLD);
const K13 = kitOf(CATEGORIES);
const SEEDS = [13, 4242, 7919, 31337, 900001];

describe('tracks (Phase 15)', () => {
  it('13 tracks in display order, all three toms kept, the 11 legacy tracks unchanged in name', () => {
    expect(CATEGORIES).toEqual(['kick', 'snare', 'ghost', 'clap', 'htom', 'mtom', 'ltom', 'hat', 'open', 'ride', 'crash', 'perc', 'fx']);
    expect(LEGACY_CATEGORIES).toEqual([...OLD]);
    expect(LEGACY_CATEGORIES.every((c) => CATEGORIES.includes(c))).toBe(true);
  });
  it('CLAP is GM Hand Clap; PERC and FX never share its note', () => {
    expect(GM_NOTE.clap).toBe(39);
    expect(GM_NOTE.perc).not.toBe(39);
    expect(GM_NOTE.fx).not.toBe(GM_NOTE.clap);
    expect(new Set(CATEGORIES.filter((c) => c !== 'ghost').map((c) => GM_NOTE[c])).size).toBe(CATEGORIES.length - 1);
  });
});

describe('GROOVE revision 4 reproduces exactly (fingerprint taken on main before Phase 15)', () => {
  it('every recipe, personality, DNA, CHOP and DESTROY at revision 4', () => {
    let h = 2166136261 >>> 0;
    const add = (s: string) => {
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
    };
    const B = (r: Recipe, seed: number) => bake(r, seedsFrom(seed), K11, {}, (id) => id);
    const row = (b: Break) => JSON.stringify(b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.sample, e.role, e.pitch ?? 0, e.reverse ? 1 : 0, e.gate ?? null, e.tape ?? null]));
    for (const st of STYLES) for (const seed of [13, 4242, 7919]) for (const bars of [2, 4, 8] as Bars[]) for (const rollsOn of [false, true]) add(row(B({ ...defaultRecipe(st, bars), revision: 4, rollsOn }, seed)));
    for (const st of STYLES)
      for (const [i, p] of PERSONALITIES.entries()) {
        const r: Recipe = { ...defaultRecipe(st, 4), revision: 4, rollsOn: true, personality: { id: p, amount: 0.8 }, dna: { id: DNA_IDS[i % DNA_IDS.length]!, amount: 0.6 }, chop: { on: i % 2 === 0, amount: 0.5, slice: 'small', retrigger: 0.3, variant: 7 }, destroy2: { ...defaultDestroy2(), on: i % 3 === 0 } };
        add(row(B(r, 4242 + i)));
      }
    expect(h.toString(16)).toBe('f66575ba');
  });
  it('a revision 4 recipe never generates CLAP or FX, even with clap samples and activities stored', () => {
    for (const st of STYLES)
      for (const s of SEEDS) {
        const b = bake({ ...defaultRecipe(st, 4), revision: 4, clap: 1, fx: 1 }, seedsFrom(s), K13);
        expect(b.events.some((e) => e.cat === 'clap' || e.cat === 'fx')).toBe(false);
        expect(b.recipe.clap).toBeUndefined();
      }
  });
});

describe('CLAP and FX (revision 5)', () => {
  const at = (st: Recipe['style'], patch: Partial<Recipe>, s: number, bars: Bars = 4) => groove(sanitiseRecipe({ ...defaultRecipe(st, bars), ...patch }), seedsFrom(s), K13).events;
  it('new recipes have CLAP and FX (revision 5 on); activities are absent (the style default) until set', () => {
    expect(CURRENT_REVISION).toBeGreaterThanOrEqual(CLAPFX_REVISION);
    const r = defaultRecipe('electro');
    expect(r.revision).toBe(CURRENT_REVISION);
    expect(r.clap).toBeUndefined();
    expect(clapActivity(r)).toBe(CLAP_DEFAULT.electro);
    expect(fxActivity(r)).toBe(FX_DEFAULT.electro);
    expect(sanitiseRecipe({ ...r, clap: 2, fx: -1 })).toMatchObject({ clap: 1, fx: 0 });
  });
  it('the other tracks are exactly what revision 4 made (CLAP and FX are layers on top)', () => {
    for (const st of STYLES)
      for (const s of SEEDS) {
        const r = defaultRecipe(st, 4);
        const four = bake({ ...r, revision: 4 }, seedsFrom(s), K13);
        const five = bake({ ...r, revision: 5, clap: 1, fx: 1 }, seedsFrom(s), K13);
        const strip = (b: Break) => JSON.stringify(b.events.filter((e) => e.cat !== 'clap' && e.cat !== 'fx'));
        expect(strip(five)).toBe(strip(four));
      }
  });
  it('ACTIVITY 0 is none; more activity only adds hits (monotonic)', () => {
    for (const st of STYLES)
      for (const s of SEEDS) {
        expect(at(st, { clap: 0, fx: 0 }, s).some((e) => e.cat === 'clap' || e.cat === 'fx')).toBe(false);
        let prevC = new Set<string>();
        let prevF = new Set<string>();
        for (const a of [0.1, 0.25, 0.4, 0.6, 0.8, 1]) {
          const evs = at(st, { clap: a, fx: a }, s);
          const c = new Set(evs.filter((e) => e.cat === 'clap').map((e) => `${e.bar}.${e.step}`));
          const f = new Set(evs.filter((e) => e.cat === 'fx').map((e) => `${e.bar}.${e.step}`));
          for (const k of prevC) expect(c.has(k)).toBe(true);
          for (const k of prevF) expect(f.has(k)).toBe(true);
          prevC = c;
          prevF = f;
        }
      }
  });
  it('100% CLAP is busy but never every sixteenth; FX stay sparse (at most two a bar)', () => {
    for (const st of STYLES)
      for (const s of SEEDS) {
        const evs = at(st, { clap: 1, fx: 1 }, s, 8);
        for (let bar = 0; bar < 8; bar++) {
          const c = evs.filter((e) => e.bar === bar && e.cat === 'clap').length;
          expect(c).toBeGreaterThan(0);
          expect(c).toBeLessThanOrEqual(5);
          expect(evs.filter((e) => e.bar === bar && e.cat === 'fx').length).toBeLessThanOrEqual(2);
        }
        expect(evs.filter((e) => e.cat === 'clap').length).toBeLessThan(STEPS * 8 * 0.4);
      }
  });
  it('claps layer on the backbeat first; FX start at the top of the phrase', () => {
    let layered = 0;
    let top = 0;
    for (const st of STYLES)
      for (const s of SEEDS) {
        const evs = at(st, { clap: 0.3, fx: 0.15 }, s);
        const claps = evs.filter((e) => e.cat === 'clap');
        layered += claps.filter((c) => evs.some((e) => e.cat === 'snare' && e.bar === c.bar && e.step === c.step && (e.role === 'backbeat' || e.role === 'displaced backbeat'))).length / Math.max(1, claps.length);
        if (evs.some((e) => e.cat === 'fx' && e.bar === 0 && e.step === 0)) top++;
      }
    expect(layered / (STYLES.length * SEEDS.length)).toBeGreaterThan(0.6);
    expect(top / (STYLES.length * SEEDS.length)).toBeGreaterThan(0.6);
  });
  it('recipe-aware: ELECTRO and GARAGE clap more than FUNK by default', () => {
    const count = (st: Recipe['style']) => SEEDS.reduce((n, s) => n + at(st, {}, s).filter((e) => e.cat === 'clap').length, 0);
    expect(count('electro')).toBeGreaterThan(count('funk'));
    expect(count('garage')).toBeGreaterThan(count('funk'));
  });
  it('FX are never rolled, retriggered or chopped away (they are anchors)', () => {
    for (const st of STYLES)
      for (const s of SEEDS) {
        const r: Recipe = { ...defaultRecipe(st, 4), fx: 1, rolls: 1, rollsOn: true, rollTargets: ['snare', 'hat', 'kick'], chop: { on: true, amount: 1, slice: 'small', retrigger: 1, variant: 3 } };
        const b = bake(r, seedsFrom(s), K13);
        expect(b.events.some((e) => e.cat === 'fx' && (e.role === 'roll' || e.role === 'chop' || e.sub !== 0))).toBe(false);
        const plain = groove(sanitiseRecipe(r), seedsFrom(s), K13).events.filter((e) => e.cat === 'fx').map((e) => `${e.bar}.${e.step}`);
        expect(b.events.filter((e) => e.cat === 'fx').map((e) => `${e.bar}.${e.step}`)).toEqual(plain);
      }
  });
  it('no CLAP or FX samples: the hits are silent, nothing fails', () => {
    for (const st of STYLES) {
      const b = bake({ ...defaultRecipe(st, 4), clap: 1, fx: 1 }, seedsFrom(7), K11);
      const extra = b.events.filter((e) => e.cat === 'clap' || e.cat === 'fx');
      expect(extra.length).toBeGreaterThan(0);
      expect(extra.every((e) => e.sample === null)).toBe(true);
    }
  });
  it('MUTATE varies the claps only in the bars it reaches; SELECTED TRACKS without CLAP leave them', () => {
    const r: Recipe = { ...defaultRecipe('garage', 4), clap: 0.6 };
    let changed = 0;
    for (let k = 1; k <= 8; k++) {
      const s0 = seedsFrom(100 + k);
      const base = bake(r, s0, K13).events.filter((e) => e.cat === 'clap').map((e) => `${e.bar}.${e.step}`);
      const kickOnly = bake(r, mutate(s0, {}, k, { style: 'wild', depth: 1, cats: ['kick'] })!, K13).events.filter((e) => e.cat === 'clap').map((e) => `${e.bar}.${e.step}`);
      expect(kickOnly).toEqual(base);
      const all = bake(r, mutate(s0, {}, k)!, K13).events.filter((e) => e.cat === 'clap').map((e) => `${e.bar}.${e.step}`);
      if (JSON.stringify(all) !== JSON.stringify(base)) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});
