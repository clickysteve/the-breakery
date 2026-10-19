/**
 * Phase 16: CHOP and ROLLS develop the CURRENT groove, without BAKE. CHOP can always be enabled
 * (hand edits no longer lock it); ROLLS is a transformation after CHOP (revision 6, rollLayer.ts):
 * PROBABILITY over eligible candidates, PHRASE END as a window, RE-ROLL takes, eligibility in
 * words; the source groove, manual edits and other tracks are never regenerated; undo and redo
 * are exact; exports carry what is heard.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { breakTimeline } from '../src/audio/timeline';
import { bake, sanitiseRecipe, seedsFrom } from '../src/engine/generate';
import { chaosDestroy, defaultDestroy2 } from '../src/engine/destroy2';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { MAX_PER_BAR, phraseEndBars, rollLayer, usesRollLayer } from '../src/engine/rollLayer';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, CURRENT_REVISION, MAX_ROLL, ROLL_TICKS, ROLLS_REVISION, STYLES, TPB, TPS, type BarRole, type Bars, type Break, type BreakEvent, type Recipe } from '../src/engine/types';
import { breakMidi } from '../src/midi/breakMidi';
import { parseSmf } from '../src/midi/smf';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`];
  return k;
};
const K = kit();
const tick = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const pos = (e: BreakEvent) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
/** every hit that is not a generated roll stroke, with what makes it sound as it does */
const source = (b: Break) => JSON.stringify(b.events.filter((e) => !e.rollOf).map((e) => [pos(e), e.vel, e.offsetMs, e.swing, e.sample, e.role, e.pitch ?? 0, !!e.reverse]));
const strokes = (b: Break) => b.events.filter((e) => e.rollOf);
const all = (b: Break) => JSON.stringify(b.events);
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);
/** The observed ROLLS settings: 93%, 3 hits, 1/32, ALTERNATING, PHRASE END, SNARE. */
const OBSERVED: Partial<Recipe> = { rolls: 0.93, rollLength: 3, rollSpeed: '32', rollDynamics: 'alternating', rollPlace: 'phrase', rollTargets: ['snare'] };
const R = (style: Recipe['style'] = 'funk', bars: Bars = 4, patch: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, bars), ...patch });
const bk = (r: Recipe, seed = 4242) => bake(r, seedsFrom(seed), K, {}, (id) => id);

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
}
/** `seed` null: no seed in the link, so the saved state is restored */
function makeApp(seed: string | null = '4242') {
  const ingredients = { kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '?' };
  const player = { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setOutput() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} };
  return new App(ingredients as never, player as never, seed ?? undefined);
}
/** an app on a 4-bar funk groove whose snares near the phrase end can take the observed rolls */
function observedApp(): App {
  for (const s of SEEDS) {
    const app = makeApp(String(s));
    app.setRecipe({ bars: 4 });
    app.setRolls(OBSERVED);
    app.setRollsOn(true);
    if (app.rollSummary.generated > 0) return app;
  }
  throw new Error('no seed with rolls');
}
const undoDepth = (a: App) => (a as unknown as { undoStack: string[] }).undoStack.length;

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
});

describe('revision 6: ROLLS is a transformation after CHOP', () => {
  it('new recipes are revision 6; older revisions keep their own rolls; sanitising keeps the take and the move', () => {
    expect(CURRENT_REVISION).toBe(ROLLS_REVISION);
    expect(defaultRecipe('funk', 4).revision).toBe(ROLLS_REVISION);
    expect(usesRollLayer(R())).toBe(true);
    expect(usesRollLayer(R('funk', 4, { revision: 5 }))).toBe(false);
    expect(usesRollLayer(R('funk', 4, { revision: 5, rollLayer: true }))).toBe(true);
    expect(bk(R('funk', 4, { revision: 5 })).rollReport).toBeUndefined();
    expect(sanitiseRecipe(R('funk', 4, { rollTake: 7 })).rollTake).toBe(7);
    expect('rollTake' in sanitiseRecipe(R('funk', 4, { rollTake: 0 }))).toBe(false);
    expect(sanitiseRecipe(R('funk', 4, { revision: 5, rollLayer: true })).rollLayer).toBe(true);
    expect('rollLayer' in sanitiseRecipe(R('funk', 4, { rollLayer: true }))).toBe(false); // implied from revision 6
  });

  it('never regenerates the groove: every source hit is exactly as with no rolls (all styles, many seeds)', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 6)) {
        const r = R(style, 4, { rolls: 1, rollPlace: 'anywhere', rollTargets: ['snare', 'hat', 'perc', 'tom', 'kick'] });
        const on = bk(r, seed);
        expect(source(on)).toBe(source(bk({ ...r, rolls: 0 }, seed)));
        // and the strokes really are extra hits, never on top of a hit of their drum
        const at = new Set(on.events.filter((e) => !e.rollOf).map(pos));
        for (const e of strokes(on)) expect(at.has(pos(e))).toBe(false);
      }
  });

  it('an older break moved to it keeps its groove exactly (only the old ROLLS layer is replaced)', () => {
    for (const style of ['funk', 'jungle', 'dnb'] as const)
      for (const seed of SEEDS.slice(0, 5)) {
        const old = R(style, 4, { revision: 5, rolls: 0.9 });
        expect(source(bk({ ...old, rollLayer: true }, seed))).toBe(source(bk({ ...old, rolls: 0 }, seed)));
      }
  });

  it('the observed settings (93%, 3 hits, 1/32, ALTERNATING, PHRASE END, SNARE) give rolls on an existing four-bar groove', () => {
    let eligible = 0;
    let rolled = 0;
    for (const style of STYLES)
      for (const seed of SEEDS) {
        const b = bk(R(style, 4, OBSERVED), seed);
        const rep = b.rollReport!;
        expect(rep.on).toBe(true);
        if (rep.eligible) eligible++;
        if (rep.rolls) rolled++;
        // no rolls: the reason names the actual problem, never just "no rolls"
        if (!rep.rolls) expect(rep.reason).toMatch(/SNARE HITS NEAR PHRASE ENDS|CHOSEN AT 93%/);
      }
    expect(eligible).toBeGreaterThan(STYLES.length * SEEDS.length * 0.8);
    expect(rolled / eligible).toBeGreaterThan(0.85);
    // before Phase 16 (revision 5) the same settings gave FUNK rolls on about a quarter of seeds
    const funk5 = SEEDS.filter((s) => bk(R('funk', 4, { ...OBSERVED, revision: 5 }), s).events.some((e) => e.role === 'roll' && e.why.endsWith('(ROLLS)'))).length;
    const funk6 = SEEDS.filter((s) => bk(R('funk', 4, OBSERVED), s).rollReport!.rolls > 0).length;
    expect(funk6).toBeGreaterThan(funk5);
    expect(funk6).toBeGreaterThan(SEEDS.length * 0.85);
  });

  it('strokes: LENGTH of them, SPEED apart, ending one stroke before the hit, same drum, inside its bar, never louder than the hit', () => {
    for (const speed of ['16', '16t', '32', '32t', '64'] as const)
      for (const seed of SEEDS.slice(0, 8)) {
        const b = bk(R('jungle', 4, { ...OBSERVED, rollSpeed: speed, rollLength: 4, rolls: 1 }), seed);
        const d = ROLL_TICKS[speed];
        const by = new Map<string, BreakEvent[]>();
        for (const e of strokes(b)) by.set(e.rollOf!, [...(by.get(e.rollOf!) ?? []), e]);
        for (const [key, ss] of by) {
          const hit = b.events.find((e) => !e.rollOf && pos(e) === key)!;
          expect(hit).toBeTruthy();
          ss.sort((x, y) => tick(x) - tick(y));
          expect(ss.length).toBeLessThanOrEqual(4);
          expect(tick(hit) - tick(ss.at(-1)!)).toBe(d);
          for (let i = 1; i < ss.length; i++) expect(tick(ss[i]!) - tick(ss[i - 1]!)).toBe(d);
          for (const s of ss) {
            expect(s.cat).toBe(hit.cat);
            expect(s.bar).toBe(hit.bar);
            expect(s.vel).toBeLessThanOrEqual(hit.vel);
            expect(s.role).toBe('roll');
          }
        }
      }
  });

  it('PROBABILITY is per eligible candidate: 0 none, 100% every one (two a bar at most), about half at 50%, and raising it only adds rolls', () => {
    let chosen = 0;
    let eligible = 0;
    for (const seed of SEEDS) {
      const r = R('jungle', 8, { rollPlace: 'anywhere', rollTargets: ['snare', 'kick'], rollLength: 2, rollSpeed: '32' });
      expect(bk({ ...r, rolls: 0 }, seed).rollReport!.rolls).toBe(0);
      const full = bk({ ...r, rolls: 1 }, seed).rollReport!;
      expect(full.rolls + full.capped).toBe(full.eligible);
      const half = bk({ ...r, rolls: 0.5 }, seed).rollReport!;
      chosen += half.rolls + half.capped;
      eligible += half.eligible;
      const keys = (p: number) => new Set(strokes(bk({ ...r, rolls: p }, seed)).map((e) => e.rollOf));
      const lo = keys(0.3);
      const hi = keys(0.7);
      for (const k of lo) if (bk({ ...r, rolls: 0.7 }, seed).rollReport!.capped === 0) expect(hi.has(k)).toBe(true);
      // the ceiling, per bar
      const b = bk({ ...r, rolls: 1 }, seed);
      for (let bar = 0; bar < 8; bar++) expect(new Set(strokes(b).filter((e) => e.bar === bar).map((e) => e.rollOf)).size).toBeLessThanOrEqual(MAX_PER_BAR);
    }
    expect(chosen / eligible).toBeGreaterThan(0.4);
    expect(chosen / eligible).toBeLessThan(0.6);
  });

  it('PHRASE END is a window (the last two beats of the bars that end the phrase and its sections), not one exact tick', () => {
    expect([...phraseEndBars(['A', 'A2', 'A', 'T'])]).toEqual([3]);
    expect([...phraseEndBars(['A', 'A2', 'A', 'F', 'A', 'A2', 'B', 'T'])].sort()).toEqual([3, 7]);
    for (const seed of SEEDS.slice(0, 15)) {
      const b = bk(R('funk', 8, { ...OBSERVED, rolls: 1 }), seed);
      const ends = phraseEndBars(b.plan);
      for (const e of strokes(b)) {
        const hit = b.events.find((x) => pos(x) === e.rollOf)!;
        expect(ends.has(hit.bar)).toBe(true);
        expect(hit.step).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('explains an empty result: no candidates, no room, generation off, nothing chosen, already rolls', () => {
    const plan: BarRole[] = ['A', 'T'];
    const ev = (cat: BreakEvent['cat'], bar: number, step: number, sub = 0, role: BreakEvent['role'] = 'backbeat'): BreakEvent => ({ cat, bar, step, sub, level: 0.8, role, why: '', vel: 100, swing: 0, offsetMs: 0, sample: null });
    const base = R('funk', 2, { ...OBSERVED, rolls: 1 });
    const seeds = { beat: 1, feel: 1 };
    expect(rollLayer([ev('kick', 1, 0)], base, seeds, plan).report.reason).toBe('NO SNARE HITS NEAR PHRASE ENDS');
    // a snare one 32nd after another: no room for a three-hit 1/32 roll before it
    expect(rollLayer([ev('snare', 1, 12, 0), ev('snare', 1, 12, 6)], { ...base, rollLength: 3 }, seeds, plan).report.reason).toBe(undefined);
    const tight = rollLayer([ev('snare', 1, 11, 9), ev('snare', 1, 12, 0)], base, seeds, plan).report;
    expect(tight.candidates).toBe(2);
    expect(tight.eligible).toBe(1); // the first has room; the second has only a 64th after the first
    expect(tight.rolls).toBe(1);
    expect(rollLayer([ev('snare', 1, 0, 3)], { ...base, rollPlace: 'anywhere' }, seeds, plan).report.reason).toMatch(/^NO ROOM FOR A 3-HIT 1\/32 ROLL BEFORE THE 1 SNARE HITS/);
    expect(rollLayer([ev('snare', 1, 12)], { ...base, rollsOn: false }, seeds, plan).report.reason).toBe('ROLL GENERATION OFF');
    expect(rollLayer([ev('snare', 1, 12)], { ...base, rollTargets: [] }, seeds, plan).report.reason).toBe('NO TARGET TRACKS');
    expect(rollLayer([ev('snare', 1, 12)], { ...base, rolls: 0 }, seeds, plan).report.reason).toBe('PROBABILITY 0%');
    expect(rollLayer([ev('snare', 1, 12, 0, 'roll'), ev('snare', 1, 13, 0, 'roll')], base, seeds, plan).report.reason).toMatch(/ARE ROLLS ALREADY/);
    let none: string | undefined;
    for (let s = 1; s < 200 && !none; s++) none = rollLayer([ev('snare', 1, 12)], { ...base, rolls: 0.05 }, { beat: s, feel: 1 }, plan).report.reason;
    expect(none).toBe('NONE OF THE 1 ELIGIBLE SNARE HITS NEAR PHRASE ENDS CHOSEN AT 5%: RE-ROLL DRAWS AGAIN');
  });

  it('is deterministic per take; another take draws again; the answer bars stay alike', () => {
    const r = R('jungle', 8, { rollPlace: 'anywhere', rolls: 0.5, rollTargets: ['snare', 'hat', 'kick'] });
    let differ = 0;
    for (const seed of SEEDS.slice(0, 10)) {
      expect(all(bk(r, seed))).toBe(all(bk(r, seed)));
      expect(all(bk({ ...r, rollTake: 3 }, seed))).toBe(all(bk({ ...r, rollTake: 3 }, seed)));
      if (JSON.stringify(strokes(bk(r, seed))) !== JSON.stringify(strokes(bk({ ...r, rollTake: 1 }, seed)))) differ++;
      // every take leaves the source exactly as it is
      expect(source(bk({ ...r, rollTake: 5 }, seed))).toBe(source(bk(r, seed)));
    }
    expect(differ).toBeGreaterThanOrEqual(8);
  });

  it('CHOP + ROLLS + EXPRESSION + DESTROY coexist; ROLLS leads into the chopped hits; 13 tracks; dense settings stay bounded and fast', () => {
    const r = R('breakcore', 8, { rolls: 1, rollLength: MAX_ROLL, rollSpeed: '64', rollPlace: 'anywhere', rollTargets: ['snare', 'hat', 'perc', 'tom', 'kick'], chop: { on: true, amount: 0.8, slice: 'micro', retrigger: 0.6, variant: 3 }, rollExpr: { preset: 'tumble', pitch: 'fall', from: 3, to: -5, vel: 'swell', timing: 'accelerate', ratchet: 0, reverse: 'last', variant: 2 }, destroy2: { ...chaosDestroy(defaultDestroy2(), 7), on: true, master: 0.6 } });
    const t0 = performance.now();
    const b = bk(r);
    const ms = performance.now() - t0;
    const base = bk({ ...r, rolls: 0 });
    expect(b.chop).toBeTruthy();
    expect(b.destroy2).toBeTruthy();
    expect(b.rollReport!.rolls).toBeGreaterThan(0);
    expect(b.events.length - base.events.length).toBeLessThanOrEqual(8 * MAX_PER_BAR * MAX_ROLL);
    expect(ms).toBeLessThan(500);
    for (const c of ['clap', 'fx'] as const) expect(JSON.stringify(b.events.filter((e) => e.cat === c))).toBe(JSON.stringify(base.events.filter((e) => e.cat === c)));
  });
});

describe('Part A: CHOP on the current groove', () => {
  it('reproduces the observed failure: CHOP off at 54% / SMALL / 39% on a hand-edited four-bar pattern (hand edits locked it) can be enabled, no BAKE', () => {
    const app = makeApp('4242');
    app.setRecipe({ bars: 4 });
    app.setChop({ on: false, amount: 0.54, slice: 'small', retrigger: 0.39 });
    // a hand edit, as any refining makes one
    const free = [1, 3, 5, 7, 9, 11, 13, 15].find((s) => !app.current.events.some((e) => e.cat === 'perc' && e.bar === 1 && e.step === s))!;
    app.addHit('perc', TPB + free * TPS);
    expect(app.hasEdits).toBe(true);
    const seeds = JSON.stringify(app.seeds);
    const groove = all(app.current);
    const edits = JSON.stringify(app.edits);
    app.setChop({ on: true });
    expect(app.chop.on).toBe(true);
    expect(app.chopped).toBe(true);
    expect(app.current.chop).toBeTruthy();
    expect(all(app.current)).not.toBe(groove);
    expect(JSON.stringify(app.seeds)).toBe(seeds); // no BAKE
    expect(JSON.stringify(app.edits)).toBe(edits); // nothing discarded
    app.setChop({ on: false });
    expect(all(app.current)).toBe(groove); // the source comes back exactly
  });

  it('CHOP can be enabled after BAKE, WILDCARD, a recipe change, undo/redo, a favourite and NEW PATCH', () => {
    const app = makeApp('77');
    const enable = (what: string) => {
      app.setChop({ on: false });
      const before = all(app.current);
      const seeds = JSON.stringify(app.seeds);
      app.setChop({ on: true, amount: 0.6 });
      expect(app.chop.on, what).toBe(true);
      expect(all(app.current), what).not.toBe(before);
      expect(JSON.stringify(app.seeds), what).toBe(seeds);
    };
    app.bake();
    enable('BAKE');
    app.wildcard(99);
    enable('WILDCARD');
    app.setStyle('jungle');
    enable('recipe change');
    app.undo();
    app.redo();
    enable('undo/redo');
    app.toggleFavourite();
    const fav = app.favourites[0]!.id;
    app.bake();
    app.loadFavourite(fav);
    enable('favourite');
    app.newPatch();
    expect(app.chop.on).toBe(false);
    expect(app.current.chop).toBeUndefined();
    enable('NEW PATCH');
  });

  it('a transformation never moves an older break to a newer GROOVE revision (its groove stays)', () => {
    const state = { recipe: { ...defaultRecipe('funk', 4), revision: 3 }, seeds: seedsFrom(4242), seedName: null, frozen: { beat: false, detail: false, feel: false, kit: false }, loop: true, level: 0.5, takeaway: {}, samples: {}, mix: {}, rollGeneration: false };
    localStorage.setItem('breakery.state.v1', JSON.stringify(state));
    const app = makeApp(null);
    expect(app.recipe.revision).toBe(3);
    const groove = all(app.current);
    app.setChop({ on: true, amount: 0.5 });
    expect(app.recipe.revision).toBe(3);
    app.setChop({ on: false });
    expect(all(app.current)).toBe(groove);
    app.setDestroy2({ on: true });
    app.setDestroy2({ on: false });
    app.setRollExpr({ pitch: 'rise' });
    expect(app.recipe.revision).toBe(3);
    // a roll action moves its rolls to the transformation, never its groove
    app.setRollsOn(true);
    expect(app.recipe.revision).toBe(3);
    expect(app.recipe.rollLayer).toBe(true);
  });

  it('ON OFF ON gives the same chop; RE-CHOP is a new arrangement of the same source; one undo step each; redo is exact', () => {
    const app = makeApp('31337');
    app.setRecipe({ bars: 4 });
    const groove = all(app.current);
    app.setChop({ on: true, amount: 0.6, slice: 'small' });
    const first = all(app.current);
    for (let i = 0; i < 3; i++) {
      app.setChop({ on: false });
      expect(all(app.current)).toBe(groove);
      app.setChop({ on: true });
      expect(all(app.current)).toBe(first);
    }
    const takes = new Set<string>([first]);
    for (let i = 0; i < 4; i++) {
      const d = undoDepth(app);
      app.reChop();
      expect(undoDepth(app)).toBe(d + 1);
      takes.add(all(app.current));
    }
    expect(takes.size).toBeGreaterThanOrEqual(4);
    const last = all(app.current);
    app.undo();
    const prev = all(app.current);
    expect(prev).not.toBe(last);
    app.redo();
    expect(all(app.current)).toBe(last);
    app.undo();
    expect(all(app.current)).toBe(prev);
    // the roll settings are untouched by any of it
    expect(app.recipe.rollPlace).toBe(defaultRecipe(app.recipe.style, 4).rollPlace);
  });
});

describe('Part B: ROLLS on the current groove', () => {
  it('enabling ROLL GENERATION applies the observed settings to the existing groove: no BAKE, unrelated hits intact', () => {
    const app = observedApp();
    const seeds = JSON.stringify(app.seeds);
    const s = app.rollSummary;
    expect(s.generated).toBeGreaterThan(0);
    expect(s.text).toMatch(/^\d+ ROLLS? · \d+ RETRIGGERS?/);
    app.setRollsOn(false);
    const groove = source(app.current);
    expect(strokes(app.current)).toEqual([]);
    expect(app.rollSummary.text).toMatch(/^ROLL GENERATION OFF · 0 MANUAL ROLLS RETAINED/);
    app.setRollsOn(true);
    expect(source(app.current)).toBe(groove);
    expect(JSON.stringify(app.seeds)).toBe(seeds);
    // the target is SNARE: every stroke is a snare
    for (const e of strokes(app.current)) expect(e.cat).toBe('snare');
  });

  it('RE-ROLL: another variation on the same groove, never accumulating, one undo step, exact redo', () => {
    const app = observedApp();
    app.setRolls({ rollPlace: 'anywhere', rolls: 0.6, rollTargets: ['snare', 'kick', 'hat'] });
    const groove = source(app.current);
    const recipe = (r: Recipe) => JSON.stringify({ ...r, rollTake: 0 });
    const r0 = recipe(app.recipe);
    const seeds = JSON.stringify(app.seeds);
    const seen = new Set<string>([JSON.stringify(strokes(app.current))]);
    const n0 = app.current.events.length;
    for (let i = 0; i < 6; i++) {
      const d = undoDepth(app);
      app.reRoll();
      expect(undoDepth(app)).toBe(d + 1);
      expect(source(app.current)).toBe(groove);
      expect(recipe(app.recipe)).toBe(r0);
      expect(JSON.stringify(app.seeds)).toBe(seeds);
      // replaced, not appended: events = source + this take's strokes
      expect(app.current.events.length).toBe(app.current.events.filter((e) => !e.rollOf).length + strokes(app.current).length);
      expect(app.current.events.length).toBeLessThan(n0 + 4 * MAX_PER_BAR * 3 + 1);
      seen.add(JSON.stringify(strokes(app.current)));
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    const last = all(app.current);
    app.undo();
    const prev = all(app.current);
    app.redo();
    expect(all(app.current)).toBe(last);
    app.undo();
    expect(all(app.current)).toBe(prev);
  });

  it('ROLLS ON OFF ON never multiplies the rolls; RE-ROLL with generation off says what to do', () => {
    const app = observedApp();
    const on = all(app.current);
    for (let i = 0; i < 4; i++) {
      app.setRollsOn(false);
      app.setRollsOn(true);
      expect(all(app.current)).toBe(on);
    }
    expect(app.edits.added.length).toBe(0);
    app.setRollsOn(false);
    const off = all(app.current);
    app.reRoll();
    expect(all(app.current)).toBe(off);
    expect(app.status).toMatch(/switch ROLL GENERATION on first/);
  });

  it('roll settings update the current groove at once (undoable), and the summary follows the actual events', () => {
    const app = observedApp();
    const groove = source(app.current);
    const d = undoDepth(app);
    app.setRolls({ rollLength: 5 });
    expect(undoDepth(app)).toBe(d + 1);
    expect(source(app.current)).toBe(groove);
    app.setRolls({ rollTargets: ['kick'] });
    expect(strokes(app.current).every((e) => e.cat === 'kick')).toBe(true);
    if (!strokes(app.current).length) expect(app.rollSummary.text).toMatch(/^0 ROLLS · /);
    app.undo();
    app.undo();
    expect(app.recipe.rollLength).toBe(3);
    // a generated stroke deleted by hand: the summary counts what is there
    const s = strokes(app.current)[0]!;
    const before = app.rollSummary.strokes;
    app.deleteHit(s.ref!);
    expect(app.rollSummary.strokes).toBe(before - 1);
  });

  it('manual rolls are kept when generation is off; CLEAR ROLLS clears every roll and nothing else, in one undo step', () => {
    const app = observedApp();
    const hit = app.current.events.find((e) => e.cat === 'kick' && !e.rollOf && e.bar === 1)!;
    app.ratchet(3, 12, hit.ref!);
    const manual = app.rollSummary.manual;
    expect(manual).toBe(1);
    app.setRollsOn(false);
    expect(strokes(app.current)).toEqual([]);
    expect(app.rollSummary.manual).toBe(1);
    expect(app.rollSummary.text).toMatch(/^ROLL GENERATION OFF · 1 MANUAL ROLL RETAINED/);
    app.setRollsOn(true);
    const nonRoll = JSON.stringify(app.current.events.filter((e) => e.role !== 'roll').map((e) => [pos(e), e.vel, e.offsetMs]));
    expect(app.manualRollHits).toBe(3);
    const d = undoDepth(app);
    app.clearRolls();
    expect(undoDepth(app)).toBe(d + 1);
    expect(app.current.events.filter((e) => e.role === 'roll')).toEqual([]);
    expect(JSON.stringify(app.current.events.filter((e) => e.role !== 'roll').map((e) => [pos(e), e.vel, e.offsetMs]))).toBe(nonRoll);
    app.undo();
    expect(app.rollGeneration).toBe(true);
    expect(app.rollSummary.manual).toBe(1);
    expect(app.rollSummary.generated).toBeGreaterThan(0);
  });

  it('ROLL GENERATION stays the user preference: off by default, kept through recipe changes, WILDCARD and NEW PATCH', () => {
    const app = makeApp('5');
    expect(app.rollGeneration).toBe(false);
    expect(app.current.rollReport?.on).toBe(false);
    app.setStyle('jungle');
    app.wildcard(12);
    app.randomRecipe(0.3);
    expect(app.rollGeneration).toBe(false);
    expect(strokes(app.current)).toEqual([]);
    app.setRollsOn(true);
    app.reRoll();
    app.newPatch();
    expect(app.rollGeneration).toBe(true);
    expect(app.recipe.rollTake).toBeUndefined();
    expect(app.recipe.chop).toBeUndefined();
    expect(app.recipe.rollPlace).toBe(defaultRecipe('funk', 2).rollPlace);
  });

  it('WILDCARD is one undo step and reports roll setting changes; with RECIPE, CONTROLS and CHOP off it leaves CHOP and the roll settings alone', () => {
    const app = observedApp();
    app.setChop({ on: true, amount: 0.5 });
    for (const c of ['recipe', 'controls', 'chop'] as const) app.setWildcard(c, false);
    const keep = (r: Recipe) => JSON.stringify([r.chop, r.rolls, r.rollLength, r.rollSpeed, r.rollDynamics, r.rollPlace, r.rollTargets]);
    const before = keep(app.recipe);
    const d = undoDepth(app);
    app.wildcard(4321);
    expect(undoDepth(app)).toBe(d + 1);
    expect(keep(app.recipe)).toBe(before);
    expect(app.wildcardReport!.groups.some((g) => g.title === 'ROLLS' || g.title === 'CHOP')).toBe(false);
    app.undo();
    // with RECIPE on, a new recipe brings its roll settings, and the report lists every one that changed
    app.resetWildcard();
    const rolls = (r: Recipe) => JSON.stringify([r.rollLength, r.rollSpeed, r.rollDynamics, r.rollPlace, r.rollTargets]);
    const was = rolls(app.recipe);
    app.wildcard(4321);
    expect(app.recipe.style).not.toBe('funk');
    expect(!!app.wildcardReport!.groups.find((g) => g.title === 'ROLLS')).toBe(rolls(app.recipe) !== was);
    expect(app.rollGeneration).toBe(true);
  });

  it('FREEZE does not disable the transformations, and BAKE keeps a frozen groove with its chop and rolls', () => {
    const app = observedApp();
    app.toggleRhythm();
    app.setChop({ on: true, amount: 0.5 });
    expect(app.chopped).toBe(true);
    app.reRoll();
    const now = all(app.current);
    app.toggleFreeze('kit');
    app.bake();
    expect(all(app.current)).toBe(now); // every layer frozen: the same groove, chop and rolls
  });

  it('track regeneration and loading a saved patch keep the summary in step with the events', () => {
    const app = observedApp();
    app.selectTrack('hat');
    app.regenTracks();
    expect(app.rollSummary.generated).toBe(new Set(strokes(app.current).map((e) => e.rollOf)).size);
    app.save();
    const again = makeApp(null);
    expect(all(again.current)).toBe(all(app.current));
    expect(again.rollSummary.text).toBe(app.rollSummary.text);
  });
});

describe('Part E: exports carry the transformed pattern', () => {
  it('MIDI and the audio timeline have every chop move and every roll stroke (GM notes, never transposed)', () => {
    const app = observedApp();
    app.setChop({ on: true, amount: 0.7 });
    const b = app.current;
    expect(strokes(b).length).toBeGreaterThan(0);
    const smf = parseSmf(breakMidi(b).bytes);
    const t = breakTimeline(b);
    const voices = new Set(t.events.map((e) => `${e.voice}|${e.tick}`));
    for (const e of strokes(b)) expect([...voices].some((v) => v.startsWith(`${e.cat}|`))).toBe(true);
    expect(t.events.length).toBe(b.events.filter((e) => e.sample).length);
    const snareNote = smf.notes.filter((n) => n.note === 38).length;
    expect(snareNote).toBeGreaterThanOrEqual(b.events.filter((e) => e.cat === 'snare').length - strokes(b).length);
    app.setRollExpr({ pitch: 'fall', from: 0, to: -7 });
    const pitched = parseSmf(breakMidi(app.current).bytes);
    expect(new Set(pitched.notes.map((n) => n.note))).toEqual(new Set(smf.notes.map((n) => n.note)));
  });
});
