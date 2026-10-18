/**
 * Phase 7: the JUNGLE phrase, RANDOM RECIPE, and ENGINE as a generator (not a recipe).
 * These check structure (positions, relationships, boundaries, isolation), not musical quality:
 * whether the jungle breaks sound convincing needs listening.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { bake, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { hashString } from '../src/engine/rng';
import { defaultRecipe } from '../src/engine/styles';
import { V1_STYLES } from '../src/engine/v1/styles';
import { CATEGORIES, STYLES, TPS, type Bars, type Break, type Recipe, type Seeds } from '../src/engine/types';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const jungle = (bars: Bars, over: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe('jungle', bars), ...over });
const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`];
  return k;
};
const positions = (b: Break) => b.events.map((e) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`);
const barSet = (b: Break, bar: number) => new Set(b.events.filter((e) => e.bar === bar && (e.cat === 'kick' || e.cat === 'snare')).map((e) => `${e.cat}${e.step}.${e.sub}`));
const jaccard = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length / new Set([...a, ...b]).size;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('JUNGLE phrases', () => {
  it('are deterministic: the same recipe and seeds give the same break', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const a = bake(jungle(4), seedsFrom(seed));
      const b = bake(jungle(4), seedsFrom(seed));
      expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    }
  });

  it('are exactly the pattern length, with valid positions and velocities', () => {
    for (const bars of [1, 2, 3, 4, 5, 6, 7, 8] as const)
      for (const seed of SEEDS.slice(0, 8)) {
        const b = bake(jungle(bars), seedsFrom(seed), kit());
        expect(b.plan.length).toBe(bars);
        for (let bar = 0; bar < bars; bar++) expect(b.events.some((e) => e.bar === bar)).toBe(true);
        for (const e of b.events) {
          expect(e.bar).toBeGreaterThanOrEqual(0);
          expect(e.bar).toBeLessThan(bars);
          expect(Number.isInteger(e.step) && e.step >= 0 && e.step < 16).toBe(true);
          expect(Number.isInteger(e.sub) && e.sub >= 0 && e.sub < TPS).toBe(true);
          expect(Number.isInteger(e.vel) && e.vel >= 1 && e.vel <= 127).toBe(true);
        }
      }
  });

  it('develop across the bars: the answer repeats the groove with a small change, later bars move further', () => {
    const answer: number[] = [];
    const turnaround: number[] = [];
    let developed = 0;
    for (const seed of SEEDS) {
      const b = bake(jungle(4, { rolls: 0, toms: 0 }), seedsFrom(seed));
      answer.push(jaccard(barSet(b, 0), barSet(b, 1)));
      turnaround.push(jaccard(barSet(b, 0), barSet(b, 3)));
      if (barSet(b, 2).size && jaccard(barSet(b, 0), barSet(b, 2)) < 1) developed++;
    }
    expect(mean(answer)).toBeGreaterThan(0.75); // the motif is still recognisable in bar 2
    expect(mean(turnaround)).toBeLessThan(mean(answer)); // the phrase goes somewhere
    expect(developed).toBeGreaterThan(SEEDS.length * 0.6); // bar 3 is a development, not a copy
  });

  it('keep a backbeat in every bar and the groove bar untouched by chops and bursts', () => {
    for (const seed of SEEDS) {
      const b = bake(jungle(4), seedsFrom(seed));
      for (let bar = 0; bar < 4; bar++) expect(b.events.some((e) => e.bar === bar && e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat'))).toBe(true);
      expect(b.events.some((e) => e.bar === 0 && (e.role === 'chop' || (e.role === 'roll' && e.why.includes('retrigger'))))).toBe(false);
    }
  });

  it('retrigger bursts are snares in the last four sixteenths of a turnaround or half-way fill, on a step or its 32nd', () => {
    let bursts = 0;
    for (const seed of SEEDS)
      for (const bars of [4, 8] as const) {
        const b = bake(jungle(bars, { rolls: 0, toms: 0 }), seedsFrom(seed));
        const hits = b.events.filter((e) => e.role === 'roll');
        bursts += hits.length;
        for (const e of hits) {
          expect(e.cat).toBe('snare');
          expect(e.step).toBeGreaterThanOrEqual(12);
          expect([0, 6]).toContain(e.sub);
          expect(b.plan[e.bar] === 'T' || b.plan[e.bar] === 'F').toBe(true);
        }
        // not every subdivision is filled: at most half of a bar's thirty-two 32nds
        for (let bar = 0; bar < bars; bar++) expect(hits.filter((e) => e.bar === bar).length).toBeLessThanOrEqual(8);
      }
    expect(bursts).toBeGreaterThan(0);
  });

  it('ties ghost notes to snares in developed bars, and does not add hits', () => {
    for (const seed of SEEDS) {
      const b = bake(jungle(4, { rolls: 0, toms: 0 }), seedsFrom(seed));
      for (const bar of [1, 2, 3]) {
        const ev = b.events.filter((e) => e.bar === bar);
        const snares = ev.filter((e) => e.cat === 'snare' && e.sub === 0 && e.role !== 'ghost' && e.role !== 'roll');
        for (const g of ev.filter((e) => e.cat === 'ghost' && e.sub === 0 && e.role === 'ghost')) {
          const lead = snares.some((s) => s.step - g.step >= -2 && s.step - g.step <= 3);
          expect(lead, `seed ${seed} bar ${bar} ghost on ${g.step}`).toBe(true);
          expect(g.vel).toBeLessThan(Math.max(...snares.map((s) => s.vel)));
        }
      }
    }
    const jungleHits = mean(SEEDS.map((s) => bake(jungle(4), seedsFrom(s)).events.length));
    expect(jungleHits).toBeLessThan(100); // 4 bars of the default recipe: about 82 hits, as before this phase
  });

  it('leave every other recipe exactly as it was (golden signatures from before this phase)', () => {
    const golden: Record<string, number[]> = {
      funk: [1955691564, 898002853, 225560662],
      hiphop: [2633113474, 2752966422, 2872418066],
      broken: [2649218853, 3253370579, 694052542],
      boombap: [3848134764, 164774042, 757146679],
      hardcore: [1905137685, 3355145746, 2880315525],
      dnb: [3543502143, 897021469, 3315620044],
      halftime: [4135449015, 4165800676, 3423339829],
      garage: [1076519480, 2634972561, 2323222034],
      electro: [3138073090, 1621805742, 2891110221],
      breakcore: [696337751, 1755050313, 2153346388],
    };
    for (const [style, sigs] of Object.entries(golden)) {
      const got = [1, 2, 3].map((s) => {
        const b = bake(defaultRecipe(style as Recipe['style'], 4), seedsFrom(s));
        return hashString(JSON.stringify(b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.offsetMs, e.role])));
      });
      expect(got, style).toEqual(sigs);
    }
  });

  it('apply only to JUNGLE recipes made since this phase: a saved one (no jungleCuts) is developed as before', () => {
    const fresh = jungle(4);
    expect(fresh.jungleCuts).toBe(true);
    const saved = { ...fresh } as Partial<Recipe>;
    delete saved.jungleCuts;
    const a = bake(fresh, seedsFrom(5));
    const b = bake(saved as Recipe, seedsFrom(5));
    expect(b.recipe.jungleCuts).toBeUndefined();
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
    // the flag is for engine 2 JUNGLE only
    expect(bake({ ...defaultRecipe('funk', 2), jungleCuts: true }, seedsFrom(1)).recipe.jungleCuts).toBeUndefined();
    expect(bake({ ...defaultRecipe('jungle', 2, 1), jungleCuts: true }, seedsFrom(1)).recipe.jungleCuts).toBeUndefined();
    expect(defaultRecipe('jungle', 2, 1).jungleCuts).toBeUndefined();
  });

  it('respect FREEZE: the rhythm follows the beat and detail seeds, not the feel or kit seeds', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const a: Seeds = { beat: seed, detail: seed + 100, feel: 1, kit: 1 };
      const b: Seeds = { ...a, feel: 2, kit: 3 };
      expect(positions(bake(jungle(4), a, kit()))).toEqual(positions(bake(jungle(4), b, kit())));
    }
  });
});

describe('RANDOM RECIPE', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  });
  function makeApp(seed = '4242') {
    const k = kit();
    const ingredients = { kit: () => k, loudness: () => ({}), name: (id: string | null) => id ?? '—' };
    const sent: Break[] = [];
    const player = { loop: true, level: 0.5, playing: true, setLevel() {}, setMix() {}, setBreak: (b: Break) => sent.push(b), update: (b: Break) => sent.push(b), audition: async () => {}, onSwap: () => {} };
    const app = new App(ingredients as never, player as never, seed);
    return { app, sent, k };
  }

  it('chooses another actual recipe, never ENGINE, and can reach every one of them', () => {
    expect(STYLES.map(String)).not.toContain('engine');
    const { app } = makeApp();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const before = app.recipe.style;
      const style = app.randomRecipe(i / 40);
      expect(STYLES).toContain(style);
      expect(style).not.toBe(before);
      expect(app.recipe.style).toBe(style);
      seen.add(style);
    }
    expect(seen.size).toBe(STYLES.length);
  });

  it('keeps the pattern length, the kit and the engine, and bakes a new break', () => {
    const { app, k } = makeApp();
    app.setRecipe({ bars: 3 });
    const before = JSON.stringify(app.current.events);
    app.randomRecipe(0.3);
    expect(app.recipe.bars).toBe(3);
    expect(app.recipe.engine).toBe(2);
    expect(app.current.recipe.style).toBe(app.recipe.style);
    expect(app.current.plan.length).toBe(3);
    expect(JSON.stringify(app.current.events)).not.toBe(before);
    expect(app.ingredients.kit()).toBe(k);
    const ids = new Set(Object.values(k).flat());
    for (const e of app.current.events) if (e.sample) expect(ids.has(e.sample)).toBe(true);
  });

  it('with ENGINE 1 chooses only among the four recipes it knows, and keeps ENGINE 1', () => {
    const { app } = makeApp();
    app.setStyle('funk');
    app.setEngine(1);
    for (let i = 0; i < 20; i++) {
      const style = app.randomRecipe(i / 20);
      expect(V1_STYLES as readonly string[]).toContain(style);
      expect(app.recipe.engine).toBe(1);
    }
  });

  it('respects FREEZE: frozen layers keep their seeds, the others change', () => {
    const { app } = makeApp();
    const before = { ...app.seeds };
    app.toggleFreeze('beat');
    app.toggleFreeze('kit');
    app.randomRecipe(0.5);
    expect(app.seeds.beat).toBe(before.beat);
    expect(app.seeds.kit).toBe(before.kit);
    expect(app.seeds.detail).not.toBe(before.detail);
    expect(app.seeds.feel).not.toBe(before.feel);
  });

  it('is one undo step: undo restores the recipe and break, redo the new one', () => {
    const { app } = makeApp();
    const was = { style: app.recipe.style, seeds: { ...app.seeds }, events: JSON.stringify(app.current.events) };
    app.randomRecipe(0.1);
    const now = { style: app.recipe.style, seeds: { ...app.seeds }, events: JSON.stringify(app.current.events) };
    expect(now.style).not.toBe(was.style);
    app.undo();
    expect(app.recipe.style).toBe(was.style);
    expect(app.seeds).toEqual(was.seeds);
    expect(JSON.stringify(app.current.events)).toBe(was.events);
    expect(app.canUndo).toBe(false);
    app.redo();
    expect(app.recipe.style).toBe(now.style);
    expect(app.seeds).toEqual(now.seeds);
    expect(JSON.stringify(app.current.events)).toBe(now.events);
  });

  it('hands the new break to the player once, so playback switches through the existing mechanism', () => {
    const { app, sent } = makeApp();
    const n = sent.length;
    app.randomRecipe(0.6);
    expect(sent.length).toBe(n + 1);
    expect(sent[n]).toBe(app.current);
    expect(sent[n]!.recipe.style).toBe(app.recipe.style);
  });
});

describe('ENGINE is a generator, not a recipe', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  });
  it('switching it keeps the recipe, and ENGINE 1 refuses recipes it does not know', () => {
    const k = kit();
    const player = { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} };
    const app = new App({ kit: () => k, loudness: () => ({}), name: (id: string | null) => id ?? '—' } as never, player as never, '7');
    app.setStyle('jungle');
    app.setEngine(1);
    expect(app.recipe.engine).toBe(1);
    expect(app.recipe.style).toBe('jungle');
    app.setEngine(2);
    expect(app.recipe.engine).toBe(2);
    app.setStyle('hardcore');
    app.setEngine(1);
    expect(app.recipe.engine).toBe(2); // refused: ENGINE 1 does not know HARDCORE
    expect(app.recipe.style).toBe('hardcore');
  });
});
