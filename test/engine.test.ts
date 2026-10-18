import { describe, expect, it } from 'vitest';
import { analyse, randomLike } from '../src/engine/analysis';
import { bake, reseed, sanitiseRecipe, seedsFrom } from '../src/engine/generate';
import { assignSamples, chooseMain, emptyKit, sourceOf } from '../src/engine/kit';
import { euclid, onsetArray, syncopation } from '../src/engine/meter';
import { MAX_OFFSET_MS, swingDelay } from '../src/engine/performance';
import { makeRng, stream } from '../src/engine/rng';
import { defaultRecipe } from '../src/engine/styles';
import { RECIPE_KEYS, STEPS, STYLES, TPS, type Bars, type Break, type BreakEvent, type Recipe } from '../src/engine/types';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function randomRecipe(seed: number): Recipe {
  const r = makeRng(seed);
  const style = STYLES[r.int(STYLES.length)]!;
  const out = defaultRecipe(style, ([1, 2, 4] as Bars[])[r.int(3)]!);
  for (const k of RECIPE_KEYS) out[k] = r.next();
  out.bpm = 60 + r.int(140);
  return out;
}

describe('rng', () => {
  it('is deterministic and streams are independent', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
    expect(stream(1, 'x').next()).not.toEqual(stream(1, 'y').next());
    expect(stream(1, 'x').next()).not.toEqual(stream(2, 'x').next());
  });
  it('weighted never picks a zero weight', () => {
    const r = makeRng(3);
    for (let i = 0; i < 500; i++) expect(r.weighted([0, 1, 0, 2])).not.toBe(0);
    expect(r.weighted([0, 0])).toBe(-1);
  });
});

describe('meter', () => {
  it('measures syncopation (Longuet-Higgins & Lee style)', () => {
    // four on the floor: no syncopation
    expect(syncopation(onsetArray([0, 4, 8, 12]))).toBe(0);
    // a note on the "a" of 2 with silence on beat 3 is syncopated
    expect(syncopation(onsetArray([0, 7]))).toBeGreaterThan(0);
    // more off-beat onsets before strong rests: more syncopation
    expect(syncopation(onsetArray([0, 3, 7, 11, 15]))).toBeGreaterThan(syncopation(onsetArray([0, 7])));
    expect(syncopation(onsetArray([]))).toBe(0);
  });
  it('makes Euclidean rhythms', () => {
    const e38 = euclid(3, 8);
    expect(e38.filter(Boolean).length).toBe(3);
    expect(e38.map((x) => (x ? 'x' : '.')).join('')).toBe('x..x..x.');
    expect(euclid(5, 16).filter(Boolean).length).toBe(5);
    expect(euclid(4, 16, 2).filter(Boolean).length).toBe(4);
  });
});

describe('swing', () => {
  it('delays only the second sixteenth of each eighth, Linn-style', () => {
    expect(swingDelay(0, 1)).toBe(0);
    expect(swingDelay(2, 1)).toBe(0);
    expect(swingDelay(1, 0)).toBeCloseTo(0);
    // 66% (triplet) = SWING 0.64 -> second sixteenth at 1.32 sixteenths
    expect(swingDelay(1, 0.64)).toBeCloseTo(0.32, 2);
    // 75% (maximum) -> half a sixteenth
    expect(swingDelay(3, 1)).toBeCloseTo(0.5);
  });
});

describe('bake: determinism', () => {
  it('the same recipe and seeds give the same break', () => {
    for (const s of STYLES) {
      const r = defaultRecipe(s, 4);
      expect(JSON.stringify(bake(r, seedsFrom(1234)))).toBe(JSON.stringify(bake(r, seedsFrom(1234))));
    }
  });
  it('different seeds give different breaks', () => {
    const r = defaultRecipe('funk', 2);
    const grids = new Set(SEEDS.map((s) => JSON.stringify(bake(r, seedsFrom(s)).events.map((e) => [e.cat, e.bar, e.step, e.sub]))));
    expect(grids.size).toBeGreaterThan(SEEDS.length * 0.9);
  });
});

describe('bake: every event is valid (fuzz over styles, bars and recipes)', () => {
  it('has in-range positions, velocities and timing, and no duplicates', () => {
    for (let i = 0; i < 400; i++) {
      const recipe = randomRecipe(i);
      const b = bake(recipe, seedsFrom(i * 31 + 7));
      expect(b.plan.length).toBe(recipe.bars);
      const seen = new Set<string>();
      for (const e of b.events) {
        expect(Number.isInteger(e.vel) && e.vel >= 1 && e.vel <= 127).toBe(true);
        expect(e.bar >= 0 && e.bar < recipe.bars).toBe(true);
        expect(e.step >= 0 && e.step < STEPS).toBe(true);
        expect(e.sub >= 0 && e.sub < TPS).toBe(true);
        expect(Math.abs(e.offsetMs)).toBeLessThanOrEqual(MAX_OFFSET_MS);
        expect(e.swing >= 0 && e.swing <= 0.5).toBe(true);
        if (e.cat === 'snare') expect(e.offsetMs).toBeGreaterThanOrEqual(-1);
        if (e.bar === 0 && e.step === 0 && e.sub === 0) expect(e.offsetMs).toBeGreaterThanOrEqual(0);
        expect(e.why.length).toBeGreaterThan(0);
        const k = `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('bake: musical structure', () => {
  const all = (style: Recipe['style'], bars: Bars = 2, patch: Partial<Recipe> = {}) => SEEDS.map((s) => bake({ ...defaultRecipe(style, bars), ...patch }, seedsFrom(s)));

  it('FUNK and HIP-HOP anchor the backbeat on 2 and 4 in groove bars', () => {
    for (const style of ['funk', 'hiphop'] as const) {
      const groove = all(style).map((b) => b.events.filter((e) => e.bar === 0));
      const ok = groove.filter((evs) => [4, 12].every((s) => evs.some((e) => e.cat === 'snare' && e.step === s && e.sub === 0 && e.vel >= 90)));
      expect(ok.length / groove.length).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('every style but BROKEN starts on a downbeat kick', () => {
    for (const style of ['funk', 'hiphop', 'jungle'] as const) for (const b of all(style)) expect(b.events.some((e) => e.cat === 'kick' && e.bar === 0 && e.step === 0)).toBe(true);
  });

  it('ghosts are soft, never on a backbeat, and closer to snare accents than chance', () => {
    const near: number[] = [];
    const chance: number[] = [];
    for (const b of all('funk', 2)) {
      for (const g of b.events.filter((e) => e.cat === 'ghost')) {
        expect(g.vel).toBeLessThan(60);
        expect(b.events.some((e) => e.cat === 'snare' && e.bar === g.bar && e.step === g.step && e.sub === g.sub && (e.role === 'backbeat' || e.role === 'displaced backbeat'))).toBe(false);
      }
      near.push(analyse(b.events, 2).ghostsNearAccent);
      const ghosts = b.events.filter((e) => e.cat === 'ghost');
      const rnd = randomLike(ghosts, 2, makeRng(ghosts.length + 1));
      chance.push(analyse([...b.events.filter((e) => e.cat !== 'ghost'), ...rnd], 2).ghostsNearAccent);
    }
    expect(mean(near)).toBeGreaterThan(0.5);
    expect(mean(near)).toBeGreaterThan(mean(chance) + 0.15);
  });

  it('kicks never land on a backbeat in groove bars', () => {
    for (const style of STYLES) for (const b of all(style)) {
      const bb = b.events.filter((e) => e.bar === 0 && e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat'));
      for (const s of bb) expect(b.events.some((e) => e.bar === 0 && e.cat === 'kick' && e.step === s.step)).toBe(false);
    }
  });

  it('an open-hat lift replaces the closed hat on its step', () => {
    for (const b of all('funk', 2, { complexity: 1 })) for (const o of b.events.filter((e) => e.cat === 'open')) expect(b.events.some((e) => e.cat === 'hat' && e.bar === o.bar && e.step === o.step)).toBe(false);
  });

  it('later bars are related to the first (variation, not regeneration)', () => {
    const sims = all('funk', 4).map((b) => analyse(b.events, 4).barSimilarity);
    expect(mean(sims)).toBeGreaterThan(0.6);
    // with no variation and no fill, every bar is the groove
    // (a crash at the top replaces the first hat, so cymbals on the downbeat are left out)
    const notTop = (e: BreakEvent) => !(e.step === 0 && (e.cat === 'crash' || e.cat === 'hat' || e.cat === 'ride' || e.cat === 'open'));
    for (const b of all('funk', 4, { variation: 0, fills: 0 })) expect(analyse(b.events.filter(notTop), 4).barSimilarity).toBe(1);
  });

  it('a 4-bar phrase is groove, answer, groove, turnaround', () => {
    expect(bake(defaultRecipe('funk', 4), seedsFrom(1)).plan).toEqual(['A', 'A2', 'A', 'T']);
    expect(bake(defaultRecipe('funk', 2), seedsFrom(1)).plan).toEqual(['A', 'T']);
    expect(bake(defaultRecipe('funk', 1), seedsFrom(1)).plan).toEqual(['A']);
  });
});

describe('bake: each control has its effect', () => {
  const avg = (patch: Partial<Recipe>, f: (b: Break) => number, style: Recipe['style'] = 'funk') => mean(SEEDS.map((s) => f(bake({ ...defaultRecipe(style, 2), ...patch }, seedsFrom(s)))));
  it('DENSITY adds hits', () => expect(avg({ density: 0.95 }, (b) => b.events.length)).toBeGreaterThan(avg({ density: 0.05 }, (b) => b.events.length) + 5));
  it('GHOSTS adds ghost notes', () => expect(avg({ ghosts: 1 }, (b) => b.events.filter((e) => e.cat === 'ghost').length)).toBeGreaterThan(avg({ ghosts: 0 }, (b) => b.events.filter((e) => e.cat === 'ghost').length) + 4));
  it('SYNCOPATION raises the foundation syncopation', () => expect(avg({ syncopation: 1 }, (b) => analyse(b.events, 2).sync)).toBeGreaterThan(avg({ syncopation: 0 }, (b) => analyse(b.events, 2).sync) + 2));
  it('COMPLEXITY adds extra snares and off-beat kicks', () =>
    expect(avg({ complexity: 1 }, (b) => b.events.filter((e) => e.role === 'extra snare' || e.role === 'syncopated kick' || e.role === 'drag').length, 'jungle')).toBeGreaterThan(
      avg({ complexity: 0 }, (b) => b.events.filter((e) => e.role === 'extra snare' || e.role === 'syncopated kick' || e.role === 'drag').length, 'jungle'),
    ));
  it('VARIATION makes later bars differ more', () => expect(avg({ variation: 1, fills: 0 }, (b) => analyse(b.events, 2).barSimilarity)).toBeLessThan(avg({ variation: 0.1, fills: 0 }, (b) => analyse(b.events, 2).barSimilarity)));
  it('FILLS adds fill hits', () => expect(avg({ fills: 1 }, (b) => b.events.filter((e) => e.role === 'fill' || e.role === 'displaced backbeat').length)).toBeGreaterThan(avg({ fills: 0 }, (b) => b.events.filter((e) => e.role === 'fill').length) + 1));
  it('HUMANISE 0 is exactly on the grid (plus swing); more humanise means larger deviations', () => {
    for (const s of SEEDS) for (const e of bake({ ...defaultRecipe('funk', 2), humanise: 0 }, seedsFrom(s)).events) expect(e.offsetMs).toBe(0);
    expect(avg({ humanise: 1 }, (b) => analyse(b.events, 2).meanAbsOffsetMs)).toBeGreaterThan(avg({ humanise: 0.2 }, (b) => analyse(b.events, 2).meanAbsOffsetMs));
  });
  it('SWING 0 is straight', () => {
    for (const e of bake({ ...defaultRecipe('funk', 2), swing: 0 }, seedsFrom(5)).events) expect(e.swing).toBe(0);
  });
});

describe('freeze and seeds', () => {
  const kitWith = () => {
    const k = emptyKit();
    k.kick = ['k1', 'k2', 'k3'];
    k.snare = ['s1', 's2'];
    k.hat = ['h1', 'h2'];
    return k;
  };
  it('freezing BEAT keeps the kick and snare pattern while the rest changes', () => {
    const r = defaultRecipe('funk', 2);
    const a = bake(r, seedsFrom(100));
    const seeds = reseed(a.seeds, { beat: true }, 200);
    const b = bake(r, seeds);
    const ks = (x: Break) => x.events.filter((e) => e.cat === 'kick' || (e.cat === 'snare' && e.role !== 'fill')).map((e) => `${e.cat}${e.bar}.${e.step}.${e.sub}`);
    expect(seeds.beat).toBe(100);
    expect(seeds.detail).toBe(200);
    expect(ks(b)).toEqual(ks(a));
  });
  it('freezing KIT keeps the sample choices', () => {
    const k = kitWith();
    const a = reseed(seedsFrom(1), { kit: true }, 2);
    expect(chooseMain(k, a.kit)).toEqual(chooseMain(k, seedsFrom(1).kit));
  });
  it('the same seeds give the same rhythm whatever the kit', () => {
    const r = defaultRecipe('jungle', 2);
    const grid = (b: Break) => b.events.map((e) => `${e.cat}${e.bar}.${e.step}.${e.sub}.${e.vel}`);
    expect(grid(bake(r, seedsFrom(9), kitWith()))).toEqual(grid(bake(r, seedsFrom(9))));
  });
  it('sanitises recipes', () => {
    const r = sanitiseRecipe({ ...defaultRecipe('funk', 2), bpm: 9999, density: 7, bars: 3 as Bars, style: 'polka' as Recipe['style'] });
    expect(r.bpm).toBe(220);
    expect(r.density).toBe(1);
    expect(r.bars).toBe(2);
    expect(r.style).toBe('funk');
  });
});

describe('sample assignment', () => {
  it('uses fallbacks and leaves missing categories silent', () => {
    const k = emptyKit();
    k.kick = ['k'];
    k.snare = ['s'];
    k.ride = ['r'];
    expect(sourceOf(k, 'ghost')).toBe('snare');
    expect(sourceOf(k, 'hat')).toBe('ride');
    expect(sourceOf(k, 'open')).toBeNull();
    const b = bake(defaultRecipe('funk', 2), seedsFrom(3), k);
    for (const e of b.events) {
      if (e.cat === 'ghost') expect(e.sample).toBe('s');
      if (e.cat === 'hat') expect(e.sample).toBe('r');
      if (e.cat === 'open' || e.cat === 'perc' || e.cat === 'crash') expect(e.sample).toBeNull();
    }
  });
  it('picks from several samples deterministically', () => {
    const k = emptyKit();
    k.hat = ['a', 'b', 'c'];
    const b1 = bake(defaultRecipe('funk', 2), seedsFrom(4), k);
    const b2 = bake(defaultRecipe('funk', 2), seedsFrom(4), k);
    expect(b1.events.map((e) => e.sample)).toEqual(b2.events.map((e) => e.sample));
    const used = new Set(b1.events.filter((e) => e.cat === 'hat').map((e) => e.sample));
    expect(used.size).toBeGreaterThan(1); // alternates for variety
    const main = chooseMain(k, 4).hat;
    const hats = b1.events.filter((e) => e.cat === 'hat');
    expect(hats.filter((e) => e.sample === main).length / hats.length).toBeGreaterThan(0.5);
    assignSamples(hats, emptyKit(), 1);
    expect(hats.every((e) => e.sample === null)).toBe(true);
  });
});
