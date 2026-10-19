/**
 * The UI restoration: roll generation on/off and CLEAR ROLLS, roll targets, tom activity, MUTATE
 * options and related sections, roll grouping, the grid's click/drag rules, and that grid edits
 * reach the player (and so MIDI out) and the MIDI file.
 */
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { App, defaultMutate, sanitiseMutate } from '../src/app/app';
import { entryKey, sanitiseEntry } from '../src/app/seeds';
import { bake, mutate, mutationBars, sanitiseRecipe, seedsFrom, toggleTarget } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { rollGroups } from '../src/engine/rolls';
import { SECTION_DEFS, SECTIONS } from '../src/engine/sections';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, MUTATION_STYLES, TOMS, TPB, TPS, type Break, type BreakEvent, type Category, type Recipe, type Seeds } from '../src/engine/types';
import { breakMidi } from '../src/midi/breakMidi';
import { DRAG_THRESHOLD, isDrag, pressAction, releaseDeletes } from '../src/ui/gridEdit';
import { TARGET_LABEL } from '../src/ui/rollsTab';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`];
  return k;
};
const R = (style: Recipe['style'], bars: Recipe['bars'], over: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, bars), ...over });
const bk = (r: Recipe, seeds: Seeds = seedsFrom(4242)) => bake(r, seeds, kit());
const pos = (e: BreakEvent) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
const fromRolls = (b: Break) => b.events.filter((e) => e.role === 'roll' && e.why.endsWith('(ROLLS)'));
const strip = (b: Break) => b.events.map((e) => [pos(e), e.vel, e.offsetMs, e.role]);
const tick = (e: BreakEvent) => e.bar * TPB + e.step * TPS + e.sub;

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
}
function makeApp(seed = '4242') {
  const k = kit();
  const ingredients = { kit: () => k, loudness: () => ({}), name: (id: string | null) => id ?? '—' };
  const sent: Break[] = [];
  const player = { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setOutput() {}, setBreak: (b: Break) => sent.push(b), update: (b: Break) => sent.push(b), audition: async () => {}, onSwap: () => {} };
  const app = new App(ingredients as never, player as never, seed);
  return { app, sent };
}
/** A seed whose break has rolls from the ROLLS layer with this recipe. */
function rollySeed(r: Recipe): number {
  for (let s = 1; s < 400; s++) if (fromRolls(bk(r, seedsFrom(s))).length >= 4) return s;
  throw new Error('no rolls');
}

describe('ROLL GENERATION', () => {
  const jungle = R('jungle', 4, { rolls: 1, rollPlace: 'anywhere' });
  const seeds = seedsFrom(rollySeed(jungle));

  it('off, or a probability of 0, adds no rolls; everything else in the break is unchanged', () => {
    const on = bk(jungle, seeds);
    const off = bk({ ...jungle, rollsOn: false }, seeds);
    const zero = bk({ ...jungle, rolls: 0 }, seeds);
    expect(fromRolls(on).length).toBeGreaterThan(0);
    expect(fromRolls(off)).toEqual([]);
    expect(fromRolls(zero)).toEqual([]);
    // off holds back every roll: the fills' rolls play as plain fills (their sixteenths kept); PROBABILITY 0 only the ROLLS layer's
    expect(off.events.some((e) => e.role === 'roll')).toBe(false);
    const plain = off.events.filter((e) => e.why.includes('plain fill'));
    const fillRolls = zero.events.filter((e) => e.role === 'roll');
    expect(plain.map(pos)).toEqual(fillRolls.filter((e) => e.sub === 0).map(pos));
    const rest = (b: Break) => strip({ ...b, events: b.events.filter((e) => e.role !== 'roll' && !e.why.includes('plain fill')) });
    expect(rest(off)).toEqual(rest(zero));
    // a recipe saved before revision 1 kept its fills' rolls with generation off
    const old = bk({ ...jungle, rollsOn: false, revision: 0 }, seeds);
    expect(strip(old)).toEqual(strip(bk({ ...jungle, rolls: 0, revision: 0 }, seeds)));
  });

  it('keeps its setting through sanitising, and recipes without it are on', () => {
    expect(sanitiseRecipe({ ...jungle, rollsOn: false }).rollsOn).toBe(false);
    expect('rollsOn' in sanitiseRecipe(jungle)).toBe(false);
    expect(sanitiseRecipe({ ...jungle, rollsOn: true }).rollsOn).toBeUndefined();
  });

  describe('in the App', () => {
    beforeEach(() => {
      (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    });

    it('turning it off keeps the rolls already there; CLEAR ROLLS deletes them; both undo', () => {
      const { app } = makeApp(String(seeds.beat));
      app.setRollsOn(true);
      app.setRecipe(jungle);
      const rolls = app.current.events.filter((e) => e.role === 'roll').map(pos).sort();
      expect(rolls.length).toBeGreaterThan(0);
      const settings = { ...app.recipe };
      app.setRollsOn(false);
      expect(app.recipe.rollsOn).toBe(false);
      // every roll hit is still there (one under which the groove plays a hit of its own keeps that hit)
      for (const p of rolls) expect(app.current.events.some((e) => pos(e) === p)).toBe(true);
      expect(app.edits.added.length).toBeGreaterThan(0);
      expect(app.edits.added.every((m) => m.role === 'roll')).toBe(true);
      expect(app.status).toMatch(/kept/);
      // the settings themselves are untouched
      for (const k of ['rolls', 'rollLength', 'rollSpeed', 'rollDynamics', 'rollPlace', 'rollTargets'] as const) expect(app.recipe[k]).toEqual(settings[k]);
      // a new break gets none
      app.bake();
      expect(fromRolls(app.current)).toEqual([]);
      app.historyBack();
      const kept = app.rollCount.hits;
      expect(kept).toBeGreaterThan(0);
      app.clearRolls();
      expect(app.rollCount).toEqual({ rolls: 0, hits: 0 });
      app.undo();
      expect(app.rollCount.hits).toBe(kept);
    });

    it('turning it on again does not double the kept rolls', () => {
      const { app } = makeApp(String(seeds.beat));
      app.setRollsOn(true);
      app.setRecipe(jungle);
      const n = app.current.events.length;
      app.setRollsOn(false);
      app.setRollsOn(true);
      expect(app.current.events.length).toBe(n);
      expect(app.edits.added.length).toBe(0);
      app.undo();
      expect(app.recipe.rollsOn).toBe(false);
    });
  });
});

describe('ROLL GENERATION is the user’s preference', () => {
  const rollsIn = (b: Break) => b.events.filter((e) => e.role === 'roll' && e.manual !== 'added');
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('is off for a new user, and their first break has no rolls at all', () => {
    for (const seed of ['1', '4242', '777']) {
      const { app } = makeApp(seed);
      expect(app.rollGeneration).toBe(false);
      expect(app.recipe.rollsOn).toBe(false);
      expect(rollsIn(app.current)).toEqual([]);
    }
  });

  it('no recipe turns it back on: style changes, RESET, RANDOM RECIPE, BAKE, BATCH, seeds, MUTATE, sections and CHOP keep it', () => {
    for (const on of [false, true]) {
      (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
      const { app } = makeApp('4242');
      app.setRollsOn(on);
      const check = (what: string) => {
        expect(app.rollGeneration, what).toBe(on);
        expect(app.recipe.rollsOn !== false, what).toBe(on);
        if (!on) expect(rollsIn(app.current), what).toEqual([]);
      };
      check('switched');
      for (const [a, b] of [['funk', 'hiphop'], ['electro', 'broken'], ['jungle', 'breakcore'], ['dnb', 'funk']] as const) {
        app.setStyle(a);
        check(a);
        app.setStyle(b);
        check(b);
      }
      app.resetRecipe();
      check('reset');
      for (let i = 0; i < 6; i++) {
        app.randomRecipe(i / 6);
        check(`random ${app.recipe.style}`);
      }
      app.setStyle('jungle');
      app.setRecipe({ rolls: 1, rollPlace: 'anywhere' });
      check('roll settings');
      for (let i = 0; i < 4; i++) {
        app.bake();
        check('bake');
      }
      app.bakeBatch(4);
      for (const c of app.batch) {
        expect(c.recipe.rollsOn !== false).toBe(on);
        if (!on) expect(rollsIn(c)).toEqual([]);
      }
      check('batch');
      app.setSeed(99);
      check('seed');
      app.dice();
      check('dice');
      app.mutate();
      check('mutate');
      app.createSection(SECTIONS[0]!);
      check('section');
      app.setChop({ on: true, amount: 1, retrigger: 1 });
      check('chop');
      app.reChop();
      check('re-chop');
    }
  });

  it('is saved, and a reload keeps it whichever way it was set', () => {
    for (const on of [true, false]) {
      (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
      const first = makeApp('4242').app;
      first.setRollsOn(on);
      first.setStyle('funk');
      first.bake();
      const again = new App(first.ingredients, first.player);
      expect(again.rollGeneration).toBe(on);
      expect(again.recipe.rollsOn !== false).toBe(on);
      again.setStyle('jungle');
      expect(again.recipe.rollsOn !== false).toBe(on);
    }
  });

  it('a state saved before the preference existed keeps what its break had; new users get it off', () => {
    const { app } = makeApp('4242');
    app.save();
    const ls = (globalThis as { localStorage: Storage }).localStorage;
    const saved = JSON.parse(ls.getItem('breakery.state.v1')!);
    delete saved.rollGeneration;
    for (const [rollsOn, want] of [[undefined, true], [false, false]] as const) {
      const r = { ...saved.recipe };
      if (rollsOn === undefined) delete r.rollsOn;
      else r.rollsOn = rollsOn;
      ls.setItem('breakery.state.v1', JSON.stringify({ ...saved, recipe: r }));
      expect(new App(app.ingredients, app.player).rollGeneration).toBe(want);
    }
  });

  it('off: no rolls from the ROLLS layer, the fills or CHOP’s RETRIGGER; on: CHOP retriggers as before', () => {
    const { app } = makeApp('4242');
    const chopRolls = (b: Break) => b.events.filter((e) => e.role === 'roll' && !e.why.endsWith('(ROLLS)'));
    let onRolls = 0;
    for (const style of ['jungle', 'breakcore', 'hardcore', 'funk'] as const)
      for (const seed of [3, 11, 29, 57]) {
        app.setRollsOn(false);
        app.setStyle(style);
        app.setRecipe({ rolls: 1, rollPlace: 'anywhere' });
        app.setSeed(seed);
        app.setChop({ on: true, amount: 1, retrigger: 1 });
        expect(rollsIn(app.current), style).toEqual([]);
        expect(app.current.chop?.ops.retrigger ?? 0, style).toBe(0);
        app.setRollsOn(true);
        onRolls += chopRolls(app.current).length;
        app.setChop({ on: false });
      }
    expect(onRolls).toBeGreaterThan(0);
  });

  it('a break restored from the history or the favourites follows it; undo brings the setting back with the break', () => {
    const { app } = makeApp('4242');
    app.setRollsOn(true);
    app.setStyle('jungle');
    app.setRecipe({ rolls: 1, rollPlace: 'anywhere' });
    for (let s = 1; s < 60 && fromRolls(app.current).length < 3; s++) app.setSeed(s);
    expect(fromRolls(app.current).length).toBeGreaterThan(0);
    app.toggleFavourite();
    const fav = app.favourites[0]!.id;
    app.bake();
    app.setRollsOn(false);
    expect(app.recipe.rollsOn).toBe(false);
    app.historyBack();
    expect(app.rollGeneration).toBe(false);
    expect(app.recipe.rollsOn).toBe(false);
    // its rolls are kept as hits, nothing new is generated
    expect(rollsIn(app.current)).toEqual([]);
    expect(app.rollCount.hits).toBeGreaterThan(0);
    app.loadFavourite(fav);
    expect(app.recipe.rollsOn).toBe(false);
    expect(rollsIn(app.current)).toEqual([]);
    app.setStyle('funk');
    app.setRollsOn(true);
    app.undo();
    expect(app.rollGeneration).toBe(false);
    expect(app.recipe.rollsOn).toBe(false);
    app.redo();
    expect(app.rollGeneration).toBe(true);
  });
});

describe('roll targets and tom activity', () => {
  it('names the targets in full, and TOMS rolls only on the three toms', () => {
    expect(Object.values(TARGET_LABEL)).toEqual(['SNARE', 'HATS', 'PERC', 'TOMS', 'KICK']);
    expect(toggleTarget(['snare', 'tom'], 'tom')).toEqual(['snare']);
    const r = R('funk', 4, { rolls: 1, rollTargets: ['tom'], rollPlace: 'anywhere', toms: 0.5 });
    let seen = 0;
    for (let s = 1; s < 60; s++) for (const e of fromRolls(bk(r, seedsFrom(s)))) {
      expect((TOMS as readonly string[]).includes(e.cat)).toBe(true);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('keeps tom activity, and the toms themselves, whatever roll generation does', () => {
    const r = R('funk', 4, { toms: 0.8, fills: 0.8 });
    const toms = (b: Break) => b.events.filter((e) => (TOMS as readonly string[]).includes(e.cat) && e.role !== 'roll').map(pos);
    for (let s = 1; s < 20; s++) {
      const seeds = seedsFrom(s);
      expect(toms(bk({ ...r, rollsOn: false }, seeds))).toEqual(toms(bk(r, seeds)));
    }
    expect(sanitiseRecipe({ ...r, rollsOn: false }).toms).toBe(0.8);
    const quiet = bk({ ...r, toms: 0 }, seedsFrom(3));
    expect(quiet.events.filter((e) => (TOMS as readonly string[]).includes(e.cat) && e.role !== 'roll').length).toBe(0);
  });
});

describe('MUTATE options', () => {
  // (no toms: TOM ACTIVITY is its own layer, and these compare hit counts)
  const r = R('funk', 4, { variation: 0.6, toms: 0 });
  const s0 = seedsFrom(777);
  const base = bk(r, s0);
  const withMut = (o: Parameters<typeof mutate>[3], seed = 99) => bk(r, mutate(s0, {}, seed, o)!);
  const set = (b: Break) => new Set(b.events.map(pos));

  it('a plain MUTATE stores no options, so old mutations replay exactly', () => {
    expect(mutate(s0, {}, 5)!.mut![0]).toEqual({ seed: expect.any(Number), beat: true, detail: true });
    expect(mutate(s0, {}, 5, { style: 'wild', depth: 2, range: -1, cats: ['kick', 'nope' as Category] })!.mut![0]).toMatchObject({ style: 'wild', depth: 1, range: 0, cats: ['kick'] });
  });

  it('styles give meaningfully different results, all related to the original', () => {
    const outs = MUTATION_STYLES.map((style) => withMut({ style, depth: 0.8 }));
    const keys = outs.map((b) => JSON.stringify(strip(b)));
    expect(new Set(keys).size).toBeGreaterThanOrEqual(6);
    const b0 = set(base);
    for (const o of outs) {
      const s = set(o);
      const shared = [...s].filter((k) => b0.has(k)).length;
      expect(shared / Math.max(s.size, b0.size)).toBeGreaterThan(0.4);
    }
    const count = (b: Break) => b.events.length;
    let thinner = 0;
    let thicker = 0;
    for (let k = 1; k <= 10; k++) {
      if (count(withMut({ style: 'sparse', depth: 1 }, k)) < count(base)) thinner++;
      if (count(withMut({ style: 'dense', depth: 1 }, k)) > count(base)) thicker++;
    }
    expect(thinner).toBeGreaterThanOrEqual(8);
    expect(thicker).toBeGreaterThanOrEqual(8);
  });

  it('SELECTED TRACKS change only those tracks', () => {
    for (let k = 1; k <= 8; k++) {
      const m = withMut({ style: 'wild', depth: 1, cats: ['kick'] }, k);
      const other = (b: Break) => b.events.filter((e) => e.cat !== 'kick' && e.role !== 'roll').map(pos).sort();
      expect(other(m)).toEqual(other(base));
    }
  });

  it('RANGE leaves the bars before it as they were; FILLS reaches only the fill bars', () => {
    // the notes of a bar (the performance, velocity and timing, follows the whole phrase)
    const bar = (b: Break, i: number) => b.events.filter((e) => e.bar === i && e.role !== 'roll').map(pos);
    expect(mutationBars({ range: 0.5 }, ['A', 'A2', 'A', 'T'])).toEqual([false, false, true, true]);
    expect(mutationBars({ range: 0 }, ['A', 'A2', 'A', 'T'])).toEqual([false, false, false, true]);
    expect(mutationBars({ style: 'fills' }, ['A', 'A2', 'A', 'F', 'A', 'T'])).toEqual([false, false, false, true, false, true]);
    let changed = 0;
    for (let k = 1; k <= 6; k++) {
      const m = withMut({ style: 'wild', depth: 1, range: 0.5 }, k);
      expect(bar(m, 0)).toEqual(bar(base, 0));
      expect(bar(m, 1)).toEqual(bar(base, 1));
      if (JSON.stringify(bar(m, 2)) !== JSON.stringify(bar(base, 2))) changed++;
      const f = withMut({ style: 'fills', depth: 1 }, k);
      for (const i of [0, 1, 2]) expect(bar(f, i)).toEqual(bar(base, i));
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('stores the options with the seeds (history, favourites) and tells them apart', () => {
    const s1 = mutate(s0, {}, 5, { style: 'dense', depth: 0.3, range: 0.5, cats: ['ghost'] })!;
    const e = sanitiseEntry({ recipe: r, seeds: s1, name: null })!;
    expect(e.seeds.mut![0]).toMatchObject({ style: 'dense', depth: 0.3, range: 0.5, cats: ['ghost'] });
    expect(entryKey(e)).not.toBe(entryKey({ recipe: r, seeds: { ...s1, mut: [{ ...s1.mut![0]!, style: 'sparse' }] } }));
    expect(sanitiseMutate({ style: 'bogus', depth: 9, target: 'selected', cats: ['kick', 'x'] })).toEqual({ ...defaultMutate(), depth: 1, target: 'selected', cats: ['kick'] });
  });

  describe('in the App', () => {
    beforeEach(() => {
      (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    });

    it('MUTATE uses the tab settings, is one undo step, and the original stays in the history', () => {
      // a mutation can rarely leave this break unchanged (about 1 seed in 300); pin MUTATE's fresh seed
      let x = 0;
      const rand = vi.spyOn(Math, 'random').mockImplementation(() => ((x = (x * 7919 + 1237) % 10007) + 0.5) / 10008);
      onTestFinished(() => rand.mockRestore());
      const { app } = makeApp('777');
      app.setRecipe(r);
      const before = JSON.stringify(strip(app.current));
      app.setMutation({ style: 'rhythmic', depth: 0.9 });
      expect(app.mutationOptions).toMatchObject({ style: 'rhythmic', depth: 0.9 });
      app.mutate();
      expect(app.seeds.mut?.[0]?.style).toBe('rhythmic');
      expect(JSON.stringify(strip(app.current))).not.toBe(before);
      app.undo();
      expect(JSON.stringify(strip(app.current))).toBe(before);
      app.redo();
      app.historyBack();
      expect(JSON.stringify(strip(app.current))).toBe(before);
      app.setMutation({ target: 'selected', cats: [] });
      const n = app.seeds.mut?.length ?? 0;
      app.mutate();
      expect(app.seeds.mut?.length ?? 0).toBe(n);
      expect(app.status).toMatch(/at least one track/);
    });

    it('creates related sections from the current pattern', () => {
      // MUTATE draws a fresh seed with Math.random; pin it so this check is deterministic
      let n = 0;
      const rand = vi.spyOn(Math, 'random').mockImplementation(() => ((n = (n * 7919 + 1237) % 10007) + 0.5) / 10008);
      const { app } = makeApp('777');
      app.setRecipe(r);
      const orig = app.current;
      const kicks = (b: Break) => b.events.filter((e) => e.bar === 0 && (e.cat === 'kick' || e.cat === 'snare') && e.role !== 'roll').map(pos);
      for (const k of SECTIONS) {
        app.createSection(k);
        const b = app.current;
        expect(b.seeds.beat).toBe(orig.seeds.beat);
        expect(b.seeds.mut?.at(-1)?.style).toBe(SECTION_DEFS[k].mutation.style);
        expect(JSON.stringify(strip(b))).not.toBe(JSON.stringify(strip(orig)));
        const a = new Set(orig.events.map(pos));
        const shared = b.events.filter((e) => a.has(pos(e))).length;
        expect(shared / Math.max(a.size, b.events.length)).toBeGreaterThan(0.35);
        if (k === 'verse' || k === 'build' || k === 'fill') expect(kicks(b)).toEqual(kicks(orig));
        app.undo();
        expect(JSON.stringify(strip(app.current))).toBe(JSON.stringify(strip(orig)));
      }
      app.createSection('breakdown');
      expect(app.recipe.density).toBeLessThan(r.density);
      app.historyBack();
      expect(JSON.stringify(strip(app.current))).toBe(JSON.stringify(strip(orig)));
      rand.mockRestore();
    });
  });
});

describe('roll groups', () => {
  const hits = (cat: Category, bar: number, start: number, d: number, n: number): BreakEvent[] =>
    Array.from({ length: n }, (_, i) => {
      const t = bar * TPB + start + i * d;
      const r = t - bar * TPB;
      return { cat, bar, step: Math.floor(r / TPS), sub: r % TPS, level: 0.5, role: 'roll', why: '', vel: 60, swing: 0, offsetMs: 0, sample: null };
    });

  it('groups each roll, at any speed, and never across a bar line', () => {
    for (const d of [12, 8, 6, 4, 3]) {
      const g = rollGroups([...hits('snare', 0, 96, d, 6), ...hits('snare', 1, 0, d, 4)], true);
      expect(g.map((x) => x.events.length)).toEqual([6, 4]);
      expect(g.every((x) => x.events.every((e) => e.bar === x.bar))).toBe(true);
    }
    // the end of a bar and the start of the next are two rolls even when they touch
    expect(rollGroups([...hits('snare', 0, TPB - 9, 3, 3), ...hits('snare', 1, 0, 3, 3)], true).length).toBe(2);
    // two rolls in one bar, a beat apart
    expect(rollGroups([...hits('snare', 2, 0, 6, 4), ...hits('snare', 2, 96, 6, 4)], true).length).toBe(2);
    // one roll round the toms counts once, but is drawn on three rows
    const tomRoll = [...hits('htom', 0, 120, 18, 2), ...hits('mtom', 0, 126, 18, 2), ...hits('ltom', 0, 132, 18, 2)];
    expect(rollGroups(tomRoll).length).toBe(1);
    expect(rollGroups(tomRoll, true).length).toBeGreaterThan(1);
  });

  it('finds the rolls of dense eight-bar breaks, each hit still its own event', () => {
    const r = R('breakcore', 8, { rolls: 1, rollSpeed: '64', rollPlace: 'anywhere' });
    for (let s = 1; s < 6; s++) {
      const b = bk(r, seedsFrom(s));
      const g = rollGroups(b.events);
      const n = b.events.filter((e) => e.role === 'roll').length;
      expect(g.reduce((m, x) => m + x.events.length, 0)).toBe(n);
      for (const x of g) for (const e of x.events) expect(b.events).toContain(e);
      for (const x of g) expect(x.end - x.start).toBeLessThan(TPB);
    }
  });
});

describe('grid editing rules', () => {
  it('click toggles, shift+click selects, a drag past the threshold moves, right-click deletes', () => {
    const p = { button: 0, shift: false, onHit: false, onRoll: false };
    expect(pressAction(p)).toBe('add');
    expect(pressAction({ ...p, onHit: true })).toBe('toggle');
    expect(pressAction({ ...p, onHit: true, shift: true })).toBe('select');
    expect(pressAction({ ...p, onRoll: true })).toBe('expand');
    expect(pressAction({ ...p, button: 2, onHit: true })).toBe('delete');
    expect(pressAction({ ...p, button: 2, onRoll: true })).toBe('deleteRoll');
    expect(pressAction({ ...p, macCtrl: true, onHit: true })).toBe('delete');
    expect(pressAction({ ...p, button: 2 })).toBe('none');
    expect(pressAction({ ...p, button: 1, onHit: true })).toBe('none');
    expect(isDrag(DRAG_THRESHOLD - 1, 0)).toBe(false);
    expect(isDrag(2, 2)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD, 0)).toBe(true);
    expect(releaseDeletes('toggle', false)).toBe(true);
    expect(releaseDeletes('toggle', true)).toBe(false);
    expect(releaseDeletes('select', false)).toBe(false);
  });

  describe('edits reach playback, MIDI out and the MIDI file', () => {
    beforeEach(() => {
      (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    });

    it('adding, moving and deleting by hand: the player gets each break; undo and redo follow', () => {
      const { app, sent } = makeApp();
      const free = [...Array(16).keys()].find((s) => !app.current.events.some((e) => e.cat === 'perc' && e.bar === 0 && e.step === s))!;
      const notes = (b: Break) => breakMidi(b).notes;
      const n0 = notes(app.current);
      const ref = app.addHit('perc', free * TPS)!;
      expect(sent.at(-1)).toBe(app.current);
      expect(sent.at(-1)!.events.some((e) => e.ref === ref)).toBe(true);
      expect(notes(sent.at(-1)!)).toBe(n0 + 1);
      const to = [...Array(16).keys()].find((s) => s > free && !app.current.events.some((e) => e.cat === 'perc' && e.bar === 0 && e.step === s))!;
      app.moveHit(ref, to * TPS);
      expect(sent.at(-1)!.events.some((e) => e.cat === 'perc' && e.bar === 0 && tick(e) === to * TPS)).toBe(true);
      app.deleteHit(app.selected);
      expect(notes(sent.at(-1)!)).toBe(n0);
      app.undo();
      expect(notes(sent.at(-1)!)).toBe(n0 + 1);
      app.redo();
      expect(notes(sent.at(-1)!)).toBe(n0);
      // several hits deleted as one step
      const two = app.current.events.filter((e) => e.cat === 'hat').slice(0, 2).map((e) => e.ref!);
      app.deleteHits(two);
      expect(notes(app.current)).toBe(n0 - 2);
      app.undo();
      expect(notes(app.current)).toBe(n0);
    });
  });
});
