/**
 * Phase 15, app level: NEW PATCH, CLEAR PATTERN and RESET CONTROLS, the WILDCARD REPORT,
 * WILDCARD's sample selection modes, and undo / redo being one exact step per action.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, type Break, type Category } from '../src/engine/types';
import { WILDCARD_CATEGORIES, wildcardSampleModes } from '../src/engine/wildcard';
import { reportText, wildcardReport, type ReportState } from '../src/engine/wildcardReport';

const kitOf = (n: Partial<Record<Category, number>>): KitIndex => {
  const k = emptyKit() as Record<string, string[]>;
  for (const c of CATEGORIES) k[c] = Array.from({ length: n[c] ?? 2 }, (_, i) => `${c}-${i}`);
  return k as KitIndex;
};
let K = kitOf({});

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function makeApp() {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  const ingredients = { kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '?' };
  const player = { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setOutput() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} };
  const app = new App(ingredients as never, player as never, '4242');
  return app;
}
const events = (b: Break) => JSON.stringify(b.events);
/** everything an undo step holds that the user can see */
const state = (a: App) => JSON.stringify({ events: a.current.events, recipe: a.recipe, seeds: a.seeds, seedName: a.seedName, samples: a.samples, edits: a.edits, report: a.wildcardReport, mix: a.mix });

beforeEach(() => {
  K = kitOf({});
});

describe('NEW PATCH', () => {
  it('resets the patch, keeps the kit (levels kept, SOLO and MUTE cleared), and starts undo afresh', () => {
    const app = makeApp();
    app.setStyle('hardcore');
    app.setRecipe({ bpm: 170, density: 0.9 });
    app.setPersonality({ id: 'heavy', amount: 0.8 });
    app.setSampleSettings('kick', { mode: 'random' });
    app.setChannel('snare', 0.5, -0.3);
    app.toggleMute('hat');
    app.clearPattern();
    expect(app.patchDirty).toBe(true);
    expect(app.canUndo).toBe(true);
    app.newPatch({ keepKit: true });
    expect(app.recipe.style).toBe('funk');
    expect(app.recipe.bpm).toBe(defaultRecipe('funk', 2).bpm);
    expect(app.recipe.density).toBe(defaultRecipe('funk', 2).density);
    expect(app.recipe.personality?.id ?? 'neutral').toBe('neutral');
    expect(app.current.events.length).toBeGreaterThan(10);
    expect(app.hasEdits).toBe(false);
    expect(app.samples.kick?.mode).toBe('random'); // the kit's PICK modes stay with the kit
    expect(app.mix.snare.gain).toBe(0.5);
    expect(app.mix.hat.mute).toBe(false);
    expect(app.canUndo).toBe(false);
    expect(app.canRedo).toBe(false);
    expect(app.patchDirty).toBe(false);
    expect(app.wildcardReport).toBeNull();
  });

  it('without KEEP CURRENT KIT the PICK modes and the mixer reset too', () => {
    const app = makeApp();
    app.setSampleSettings('kick', { mode: 'random' });
    app.setChannel('snare', 0.5, -0.3);
    app.newPatch({ keepKit: false });
    expect(app.samples.kick).toBeUndefined();
    expect(app.mix.snare.gain).not.toBe(0.5);
    expect(app.mix.snare.pan).toBe(0);
  });

  it('a fresh patch is not dirty; any musical change makes it dirty', () => {
    const app = makeApp();
    app.newPatch();
    expect(app.patchDirty).toBe(false);
    app.say('hello');
    expect(app.patchDirty).toBe(false);
    app.setRecipe({ swing: 0.4 });
    expect(app.patchDirty).toBe(true);
  });
});

describe('CLEAR PATTERN and RESET CONTROLS', () => {
  it('CLEAR PATTERN empties the grid, keeps every setting, one undo step, redo exact', () => {
    const app = makeApp();
    app.setRecipe({ density: 0.8 });
    const before = state(app);
    const recipe = JSON.stringify(app.recipe);
    app.clearPattern();
    expect(app.current.events).toEqual([]);
    expect(JSON.stringify(app.recipe)).toBe(recipe);
    const cleared = state(app);
    app.undo();
    expect(state(app)).toBe(before);
    app.redo();
    expect(state(app)).toBe(cleared);
  });

  it('RESET CONTROLS sets the defaults, keeps tempo and pattern until the next bake, one undo step', () => {
    const app = makeApp();
    app.setStyle('jungle');
    app.setRecipe({ bpm: 166, density: 0.95, ghosts: 0.1, toms: 0.9, clap: 0.7 });
    const pattern = events(app.current);
    const before = state(app);
    app.resetControls();
    const d = defaultRecipe('jungle', app.recipe.bars);
    expect(app.recipe.density).toBe(d.density);
    expect(app.recipe.ghosts).toBe(d.ghosts);
    expect(app.recipe.toms).toBe(d.toms);
    expect(app.recipe.clap).toBeUndefined();
    expect(app.recipe.bpm).toBe(166);
    expect(app.recipe.style).toBe('jungle');
    expect(events(app.current)).toBe(pattern);
    const reset = state(app);
    app.undo();
    expect(state(app)).toBe(before);
    app.redo();
    expect(state(app)).toBe(reset);
  });
});

describe('WILDCARD REPORT', () => {
  it('lists only what changed, grouped; the headline counts the rows', () => {
    const app = makeApp();
    for (const c of WILDCARD_CATEGORIES) app.setWildcard(c, true);
    app.wildcard(12345);
    const r = app.wildcardReport!;
    expect(r).toBeTruthy();
    const rows = r.groups.flatMap((g) => g.rows);
    expect(r.count).toBe(rows.length);
    for (const x of rows) expect(x.before).not.toBe(x.after);
    expect(r.headline).toMatch(/^WILDCARD · [A-Z&\- ]+ · \d+ BPM · \d+ SETTINGS? CHANGED$/);
    expect(app.status.startsWith(r.headline)).toBe(true);
    expect(reportText(r)).toContain(r.headline);
    expect(reportText(r)).not.toContain('\u2014'); // no em dash in the copied text
  });

  it('pure: two equal states give no rows', () => {
    const s: ReportState = { recipe: defaultRecipe('funk', 2), seedText: '1', samples: {}, main: {} };
    const r = wildcardReport(s, JSON.parse(JSON.stringify(s)) as ReportState);
    expect(r.count).toBe(0);
    expect(r.groups).toEqual([]);
  });

  it('one undo step brings back everything WILDCARD changed (mixer and report included); redo is exact', () => {
    const app = makeApp();
    for (const c of WILDCARD_CATEGORIES) app.setWildcard(c, true);
    const before = state(app);
    const out0 = JSON.stringify(app.output.config);
    app.wildcard(777);
    const after = state(app);
    const out1 = JSON.stringify(app.output.config);
    expect(after).not.toBe(before);
    app.undo();
    expect(state(app)).toBe(before);
    expect(JSON.stringify(app.output.config)).toBe(out0);
    expect(app.wildcardReport).toBeNull();
    app.redo();
    expect(state(app)).toBe(after);
    expect(JSON.stringify(app.output.config)).toBe(out1);
    expect(app.wildcardReport?.headline).toBeTruthy();
  });

  it('the report stays until the next WILDCARD or NEW PATCH', () => {
    const app = makeApp();
    app.wildcard(1);
    const h = app.wildcardReport!.headline;
    app.setRecipe({ swing: 0.3 });
    expect(app.wildcardReport?.headline).toBe(h);
    app.newPatch();
    expect(app.wildcardReport).toBeNull();
  });
});

describe('WILDCARD sample selection modes', () => {
  it('deterministic, only tracks with two or more samples, conservative default off', () => {
    const pools = Object.fromEntries(CATEGORIES.map((c) => [c, c === 'kick' ? 1 : c === 'snare' ? 0 : 3])) as Record<Category, number>;
    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const a = wildcardSampleModes({}, pools, seed);
      expect(a).toEqual(wildcardSampleModes({}, pools, seed));
      expect(a.samples.kick).toBeUndefined();
      expect(a.samples.snare).toBeUndefined();
      for (const c of a.changed) seen.add(a.samples[c]!.mode);
    }
    expect(seen.has('roundrobin')).toBe(true); // reachable where there is a pool
    expect(seen.has('fixed')).toBe(false); // never pins one sample by chance
    expect(makeApp().wildcardSettings.sampleModes).toBe(false);
  });

  it('a single sample never gets ROUND ROBIN; the modes are in the report and undo', () => {
    K = kitOf({ kick: 1 });
    const app = makeApp();
    for (const c of WILDCARD_CATEGORIES) app.setWildcard(c, c === 'sampleModes');
    let seed = 1;
    while (seed < 100 && !app.wildcardReport?.groups.some((g) => g.title === 'SAMPLES')) app.wildcard(seed++);
    const samples = app.wildcardReport!.groups.find((g) => g.title === 'SAMPLES')!;
    expect(samples.rows.some((r) => r.label.endsWith('SELECTION'))).toBe(true);
    expect(app.samples.kick).toBeUndefined();
    const modes = JSON.stringify(app.samples);
    app.undo();
    expect(JSON.stringify(app.samples)).not.toBe(modes);
    app.redo();
    expect(JSON.stringify(app.samples)).toBe(modes);
  });

  it('KIT frozen keeps the modes and says so', () => {
    const app = makeApp();
    for (const c of WILDCARD_CATEGORIES) app.setWildcard(c, c === 'sampleModes');
    app.toggleFreeze('kit');
    app.wildcard(5);
    expect(app.samples).toEqual({});
    expect(app.wildcardReport!.kept.join()).toContain('SAMPLE SELECTION MODES');
  });
});

describe('undo and redo: one action, one exact step', () => {
  const actions: [string, (a: App) => void][] = [
    ['DESTROY', (a) => a.setRecipe({ destroy2: { ...(a.recipe.destroy2 ?? {}), on: true } as never })],
    ['personality', (a) => a.setPersonality({ id: 'lazy', amount: 0.7 })],
    ['BREAK DNA', (a) => a.setDna({ id: 'amen', amount: 0.6 } as never)],
    ['cymbals', (a) => a.setCym({ ride: 0.9, closed: 0.2 })],
    ['CLAP ACTIVITY', (a) => a.setRecipe({ clap: 0.9 })],
    ['FX ACTIVITY', (a) => a.setRecipe({ fx: 0.9 })],
    ['REGEN TRACK', (a) => a.regenTracks(['kick'])],
    ['CHOP', (a) => a.setChop({ on: true })],
    ['RE-CHOP', (a) => (a.setChop({ on: true }), a.reChop())],
    ['RE-DESTROY', (a) => (a.setDestroyCell('snare', 'stutter', true), a.reDestroy())],
    ['DESTROY dice', (a) => (a.setDestroyCell('kick', 'gate', true), a.diceDestroy(99))],
    ['rolls on', (a) => a.setRollsOn(true)],
    ['ROLL EXPRESSION', (a) => a.setRollExpr({ preset: 'dive' })],
    ['hand edit', (a) => a.addHit('perc', 6 * 12)],
    ['PICK mode', (a) => a.setSampleSettings('snare', { mode: 'roundrobin' })],
    ['CLEAR PATTERN', (a) => a.clearPattern()],
    ['RESET CONTROLS', (a) => (a.setRecipe({ density: 0.95 }), a.resetControls())],
  ];
  for (const [name, act] of actions) {
    it(`${name}: undo restores, redo repeats exactly`, () => {
      const app = makeApp();
      const before = state(app);
      act(app);
      const after = state(app);
      expect(after).not.toBe(before);
      while (app.canUndo) app.undo();
      expect(state(app)).toBe(before);
      while (app.canRedo) app.redo();
      expect(state(app)).toBe(after);
    });
  }

  it('a slider gesture (many values) is one step', () => {
    const app = makeApp();
    const before = state(app);
    app.beginGesture();
    for (const d of [0.61, 0.62, 0.7, 0.8, 0.85]) app.setRecipe({ density: d });
    app.endGesture();
    app.undo();
    expect(state(app)).toBe(before);
    expect(app.canUndo).toBe(false);
  });

  it('undo snapshots hold no audio', () => {
    const app = makeApp();
    app.setRecipe({ density: 0.9 });
    const stack = (app as unknown as { undoStack: string[] }).undoStack;
    expect(stack.length).toBe(1);
    expect(stack[0]).not.toMatch(/AudioBuffer|Float32Array/);
    expect(stack[0]!.length).toBeLessThan(400_000);
  });
});
