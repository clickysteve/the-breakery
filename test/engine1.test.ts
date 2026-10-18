/**
 * ENGINE 1 must stay exactly as released: these breaks were baked by The Breakery 0.1 (before
 * engine 2 existed) and stored as fingerprints in fixtures/engine1-golden.json. A failure here
 * means a saved seed would no longer reproduce its break.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bake, seedsFrom } from '../src/engine/generate';
import { emptyKit } from '../src/engine/kit';
import { hashString } from '../src/engine/rng';
import type { BarRole, Recipe } from '../src/engine/types';

type Golden = { recipe: Omit<Recipe, 'engine'>; seed: number; kit: boolean; plan: BarRole[]; timekeeper: string; n: number; hash: string; events?: unknown[] };
const golden = JSON.parse(readFileSync(new URL('./fixtures/engine1-golden.json', import.meta.url), 'utf8')) as Golden[];

const kit = emptyKit();
kit.kick = ['k1', 'k2'];
kit.snare = ['s1', 's2', 's3'];
kit.hat = ['h1', 'h2', 'h3'];
kit.open = ['o1'];
kit.ride = ['r1'];
kit.crash = ['c1'];
kit.perc = ['p1', 'p2'];

const flat = (b: ReturnType<typeof bake>) => b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.role, e.sample]);

describe('engine 1 is frozen', () => {
  it(`reproduces all ${golden.length} reference breaks of the first release exactly (events, velocities, timing, samples)`, () => {
    for (const g of golden) {
      // saved recipes from the first release have no engine field: that means engine 1
      const b = bake(g.recipe as Recipe, seedsFrom(g.seed), g.kit ? kit : emptyKit());
      expect(b.recipe.engine).toBe(1);
      expect(b.plan).toEqual(g.plan);
      expect(b.timekeeper).toBe(g.timekeeper);
      if (g.events) expect(flat(b)).toEqual(g.events);
      expect(b.events.length).toBe(g.n);
      const h = hashString(JSON.stringify(flat(b)));
      expect(h.toString(16)).toBe(g.hash);
    }
  });
  it('also when the recipe says engine 1 explicitly', () => {
    const g = golden[5]!;
    const b = bake({ ...(g.recipe as Recipe), engine: 1 }, seedsFrom(g.seed), g.kit ? kit : emptyKit());
    expect(hashString(JSON.stringify(flat(b))).toString(16)).toBe(g.hash);
  });
  it('engine 2 bakes different breaks from the same seeds (the change is documented)', () => {
    let same = 0;
    for (const g of golden.slice(0, 40)) {
      const b = bake({ ...(g.recipe as Recipe), engine: 2 }, seedsFrom(g.seed), g.kit ? kit : emptyKit());
      if (hashString(JSON.stringify(flat(b))).toString(16) === g.hash) same++;
    }
    expect(same).toBeLessThan(4);
  });
});
