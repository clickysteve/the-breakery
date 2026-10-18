/**
 * Engine 2's breaks from before TOMS and ROLLS existed must still come out the same: favourites,
 * history entries and links saved then have no TOMS or ROLLS in their recipe, which means 0, and
 * then nothing new may change a single event, velocity, timing or sample. The fingerprints in
 * fixtures/engine2-golden.json were taken from the release before hand editing, toms and rolls.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bake } from '../src/engine/generate';
import { emptyKit } from '../src/engine/kit';
import { hashString } from '../src/engine/rng';
import type { Recipe, Seeds } from '../src/engine/types';

type Golden = { recipe: Recipe; seeds: Seeds; n: number; hash: string };
const golden = JSON.parse(readFileSync(new URL('./fixtures/engine2-golden.json', import.meta.url), 'utf8')) as Golden[];

const kit = emptyKit();
kit.kick = ['k1', 'k2'];
kit.snare = ['s1', 's2', 's3'];
kit.hat = ['h1', 'h2', 'h3'];
kit.open = ['o1'];
kit.ride = ['r1'];
kit.crash = ['c1'];
kit.perc = ['p1', 'p2'];
const flat = (b: ReturnType<typeof bake>) => b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.role, e.sample]);

describe('engine 2 breaks saved before TOMS and ROLLS', () => {
  it(`reproduce all ${golden.length} reference breaks exactly (no TOMS or ROLLS in the recipe = 0)`, () => {
    for (const g of golden) {
      expect('toms' in g.recipe).toBe(false);
      const b = bake(g.recipe, g.seeds, kit);
      expect(b.recipe.toms).toBe(0);
      expect(b.recipe.rolls).toBe(0);
      expect(b.events.length).toBe(g.n);
      expect(hashString(JSON.stringify(flat(b))).toString(16)).toBe(g.hash);
    }
  });

  it('also with tom samples loaded (toms are never a fallback for anything)', () => {
    const k = { ...kit, htom: ['t1'], mtom: ['t2'], ltom: ['t3'] };
    for (const g of golden.slice(0, 30)) expect(hashString(JSON.stringify(flat(bake(g.recipe, g.seeds, k)))).toString(16)).toBe(g.hash);
  });
});
