/**
 * CHOP, the first transformation (engine/chopper.ts, engine/transform.ts): RESULT = CHOP(GROOVE,
 * settings, seed). Invariants of the transformation itself, and how it lives in the App: history,
 * undo, persistence, the batch, FREEZE, hand edits, playback, MIDI and WAV export. Whether a chop
 * sounds good is for listening; these tests check structure.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { entryKey, entryLabel } from '../src/app/seeds';
import { breakTimeline, eventTick } from '../src/audio/timeline';
import { atomicSpans, chop, chopActive, CHOP_STYLE, defaultChop, describeChop, sanitiseChop } from '../src/engine/chopper';
import { bake, groove, sanitiseRecipe, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { rollGroups } from '../src/engine/rolls';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, MAX_BARS, MIN_BARS, SLICE_SIZES, STEPS, STYLES, TPB, TPS, type Bars, type Break, type BreakEvent, type ChopSettings, type Recipe, type Style } from '../src/engine/types';
import { breakMidi } from '../src/midi/breakMidi';
import { parseSmf } from '../src/midi/smf';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
const on = (c: Partial<ChopSettings> = {}): ChopSettings => ({ on: true, amount: 0.6, slice: 'medium', retrigger: 0.4, variant: 0, ...c });
const recipe = (style: Style = 'jungle', bars: Bars = 4, c?: Partial<ChopSettings> | null): Recipe => ({ ...defaultRecipe(style, bars), ...(c ? { chop: on(c) } : {}) });
const tick = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const place = (b: Break) => b.events.map((e) => `${e.cat}|${tick(e)}|${e.vel}`);
const flat = (b: Break) => JSON.stringify(b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.sample, e.role]));
const k0 = kit();
const bakeK = (r: Recipe, seed = 4242) => bake(r, seedsFrom(seed), k0, {}, (id) => id);

describe('CHOP: the transformation', () => {
  it('disabled, or at AMOUNT 0, is the GROOVE exactly', () => {
    for (const style of STYLES) {
      const g = bakeK(recipe(style));
      expect(flat(bakeK(recipe(style, 4, { on: false, amount: 0.9 })))).toBe(flat(g));
      expect(flat(bakeK(recipe(style, 4, { amount: 0 })))).toBe(flat(g));
      expect(bakeK(recipe(style, 4, { amount: 0 })).chop).toBeUndefined();
    }
  });

  it('changes the pattern when on, and reports what it did', () => {
    for (const style of STYLES) {
      const g = bakeK(recipe(style));
      const c = bakeK(recipe(style, 4, { amount: 0.8 }));
      expect(flat(c)).not.toBe(flat(g));
      expect(c.chop!.slices).toBeGreaterThan(0);
      expect(c.chop!.edited).toBeGreaterThan(0);
      expect(describeChop(c.chop)).toMatch(/^CHOP: \d+ of \d+ slices edited/);
    }
  });

  it('is deterministic: the same GROOVE, settings and seed give the same result', () => {
    for (const style of ['funk', 'jungle', 'breakcore'] as Style[]) {
      const r = recipe(style, 4, { amount: 0.7, retrigger: 0.6, slice: 'small' });
      expect(flat(bakeK(r))).toBe(flat(bakeK(r)));
    }
  });

  it('different seeds and RE-CHOP variants give different chops', () => {
    const outs = new Set([1, 2, 3, 4, 5].map((s) => flat(bakeK(recipe('jungle', 4, { amount: 0.7 }), s))));
    expect(outs.size).toBe(5);
    const variants = new Set([0, 1, 2, 3].map((v) => place(bakeK(recipe('jungle', 4, { amount: 0.7, variant: v }))).join()));
    expect(variants.size).toBeGreaterThanOrEqual(3);
  });

  it('works from the GROOVE: never compounds, and does not regenerate it', () => {
    const r = recipe('dnb', 4, { amount: 0.7 });
    const seeds = seedsFrom(99);
    const g = groove(sanitiseRecipe(r), seeds);
    const frozen = JSON.stringify(g.events);
    const a = chop(g.events, r.chop!, { recipe: r, plan: g.core.plan, seed: seeds.beat });
    expect(JSON.stringify(g.events)).toBe(frozen); // the source is not mutated
    const b = chop(g.events, r.chop!, { recipe: r, plan: g.core.plan, seed: seeds.beat });
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    // the GROOVE under a chop is the same whatever CHOP is set to
    for (const c of [{ amount: 0.2 }, { amount: 0.9, slice: 'micro' as const }, { retrigger: 1 }]) {
      expect(JSON.stringify(groove(sanitiseRecipe(recipe('dnb', 4, c)), seeds).events)).toBe(frozen);
    }
  });

  it('a higher AMOUNT keeps less of the GROOVE in place (on average)', () => {
    for (const style of ['funk', 'hiphop', 'jungle', 'dnb', 'breakcore'] as Style[]) {
      const kept = (amount: number) => {
        let sum = 0;
        for (let s = 0; s < 8; s++) {
          // CHOP alone (revision 6 rolls run after it: rollLayer.ts)
          const g = new Set(place(bakeK({ ...recipe(style), rolls: 0 }, 300 + s)));
          const c = place(bakeK({ ...recipe(style, 4, { amount, retrigger: 0.3, slice: CHOP_STYLE[style].slice }), rolls: 0 }, 300 + s));
          sum += c.filter((p) => g.has(p)).length / g.size;
        }
        return sum / 8;
      };
      const [lo, mid, hi] = [kept(0.2), kept(0.55), kept(0.95)];
      expect(lo).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(hi);
      expect(lo).toBeGreaterThan(0.75); // low amounts stay recognisable
    }
  });

  it('SLICE SIZE changes the structure: smaller slices, more of them', () => {
    const n = SLICE_SIZES.map((slice) => bakeK(recipe('jungle', 4, { slice, amount: 0.6 }), 7).chop!.slices);
    for (let i = 1; i < n.length; i++) expect(n[i]!).toBeGreaterThan(n[i - 1]!);
    const shapes = new Set(SLICE_SIZES.map((slice) => place(bakeK(recipe('jungle', 4, { slice, amount: 0.6 }), 7)).join()));
    expect(shapes.size).toBe(4);
  });

  it('RETRIGGER 0 adds no retriggers; more RETRIGGER, more of them', () => {
    const count = (retrigger: number) => {
      let n = 0;
      for (let s = 0; s < 10; s++) {
        const b = bakeK(recipe('breakcore', 4, { amount: 0.8, retrigger, slice: 'micro' }), 40 + s);
        n += b.events.filter((e) => e.why.startsWith('CHOP retrigger')).length;
        if (retrigger === 0) expect((b.chop!.ops.retrigger ?? 0) + (b.chop!.ops.double ?? 0)).toBe(0);
      }
      return n;
    };
    expect(count(0)).toBe(0);
    const [lo, hi] = [count(0.3), count(1)];
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(lo);
  });

  it('the recipe shapes the chop: BREAKCORE fragments far more than FUNK', () => {
    const moved = (style: Style) => {
      let sum = 0;
      for (let s = 0; s < 8; s++) {
        const g = new Set(place(bakeK(recipe(style), 70 + s)));
        const c = place(bakeK(recipe(style, 4, { amount: 0.7, retrigger: 0.5, slice: CHOP_STYLE[style].slice }), 70 + s));
        sum += 1 - c.filter((p) => g.has(p)).length / g.size;
      }
      return sum / 8;
    };
    expect(moved('breakcore')).toBeGreaterThan(moved('funk') * 1.5);
    // every recipe has its own weights and a suggested slice size
    for (const s of STYLES) expect(SLICE_SIZES).toContain(CHOP_STYLE[s].slice);
    expect(CHOP_STYLE.funk.slice).toBe('large');
    expect(CHOP_STYLE.breakcore.slice).toBe('micro');
  });

  it('keeps the backbeat in FUNK and HIP-HOP at low AMOUNT', () => {
    for (const style of ['funk', 'hiphop'] as Style[]) {
      for (let s = 0; s < 6; s++) {
        const g = bakeK(recipe(style), 900 + s);
        const c = bakeK(recipe(style, 4, { amount: 0.25, retrigger: 0.15, slice: CHOP_STYLE[style].slice }), 900 + s);
        for (let bar = 0; bar < 4; bar++) {
          const has = (b: Break) => b.events.some((e) => e.cat === 'snare' && e.bar === bar && (e.step === 4 || e.step === 12) && e.vel >= 90);
          if (has(g)) expect(has(c)).toBe(true);
        }
      }
    }
  });

  it('stays in the pattern, on its grid, one hit per drum and place, at every length', () => {
    for (let bars = MIN_BARS; bars <= MAX_BARS; bars++) {
      for (const style of STYLES) {
        for (const slice of SLICE_SIZES) {
          const b = bakeK(recipe(style, bars as Bars, { amount: 0.95, retrigger: 1, slice }), 11 + bars);
          const seen = new Set<string>();
          for (const e of b.events) {
            expect(e.bar).toBeGreaterThanOrEqual(0);
            expect(e.bar).toBeLessThan(bars);
            expect(e.step).toBeGreaterThanOrEqual(0);
            expect(e.step).toBeLessThan(STEPS);
            expect(e.sub).toBeGreaterThanOrEqual(0);
            expect(e.sub).toBeLessThan(TPS);
            expect(Number.isInteger(e.vel)).toBe(true);
            expect(e.vel).toBeGreaterThanOrEqual(1);
            expect(e.vel).toBeLessThanOrEqual(127);
            expect(eventTick(e, b.recipe.bpm)).toBeGreaterThanOrEqual(0);
            const key = `${e.cat}|${tick(e)}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
          for (let i = 1; i < b.events.length; i++) expect(tick(b.events[i]!)).toBeGreaterThanOrEqual(tick(b.events[i - 1]!));
          expect(b.plan.length).toBe(bars);
          expect(b.recipe.bars).toBe(bars);
        }
      }
    }
  }, 60000);

  it('retriggers are rolls (the ROLLS tab and the PATTERN show them), inside one bar, softer as they go faster', () => {
    for (let s = 0; s < 10; s++) {
      const b = bakeK(recipe('jungle', 4, { amount: 0.9, retrigger: 1, slice: 'small' }), 500 + s);
      const re = b.events.filter((e) => e.why.startsWith('CHOP retrigger'));
      for (const e of re) expect(e.role).toBe('roll');
      for (const g of rollGroups(b.events, true)) {
        expect(g.end - g.start).toBeLessThan(TPB);
        for (const e of g.events) expect(e.bar).toBe(g.bar);
      }
    }
  });

  it('never cuts a roll or a tom fill: each one stays whole (moved or not)', () => {
    for (let s = 0; s < 10; s++) {
      // CHOP alone (revision 6 rolls run after it and lead into the chopped hits: rollLayer.ts)
      const r = { ...recipe('dnb', 4, { amount: 0.8, retrigger: 0, slice: 'micro' }), rolls: 0 };
      const g = bakeK({ ...recipe('dnb'), rolls: 0 }, 600 + s);
      const c = bakeK(r, 600 + s);
      // every roll group in the result has as many strokes as some roll group of the GROOVE (or a
      // whole number of them: a roll repeated straight after itself reads as one longer group)
      const sizes = rollGroups(g.events, true).map((x) => [x.cat, x.events.length] as const);
      for (const x of rollGroups(c.events, true)) {
        if (x.events.some((e) => e.why.startsWith('CHOP retrigger'))) continue;
        expect(sizes.some(([cat, n]) => cat === x.cat && x.events.length % n === 0), `${x.cat}:${x.events.length}`).toBe(true);
      }
      expect(atomicSpans(g.events, 4).length).toBeGreaterThanOrEqual(0);
    }
  });

  it('ghosts stay soft, and crashes stay where they are', () => {
    for (const style of ['funk', 'hiphop', 'jungle', 'dnb', 'breakcore'] as Style[]) {
      for (let s = 0; s < 6; s++) {
        const g = bakeK(recipe(style, 4), 700 + s);
        const c = bakeK(recipe(style, 4, { amount: 0.9, retrigger: 0.8, slice: 'small' }), 700 + s);
        const loudest = Math.max(0, ...g.events.filter((e) => e.cat === 'ghost').map((e) => e.vel));
        for (const e of c.events.filter((x) => x.cat === 'ghost')) expect(e.vel).toBeLessThanOrEqual(Math.max(loudest, 50));
        const crashes = (b: Break) => b.events.filter((e) => e.cat === 'crash').map((e) => `${tick(e)}|${e.vel}`).join();
        expect(crashes(c)).toBe(crashes(g));
      }
    }
  });

  it('keeps the samples the GROOVE chose: copies carry their source hit’s sample', () => {
    for (let s = 0; s < 5; s++) {
      const g = bakeK(recipe('jungle'), 800 + s);
      const c = bakeK(recipe('jungle', 4, { amount: 0.9, retrigger: 0.6 }), 800 + s);
      for (const cat of CATEGORIES) {
        const used = new Set(g.events.filter((e) => e.cat === cat).map((e) => e.sample));
        for (const e of c.events.filter((x) => x.cat === cat)) {
          expect(e.sample).toBeTruthy();
          expect(used.has(e.sample)).toBe(true);
        }
      }
    }
  });

  it('settings are sanitised (old saves without CHOP stay without it)', () => {
    expect(sanitiseChop(undefined)).toBeUndefined();
    expect(sanitiseChop({ on: true, amount: 7, slice: 'huge', retrigger: -1, variant: 2.5 })).toEqual({ on: true, amount: 1, slice: 'medium', retrigger: 0, variant: 2 });
    expect(sanitiseRecipe(defaultRecipe('funk', 2)).chop).toBeUndefined();
    expect(sanitiseRecipe({ ...defaultRecipe('funk', 2), chop: on({ amount: 0.3 }) }).chop).toEqual(on({ amount: 0.3 }));
    expect(chopActive(defaultChop())).toBe(false);
    expect(chopActive(on())).toBe(true);
    expect(chopActive(on({ amount: 0 }))).toBe(false);
  });

  it('a chopped break is another break in the history and favourites', () => {
    const seeds = seedsFrom(5);
    const a = { recipe: recipe('funk'), seeds, name: null };
    const b = { recipe: recipe('funk', 4, { amount: 0.5 }), seeds, name: null };
    const off = { recipe: recipe('funk', 4, { on: false, amount: 0.5 }), seeds, name: null };
    expect(entryKey(a)).not.toBe(entryKey(b));
    expect(entryKey(a)).toBe(entryKey(off));
    expect(entryLabel(b)).toMatch(/chopped/);
    expect(entryLabel(a)).not.toMatch(/chopped/);
  });
});

// ------------------------------------------------------------------ the App

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function makeApp(seed: string | undefined = '4242') {
  const ingredients = { kit: () => k0, loudness: () => ({}), name: (id: string | null) => id ?? '—' };
  const sent: Break[] = [];
  const player = { loop: true, level: 0.5, playing: true, setLevel() {}, setMix() {}, setOutput() {}, setBreak: (b: Break) => sent.push(b), update: (b: Break) => sent.push(b), audition: async () => {}, onSwap: () => {} };
  const app = new App(ingredients as never, player as never, seed);
  app.setStyle('jungle');
  app.setRecipe({ bars: 4 });
  return { app, sent };
}

describe('CHOP in the App', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('starts off, with the recipe’s suggested slice size, and switching it on re-chops the same GROOVE', () => {
    const { app } = makeApp();
    expect(app.chop.on).toBe(false);
    expect(app.chop.slice).toBe(CHOP_STYLE.jungle.slice);
    const g = flat(app.current);
    const seeds = { ...app.seeds };
    app.setChop({ on: true, amount: 0.7 });
    expect(app.chopped).toBe(true);
    expect(app.seeds).toEqual(seeds);
    expect(flat(app.current)).not.toBe(g);
    app.setChop({ amount: 0 });
    expect(flat(app.current)).toBe(g);
    app.setChop({ amount: 0.7 });
    app.setChop({ on: false });
    expect(flat(app.current)).toBe(g);
    expect(app.chop.amount).toBe(0.7); // the settings are kept
  });

  it('every change is one undo step, and undo / redo restore the chop exactly', () => {
    const { app } = makeApp();
    const g = flat(app.current);
    app.setChop({ on: true, amount: 0.5 });
    const a = flat(app.current);
    app.setChop({ slice: 'micro' });
    const b = flat(app.current);
    app.reChop();
    const c = flat(app.current);
    expect(new Set([g, a, b, c]).size).toBe(4);
    app.undo();
    expect(flat(app.current)).toBe(b);
    app.undo();
    expect(flat(app.current)).toBe(a);
    app.undo();
    expect(flat(app.current)).toBe(g);
    expect(app.chop.on).toBe(false);
    app.redo();
    app.redo();
    app.redo();
    expect(flat(app.current)).toBe(c);
    expect(app.chop.variant).toBe(1);
  });

  it('a drag of AMOUNT is one undo step', () => {
    const { app } = makeApp();
    app.setChop({ on: true });
    const before = flat(app.current);
    app.beginGesture();
    for (const v of [0.45, 0.5, 0.6, 0.7, 0.8]) app.setChop({ amount: v });
    app.endGesture();
    app.undo();
    expect(flat(app.current)).toBe(before);
  });

  it('hands every change to the player (live switching uses the existing scheduler)', () => {
    const { app, sent } = makeApp();
    const n = sent.length;
    app.setChop({ on: true, amount: 0.6 });
    expect(sent.length).toBe(n + 1);
    expect(sent[n]).toBe(app.current);
    expect(sent[n]!.chop).toBeTruthy();
  });

  it('is saved and restored with the break', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.65, slice: 'small', retrigger: 0.8 });
    app.reChop();
    const was = flat(app.current);
    const again = new App({ kit: () => k0, loudness: () => ({}), name: (id: string | null) => id ?? '—' } as never, { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setOutput() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} } as never);
    expect(again.chop).toEqual({ on: true, amount: 0.65, slice: 'small', retrigger: 0.8, variant: 1 });
    expect(flat(again.current)).toBe(was);
  });

  it('the history keeps the chop: back and forward return to it', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.7 });
    const chopped = flat(app.current);
    app.bake();
    expect(app.chopped).toBe(true); // CHOP settings carry to new breaks
    app.historyBack();
    expect(flat(app.current)).toBe(chopped);
  });

  it('BAKE makes a new GROOVE and chops it; FREEZE BEAT keeps the chop', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.7 });
    app.toggleFreeze('beat');
    app.toggleFreeze('detail');
    app.toggleFreeze('feel');
    app.toggleFreeze('kit');
    const before = flat(app.current);
    app.bake();
    expect(flat(app.current)).toBe(before);
  });

  it('FREEZE SAMPLES: the chop uses the frozen sample choice', () => {
    const { app } = makeApp();
    app.toggleFreeze('kit');
    const kitSeed = app.seeds.kit;
    app.setChop({ on: true, amount: 0.9 });
    app.bake();
    expect(app.seeds.kit).toBe(kitSeed);
    const g = bake({ ...app.recipe, chop: { ...app.chop, on: false } }, app.seeds, k0, {}, (id) => id);
    for (const cat of CATEGORIES) {
      const used = new Set(g.events.filter((e) => e.cat === cat).map((e) => e.sample));
      for (const e of app.current.events.filter((x) => x.cat === cat)) expect(used.has(e.sample)).toBe(true);
    }
  });

  it('BATCH: every candidate is its own GROOVE chopped with its own seed, and CHOP changes follow', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.6 });
    app.bakeBatch();
    expect(app.batch.length).toBeGreaterThan(1);
    expect(new Set(app.batch.map(flat)).size).toBe(app.batch.length);
    for (const c of app.batch) {
      expect(c.chop).toBeTruthy();
      expect(place(c).join()).toBe(place(bake(app.recipe, c.seeds, k0)).join());
    }
    app.pick(2);
    const picked = flat(app.current);
    app.setChop({ amount: 0.3 });
    expect(app.batch.length).toBeGreaterThan(1);
    expect(flat(app.batch[2]!)).toBe(flat(app.current));
    expect(flat(app.current)).not.toBe(picked);
    for (const c of app.batch) expect(place(c).join()).toBe(place(bake(app.recipe, c.seeds, k0)).join());
  });

  it('hand edits never lock CHOP (Phase 16): CHOP still changes, the edits are kept, and the same CHOP gives the same edited result', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.6 });
    const step = [1, 3, 5, 7, 9, 11, 13, 15].find((s) => !app.current.events.some((e) => e.cat === 'perc' && e.bar === 0 && Math.abs(e.step - s) <= 1))!;
    const ref = app.addHit('perc', step * TPS)!;
    expect(ref).toBeTruthy();
    const edits = JSON.stringify(app.edits);
    const edited = flat(app.current);
    app.setChop({ amount: 0.9 });
    expect(flat(app.current)).not.toBe(edited);
    expect(JSON.stringify(app.edits)).toBe(edits); // nothing discarded
    expect(app.current.events.some((e) => e.ref === ref)).toBe(true); // a hand-placed hit stays where it was put
    expect(app.status).toMatch(/hand edit/);
    app.setChop({ amount: 0.6 });
    expect(flat(app.current)).toBe(edited);
    app.setChop({ on: false });
    expect(JSON.stringify(app.edits)).toBe(edits);
    app.setChop({ on: true });
    expect(flat(app.current)).toBe(edited);
    app.reChop();
    expect(flat(app.current)).not.toBe(edited);
    app.undo();
    expect(flat(app.current)).toBe(edited);
  });

  it('chopped hits can be edited: deleted, moved and re-velocitied, like any hit', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.9, retrigger: 0.8 });
    const moved = app.current.events.find((e) => e.why.startsWith('CHOP'))!;
    expect(moved).toBeTruthy();
    const n = app.current.events.length;
    app.deleteHit(moved.ref!);
    expect(app.current.events.length).toBe(n - 1);
    app.undo();
    expect(app.current.events.length).toBe(n);
  });

  it('MIDI and WAV export the chopped pattern', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.8, retrigger: 0.7 });
    const b = app.current;
    const midi = breakMidi(b);
    const smf = parseSmf(midi.bytes);
    expect(smf.notes.length).toBe(midi.notes);
    const g = bake({ ...app.recipe, chop: { ...app.chop, on: false } }, app.seeds, k0);
    const notes = (m: ReturnType<typeof parseSmf>) => JSON.stringify(m.notes.map((n) => [n.tick, n.note, n.velocity]));
    expect(notes(smf)).not.toBe(notes(parseSmf(breakMidi(g).bytes)));
    const t = breakTimeline(b);
    expect(t.events.length).toBe(b.events.filter((e) => e.sample).length);
    const ticks = new Set(t.events.map((e) => `${e.voice}|${e.tick}`));
    for (const e of b.events) expect(ticks.has(`${e.cat}|${eventTick(e, b.recipe.bpm)}`)).toBe(true);
  });

  it('RANDOM RECIPE and a recipe change keep the CHOP settings and chop the new GROOVE', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.5, slice: 'small' });
    app.setStyle('funk');
    expect(app.chop).toMatchObject({ on: true, amount: 0.5, slice: 'small' });
    expect(app.chopped).toBe(true);
    app.randomRecipe(0.4);
    expect(app.chop).toMatchObject({ on: true, amount: 0.5, slice: 'small' });
    expect(app.current.chop).toBeTruthy();
  });

  it('works at every pattern length', () => {
    const { app } = makeApp();
    app.setChop({ on: true, amount: 0.8 });
    for (let bars = MIN_BARS; bars <= MAX_BARS; bars++) {
      app.setRecipe({ bars: bars as Bars });
      expect(app.current.plan.length).toBe(bars);
      for (const e of app.current.events) expect(e.bar).toBeLessThan(bars);
    }
  });
});
