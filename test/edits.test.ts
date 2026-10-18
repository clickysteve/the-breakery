/**
 * Hand editing: the edit layer (engine/edits.ts), how it reaches playback, export, stems and MIDI,
 * and the App's rules for undo / redo and for what happens to edits when the break changes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { breakTimeline, eventTick } from '../src/audio/timeline';
import { addHit, deleteHit, duplicateHit, editCount, findRef, hitKey, moveHit, noEdits, posLabel, revertHit, sanitiseEdits, setSample, setTiming, setVelocity, snapTick, tickOf, type Edits } from '../src/engine/edits';
import { bake, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { hashString } from '../src/engine/rng';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, TPB, TPS, type Break, type BreakEvent, type Recipe } from '../src/engine/types';
import { breakMidi } from '../src/midi/breakMidi';
import { parseSmf } from '../src/midi/smf';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
const recipe = (over: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe('funk', 2), ...over });
const SEEDS = seedsFrom(4242);
const bakeE = (edits?: Edits | null, r = recipe(), k = kit()) => bake(r, SEEDS, k, {}, (id) => id, edits);
const flat = (b: Break) => b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.sample]);
const gen = (b: Break, cat: BreakEvent['cat'], bar = 0) => b.events.filter((e) => e.cat === cat && e.bar === bar && !e.manual);
/** a free place for a category in bar 0 (nothing of that category within a sixteenth) */
function freeStep(b: Break, cat: BreakEvent['cat']): number {
  for (let s = 1; s < 16; s++) if (!b.events.some((e) => e.cat === cat && e.bar === 0 && Math.abs(e.step - s) <= 1)) return s;
  throw new Error('no free step');
}

describe('the edit layer', () => {
  it('with no edits the break is exactly as generated, and every event has a ref', () => {
    const a = bakeE(null);
    const b = bakeE(noEdits());
    expect(flat(a)).toEqual(flat(b));
    for (const e of a.events) expect(e.ref).toBe(hitKey(e));
    expect(a.edits).toBeUndefined();
  });

  it('adds a hit by hand: marked as manual, explained honestly, with swing from the recipe and a sample', () => {
    const base = bakeE(null, recipe({ swing: 0.6 }));
    const s = freeStep(base, 'kick') | 1; // an off-beat sixteenth, which swing delays
    const step = base.events.some((e) => e.cat === 'kick' && e.bar === 0 && e.step === s) ? freeStep(base, 'kick') : s;
    const r = addHit(noEdits(), base.events, { cat: 'kick', bar: 0, step, sub: 0 });
    expect(r.ref).toBe('m:1');
    const b = bakeE(r.edits, recipe({ swing: 0.6 }));
    const e = findRef(b.events, r.ref)!;
    expect(e).toBeTruthy();
    expect(e.manual).toBe('added');
    expect(e.role).toBe('manual');
    expect(e.why).toBe(`added by hand at ${posLabel(e)}`);
    expect(e.vel).toBe(104);
    expect(e.offsetMs).toBe(0);
    if (step % 2) expect(e.swing).toBeGreaterThan(0);
    expect(e.sample).toMatch(/^kick-/);
    expect(b.events.length).toBe(base.events.length + 1);
  });

  it('adding where a hit already is selects that hit instead of doubling it', () => {
    const base = bakeE(null);
    const k = gen(base, 'kick')[0]!;
    const r = addHit(noEdits(), base.events, { cat: 'kick', bar: k.bar, step: k.step, sub: k.sub });
    expect(r.ref).toBe(k.ref);
    expect(editCount(r.edits)).toBe(0);
  });

  it('deletes generated and hand-placed hits', () => {
    const base = bakeE(null);
    const sn = gen(base, 'snare')[0]!;
    let ed = deleteHit(noEdits(), sn.ref!);
    let b = bakeE(ed);
    expect(findRef(b.events, sn.ref)).toBeUndefined();
    expect(b.events.length).toBe(base.events.length - 1);
    const r = addHit(ed, b.events, { cat: 'perc', bar: 1, step: 3, sub: 6 });
    ed = r.edits;
    b = bakeE(ed);
    expect(findRef(b.events, r.ref)).toBeTruthy();
    ed = deleteHit(ed, r.ref!);
    b = bakeE(ed);
    expect(findRef(b.events, r.ref)).toBeUndefined();
    expect(ed.added).toEqual([]);
  });

  it('moves a generated hit: the original goes, a hand-placed copy keeps its velocity and timing and says where it came from', () => {
    const base = bakeE(null);
    const sn = gen(base, 'snare').find((e) => e.role === 'backbeat')!;
    const to = { bar: 0, step: sn.step + 1, sub: 6 };
    const r = moveHit(noEdits(), base.events, sn.ref!, to);
    const b = bakeE(r.edits);
    expect(findRef(b.events, sn.ref)).toBeUndefined();
    const m = findRef(b.events, r.ref)!;
    expect([m.bar, m.step, m.sub]).toEqual([to.bar, to.step, to.sub]);
    expect(m.vel).toBe(sn.vel);
    expect(m.offsetMs).toBe(sn.offsetMs);
    expect(m.manual).toBe('moved');
    expect(m.why).toContain('moved by hand');
    expect(m.why).toContain('backbeat');
    // moving it again keeps it the same hand-placed hit
    const r2 = moveHit(r.edits, b.events, r.ref!, { bar: 1, step: 2, sub: 0 });
    expect(r2.ref).toBe(r.ref);
    expect(r2.edits.added.length).toBe(1);
    // and REVERT puts it back
    const back = revertHit(r2.edits, r.ref!);
    expect(back.ref).toBe(sn.ref);
    expect(flat(bakeE(back.edits))).toEqual(flat(base));
  });

  it('refuses to move a hit onto another hit of its category', () => {
    const base = bakeE(null);
    const [a, b] = gen(base, 'hat');
    const r = moveHit(noEdits(), base.events, a!.ref!, b!);
    expect(r.ref).toBeNull();
    expect(editCount(r.edits)).toBe(0);
  });

  it('changes velocity, timing and sample of a generated hit, and reverts them', () => {
    const base = bakeE(null);
    const h = gen(base, 'hat')[1]!;
    let r = setVelocity(noEdits(), base.events, h.ref!, 33);
    r = setTiming(r.edits, base.events, h.ref!, -7.26);
    r = setSample(r.edits, base.events, h.ref!, 'perc-b');
    const b = bakeE(r.edits);
    const e = findRef(b.events, h.ref)!;
    expect(e.vel).toBe(33);
    expect(e.offsetMs).toBe(-7.3);
    expect(e.sample).toBe('perc-b');
    expect(e.sampleWhy).toBe('chosen by hand');
    expect(e.manual).toBe('edited');
    expect(e.editWhy).toContain(`velocity ${h.vel} → 33`);
    expect(e.why).toBe(h.why); // the generator's explanation of the placement still holds
    // limits
    expect(findRef(bakeE(setVelocity(noEdits(), base.events, h.ref!, 400).edits).events, h.ref)!.vel).toBe(127);
    expect(findRef(bakeE(setVelocity(noEdits(), base.events, h.ref!, -3).edits).events, h.ref)!.vel).toBe(1);
    expect(findRef(bakeE(setTiming(noEdits(), base.events, h.ref!, 999).edits).events, h.ref)!.offsetMs).toBe(60);
    // back to the PICK mode, then back to generated
    const unpinned = setSample(r.edits, b.events, h.ref!, null);
    expect(findRef(bakeE(unpinned.edits).events, h.ref)!.sample).toBe(h.sample);
    expect(flat(bakeE(revertHit(r.edits, h.ref!).edits))).toEqual(flat(base));
  });

  it('a sample chosen by hand that is no longer loaded falls back to the main sample and says so', () => {
    const base = bakeE(null);
    const h = gen(base, 'snare')[0]!;
    const r = setSample(noEdits(), base.events, h.ref!, 'gone');
    const e = findRef(bakeE(r.edits).events, h.ref)!;
    expect(e.sample).toMatch(/^snare-/);
    expect(e.sampleWhy).toContain('no longer loaded');
  });

  it('adding or deleting a hit never changes another hit’s AUTO sample', () => {
    const base = bakeE(null);
    const r = addHit(noEdits(), base.events, { cat: 'hat', bar: 0, step: 0, sub: 3 });
    const ed = deleteHit(r.edits, gen(base, 'kick')[0]!.ref!);
    const b = bakeE(ed);
    for (const e of b.events) {
      if (e.manual) continue;
      expect(e.sample).toBe(findRef(base.events, e.ref)!.sample);
    }
  });

  it('duplicates a hit one SNAP step later, or at the next free place', () => {
    const base = bakeE(null);
    const sn = gen(base, 'snare').find((e) => e.role === 'backbeat')!;
    const r = duplicateHit(noEdits(), base.events, sn.ref!, 6, 2);
    const e = findRef(bakeE(r.edits).events, r.ref)!;
    expect(tickOf(e)).toBe(tickOf(sn) + 6);
    expect(e.vel).toBe(sn.vel);
  });

  it('is deterministic: the same seeds, recipe and edits give the same break', () => {
    const base = bakeE(null);
    const r = addHit(noEdits(), base.events, { cat: 'crash', bar: 1, step: 0, sub: 0 });
    const a = flat(bakeE(r.edits));
    const b = flat(bakeE(JSON.parse(JSON.stringify(r.edits)) as Edits));
    expect(hashString(JSON.stringify(a))).toBe(hashString(JSON.stringify(b)));
  });
});

describe('event boundaries', () => {
  it('snapping keeps hits inside the pattern', () => {
    expect(snapTick(-50, 12, 2)).toBe(0);
    expect(snapTick(2 * TPB + 40, 12, 2)).toBe(2 * TPB - 12); // past the end: the last sixteenth
    expect(snapTick(2 * TPB - 1, 3, 2)).toBe(2 * TPB - 3);
    expect(snapTick(TPB - 2, 12, 2)).toBe(TPB); // the end of a bar rounds to the next downbeat
    for (const snap of [12, 6, 3, 8, 4]) for (let t = 0; t < 2 * TPB; t += 5) expect((snapTick(t, snap, 2) % TPB) % snap).toBe(0);
    expect(snapTick(13, 6, 1)).toBe(12);
    expect(snapTick(13, 3, 1)).toBe(12);
    expect(snapTick(14, 3, 1)).toBe(15);
    expect(snapTick(11, 8, 1)).toBe(8); // 16th triplets: multiples of 8 ticks
    expect(snapTick(14, 4, 1)).toBe(16);
  });

  it('hand hits in bars beyond the length are kept, reported, and come back when the pattern is longer', () => {
    const four = bakeE(null, recipe({ bars: 4 }));
    const r = addHit(noEdits(), four.events, { cat: 'perc', bar: 3, step: 5, sub: 0 });
    const two = bakeE(r.edits, recipe({ bars: 2 }));
    expect(two.events.some((e) => e.manual)).toBe(false);
    expect(two.editReport?.outside).toBe(1);
    const again = bakeE(r.edits, recipe({ bars: 4 }));
    expect(findRef(again.events, r.ref)).toBeTruthy();
  });

  it('a recipe change re-applies the edits; edits whose generated hit is gone are kept and reported', () => {
    const base = bakeE(null);
    const sn = gen(base, 'snare').find((e) => e.role === 'backbeat')!;
    let ed = deleteHit(noEdits(), sn.ref!);
    ed = setVelocity(ed, base.events, gen(base, 'kick')[0]!.ref!, 20).edits;
    ed.removed.push('ghost|0|15|9'); // a ghost that is not in this break
    const b = bakeE(ed, recipe({ density: 0.9, ghosts: 0.2 }));
    expect(findRef(b.events, sn.ref)).toBeUndefined();
    expect(findRef(b.events, gen(base, 'kick')[0]!.ref)!.vel).toBe(20);
    expect(b.editReport?.inactive).toBeGreaterThanOrEqual(1);
  });

  it('cleans malformed stored edits', () => {
    const e = sanitiseEdits({ removed: ['snare|0|4|0', 'nope', 3, 'zebra|0|1|0'], changed: { 'kick|0|0|0': { vel: 900, offsetMs: 'x' }, bad: { vel: 3 } }, added: [{ cat: 'kick', bar: 0, step: 20, sub: 0 }, { cat: 'hat', bar: 1, step: 3, sub: 6, vel: 0.4 }, { cat: 'robot', bar: 0, step: 0, sub: 0 }] }, CATEGORIES);
    expect(e.removed).toEqual(['snare|0|4|0']);
    expect(e.changed).toEqual({ 'kick|0|0|0': { vel: 127 } });
    expect(e.added).toHaveLength(1);
    expect(e.added[0]!.vel).toBe(1);
    expect(sanitiseEdits(null, CATEGORIES)).toEqual(noEdits());
  });
});

describe('edits reach playback, WAV / stems and MIDI', () => {
  it('the timeline (live playback and TAKEAWAY render the same timeline) follows every kind of edit', () => {
    const base = bakeE(null);
    const bpm = base.recipe.bpm;
    const kick = gen(base, 'kick')[0]!;
    const hat = gen(base, 'hat')[2]!;
    const sn = gen(base, 'snare')[0]!;
    let ed = addHit(noEdits(), base.events, { cat: 'perc', bar: 1, step: 7, sub: 3 }).edits;
    ed = deleteHit(ed, sn.ref!);
    ed = setVelocity(ed, base.events, kick.ref!, 55).edits;
    ed = setTiming(ed, base.events, hat.ref!, 12).edits;
    ed = setSample(ed, base.events, hat.ref!, 'ride-c').edits;
    const b = bakeE(ed);
    const tl = breakTimeline(b);
    const at = (e: BreakEvent) => tl.events.filter((n) => n.type === 'note' && n.voice === e.cat && n.tick === eventTick(e, bpm));
    const perc = b.events.find((e) => e.manual === 'added')!;
    expect(at(perc)).toHaveLength(1);
    expect(tl.events.some((n) => n.type === 'note' && n.voice === 'snare' && n.tick === eventTick(sn, bpm))).toBe(false);
    const k = at(findRef(b.events, kick.ref)!)[0] as { velocity: number };
    expect(k.velocity).toBe(55);
    const h = findRef(b.events, hat.ref)!;
    expect(eventTick(h, bpm)).toBeGreaterThan(eventTick(hat, bpm)); // 12 ms later than generated
    expect((at(h)[0] as { instrument: string }).instrument).toBe('ride-c');
    // stems render the timeline filtered by category: the hand-placed perc is in the PERC stem
    expect(breakTimeline(b, ['perc']).events.some((n) => n.type === 'note' && n.tick === eventTick(perc, bpm))).toBe(true);
    expect(tl.events.length).toBe(base.events.length);
  });

  it('a 64th placed by hand keeps its exact position in the timeline and the MIDI file', () => {
    const base = bakeE(null, recipe({ swing: 0, humanise: 0 }));
    const r = addHit(noEdits(), base.events, { cat: 'snare', bar: 0, step: 14, sub: 3 });
    const b = bakeE(r.edits, recipe({ swing: 0, humanise: 0 }));
    const e = findRef(b.events, r.ref)!;
    // 14 sixteenths + a 64th = 3.5625 quarter notes
    expect(eventTick(e, b.recipe.bpm)).toBe(Math.round(3.5625 * 96000));
    const smf = parseSmf(breakMidi(b).bytes);
    expect(smf.notes.some((n) => n.tick === 3.5625 * 960 && n.note === 38)).toBe(true);
  });
});

// ------------------------------------------------------------------ the App

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
}

function makeApp(): App {
  const k = kit();
  const ingredients = { kit: () => k, loudness: () => ({}), name: (id: string | null) => id ?? '—' };
  const player = { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} };
  const app = new App(ingredients as never, player as never, localStorage.getItem('breakery.state.v1') ? undefined : '4242');
  // a known break (the App starts from a random seed): hats keep time, and there is room to edit

  return app;
}

describe('App: hand editing, undo and redo', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('undoes and redoes add, delete, move, velocity, timing and sample', () => {
    const app = makeApp();
    const before = flat(app.current);
    const k = gen(app.current, 'kick')[0]!;
    const step = freeStep(app.current, 'perc');
    const ref = app.addHit('perc', step * TPS)!;
    expect(app.selected).toBe(ref);
    app.moveHit(ref, step * TPS + 6);
    app.deleteHit(k.ref!);
    const hat = gen(app.current, 'hat')[0]!;
    app.select(hat.ref!);
    app.setHitVelocity(10);
    app.setHitTiming(9);
    app.setHitSample('hat-c');
    const edited = flat(app.current);
    expect(findRef(app.current.events, hat.ref)!.vel).toBe(10);
    for (let i = 0; i < 6; i++) app.undo();
    expect(flat(app.current)).toEqual(before);
    expect(app.canUndo).toBe(false);
    for (let i = 0; i < 6; i++) app.redo();
    expect(flat(app.current)).toEqual(edited);
    expect(app.canRedo).toBe(false);
  });

  it('a dragged number or a dragged hit is one undo step', () => {
    const app = makeApp();
    const hat = gen(app.current, 'hat')[0]!;
    app.select(hat.ref!);
    app.beginGesture();
    for (const v of [90, 80, 70, 60]) app.setHitVelocity(v);
    app.endGesture();
    app.undo();
    expect(findRef(app.current.events, hat.ref)!.vel).toBe(hat.vel);
    const sn = gen(app.current, 'snare')[0]!;
    app.beginGesture();
    app.moveHit(sn.ref!, tickOf(sn) + 3, true);
    app.moveHit(app.selected!, tickOf(sn) + 6, true);
    app.undo();
    expect(findRef(app.current.events, sn.ref)).toBeTruthy();
    expect(app.hasEdits).toBe(false);
  });

  it('a new edit clears the redo list', () => {
    const app = makeApp();
    app.addHit('crash', TPB);
    app.undo();
    expect(app.canRedo).toBe(true);
    app.addHit('crash', TPB + 24);
    expect(app.canRedo).toBe(false);
  });

  it('recipe and length changes keep the edits; hits beyond the length come back', () => {
    const app = makeApp();
    app.setRecipe({ bars: 4 });
    const ref = app.addHit('perc', 3 * TPB + 5 * TPS)!;
    app.setRecipe({ density: 0.95 });
    expect(findRef(app.current.events, ref)).toBeTruthy();
    app.setRecipe({ bars: 2 });
    expect(findRef(app.current.events, ref)).toBeUndefined();
    expect(app.edits.added).toHaveLength(1);
    expect(app.status).toContain('beyond the pattern length');
    app.setRecipe({ bars: 4 });
    expect(findRef(app.current.events, ref)).toBeTruthy();
  });

  it('BAKE starts a new break unedited; the edited one stays in the history with its edits', () => {
    const app = makeApp();
    const edited = (() => {
      app.addHit('crash', 24);
      return flat(app.current);
    })();
    app.bake();
    expect(app.hasEdits).toBe(false);
    expect(app.status).toContain('stay with the previous break');
    expect(app.canUndo).toBe(true);
    app.historyBack();
    expect(app.hasEdits).toBe(true);
    expect(flat(app.current)).toEqual(edited);
  });

  it('FREEZE EDITS carries the edits onto new breaks (BAKE, BATCH, MUTATE, seeds)', () => {
    const app = makeApp();
    app.toggleKeepEdits();
    const ref = app.addHit('crash', 24)!;
    app.bake();
    expect(findRef(app.current.events, ref)).toBeTruthy();
    app.bakeBatch();
    expect(findRef(app.current.events, ref)).toBeTruthy();
    app.pick(3);
    expect(findRef(app.current.events, ref)).toBeTruthy();
    app.mutate();
    expect(findRef(app.current.events, ref)).toBeTruthy();
    app.setSeedText('funky chicken');
    expect(findRef(app.current.events, ref)).toBeTruthy();
  });

  it('favourites keep a break’s edits, and an edited break is a different favourite', () => {
    const app = makeApp();
    app.toggleFavourite();
    expect(app.isFavourite).toBe(true);
    app.addHit('crash', 24);
    expect(app.isFavourite).toBe(false);
    app.toggleFavourite();
    const id = app.favourites[0]!.id;
    app.bake();
    app.loadFavourite(id);
    expect(app.hasEdits).toBe(true);
    expect(app.current.events.some((e) => e.manual === 'added' && e.cat === 'crash')).toBe(true);
  });

  it('edits persist with the state (a reload restores them)', () => {
    const app = makeApp();
    app.addHit('crash', 24);
    app.deleteHit(gen(app.current, 'snare')[0]!.ref!);
    const shown = flat(app.current);
    const again = makeApp();
    expect(again.hasEdits).toBe(true);
    expect(flat(again.current)).toEqual(shown);
  });

  it('nudge moves the selected hit by the SNAP grid and never out of the pattern', () => {
    const app = makeApp();
    const ref = app.addHit('perc', 0)!;
    app.setSnap(6);
    app.nudge(app.snap);
    expect(tickOf(findRef(app.current.events, app.selected)!)).toBe(6);
    app.nudge(-12);
    expect(tickOf(findRef(app.current.events, app.selected)!)).toBe(6);
    expect(app.status).toContain('out of the pattern');
    expect(ref).toBe(app.selected);
  });
});


describe('complete pattern snapshots', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = memoryStorage(); });
  const state = (app: App) => JSON.parse(JSON.stringify({ current: app.current, recipe: app.recipe, seeds: app.seeds, samples: app.samples, edits: app.edits, seedName: app.seedName }));

  it('BAKE, BAKE, MUTATE, undo twice and redo twice restore exact states', () => {
    const app = makeApp();
    app.bake();
    const first = state(app);
    app.bake();
    const second = state(app);
    app.mutate();
    const latest = state(app);
    app.undo(); expect(state(app)).toEqual(second);
    app.undo(); expect(state(app)).toEqual(first);
    app.redo(); expect(state(app)).toEqual(second);
    app.redo(); expect(state(app)).toEqual(latest);
    for (let i = 0; i < 4; i++) {
      app.undo(); expect(state(app)).toEqual(second);
      app.redo(); expect(state(app)).toEqual(latest);
    }
  });

  it('preserves rolls, sample references, manual edits and selected hit without regenerating', () => {
    const app = makeApp();
    app.setStyle('jungle');
    app.setRecipe({ bars: 4, rolls: 1, rollLength: 8, rollPlace: 'anywhere' });
    for (let seed = 13; seed < 100 && !app.current.events.some(e => e.role === 'roll'); seed++) app.setSeed(seed);
    expect(app.current.events.some(e => e.role === 'roll')).toBe(true);
    const e = app.current.events[0]!;
    app.select(e.ref!);
    app.setHitSample('hat-c');
    app.setHitTiming(13);
    const before = state(app);
    const selected = app.selected;
    app.bake();
    // Exact restoration cannot depend on the currently available kit.
    app.ingredients.kit = () => emptyKit();
    app.undo();
    expect(state(app)).toEqual(before);
    expect(app.selected).toBe(selected);
    expect(app.selectedEvent?.pinned).toBe('hat-c');
  });

  it('restores recipe/roll and sample settings, and respects FREEZE EDITS', () => {
    const app = makeApp();
    const before = state(app);
    app.setRecipe({ rolls: 1 });
    app.undo(); expect(state(app)).toEqual(before);
    app.redo();
    const rolled = state(app);
    app.setSampleSettings('hat', { mode: 'roundrobin' });
    app.undo(); expect(state(app)).toEqual(rolled);
    app.addHit('crash', TPB + 3);
    app.toggleKeepEdits();
    const edits = JSON.stringify(app.edits);
    app.bake(); expect(JSON.stringify(app.edits)).toBe(edits);
    app.undo(); expect(app.keepEdits).toBe(true);
    expect(JSON.stringify(app.edits)).toBe(edits);
  });

  it('groups recipe sweeps and ignores empty or net-zero gestures without losing redo', () => {
    const app = makeApp();
    const before = state(app);
    app.beginGesture();
    app.setRecipe({ rolls: 0.2 }); app.setRecipe({ rolls: 0.7 });
    app.endGesture();
    app.undo(); expect(state(app)).toEqual(before);
    app.beginGesture(); app.endGesture();
    app.setRecipe({ ...app.recipe });
    expect(app.canRedo).toBe(true);
    app.beginGesture();
    app.setRecipe({ bpm: app.recipe.bpm + 1 });
    app.setRecipe({ bpm: before.recipe.bpm });
    app.endGesture();
    expect(app.canRedo).toBe(true);
    app.setRecipe({ bpm: app.recipe.bpm + 2 });
    expect(app.canRedo).toBe(false);
  });

  it('bounds history to 50 actions and ignores frozen mutation and unchanged edits', () => {
    const app = makeApp();
    app.toggleRhythm(); app.mutate();
    expect(app.canUndo).toBe(false);
    app.beginGesture(); app.endGesture();
    const e = app.current.events[0]!;
    app.setHitVelocity(e.vel, e.ref);
    expect(app.canUndo).toBe(false);
    for (let i = 0; i < 60; i++) app.setRecipe({ bpm: 100 + i });
    let count = 0;
    while (app.canUndo) { app.undo(); count++; }
    expect(count).toBe(50);
  });

  it('sends exact restored snapshots through the existing playback update method', () => {
    const app = makeApp();
    const updates: Break[] = [];
    app.player.update = b => { updates.push(b); };
    app.player.playing = true;
    const before = state(app);
    app.bake(); app.undo();
    expect(updates.at(-1)).toEqual(before.current);
    app.redo(); expect(updates.at(-1)).toEqual(app.current);
  });
});
