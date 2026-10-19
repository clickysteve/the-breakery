/**
 * Phase 17: hand edits anchored through CHOP, sample painting, the export name order, glitch-free
 * live edits, grid placement on the containing cell, and library samples in any kit.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { bake, seedsFrom } from '../src/engine/generate';
import { applyEdits, baseRef, editCount, hitKey, noEdits, originOf, sanitiseEdits, upgradeEdits, type Edits } from '../src/engine/edits';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, TPB, TPS, type Break, type BreakEvent } from '../src/engine/types';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`];
  return k;
};
const K = kit();
const tick = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const SEEDS = Array.from({ length: 30 }, (_, i) => i * 7919 + 13);
const CHOP = { on: true, amount: 0.8, slice: 'small' as const, retrigger: 0.3, variant: 0 };

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
}
export function makeApp(seed: string | null = '4242', k: KitIndex = K) {
  const ingredients = { kit: () => k, loudness: () => ({}), name: (id: string | null) => id ?? '?', items: Object.values(k).flat().map((id) => ({ id, status: 'ready' })) };
  const player = { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setOutput() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} };
  return new App(ingredients as never, player as never, seed ?? undefined);
}
/** what is heard, hit by hit */
const heard = (b: Break) => JSON.stringify(b.events.map((e) => [hitKey(e), e.vel, e.offsetMs, e.sample, e.pitch ?? 0, !!e.reverse]));
const moved = (b: Break) => b.events.filter((e) => e.src && !e.src.startsWith('~') && !e.manual);
const unique = (b: Break) => new Set(b.events.map(hitKey)).size === b.events.length;

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
});

/** a 4-bar funk app, chopped, with hits CHOP moved */
function choppedApp(): App {
  for (const s of SEEDS) {
    const app = makeApp(String(s));
    app.setRecipe({ bars: 4 });
    app.setChop(CHOP);
    if (moved(app.current).length >= 3) return app;
  }
  throw new Error('no chopped seed');
}

describe('Part A: hand edits anchored through CHOP', () => {
  it('an unchopped pattern keeps plain keys; CHOP copies know their origin', () => {
    const plain = bake({ ...defaultRecipe('funk', 4) }, seedsFrom(4242), K);
    expect(plain.events.every((e) => !e.src && e.ref === hitKey(e))).toBe(true);
    const app = choppedApp();
    for (const e of moved(app.current)) {
      expect(e.ref).toBe(`${hitKey(e)}@${e.src}`);
      expect(e.src).not.toBe(hitKey(e));
      expect(originOf(e)).toBe(e.src);
    }
  });

  it('reproduces the old lock: generate, CHOP, two hand edits, then every CHOP control still works and keeps the edits', () => {
    const app = choppedApp();
    const [a, b2] = moved(app.current);
    app.setHitVelocity(17, a!.ref!);
    app.deleteHit(b2!.ref!);
    expect(editCount(app.edits)).toBe(2);
    for (const patch of [{ amount: 0.5 }, { slice: 'medium' as const }, { retrigger: 0.7 }, { variant: 1 }, { on: false }, { on: true }]) {
      app.setChop(patch);
      expect(app.chop).toMatchObject(patch);
      expect(editCount(app.edits)).toBe(2);
      expect(app.status).not.toMatch(/Undo them|Clear All Hand Edits/i);
    }
    app.reChop();
    expect(editCount(app.edits)).toBe(2);
  });

  it('a deleted hit stays deleted where CHOP moves it, and a different hit on its place plays', () => {
    let checked = 0;
    for (const s of SEEDS.slice(0, 12)) {
      const app = makeApp(String(s));
      app.setRecipe({ bars: 4 });
      app.setChop(CHOP);
      const victim = moved(app.current)[0];
      if (!victim) continue;
      const origin = victim.src!;
      const at = hitKey(victim);
      app.deleteHit(victim.ref!);
      for (let take = 1; take <= 6; take++) {
        app.reChop();
        const plain = bake(app.recipe, app.seeds, K, {}, (id) => id, null).events;
        const inBar = (evs: BreakEvent[]) => evs.filter((e) => e.cat === victim.cat && e.bar === victim.bar && originOf(e) === origin).length;
        // exactly one copy of that hit is gone from its bar (or the edit waits: none there)
        if (inBar(plain)) expect(inBar(app.current.events)).toBe(inBar(plain) - 1);
        else expect(app.current.editReport?.inactive).toBe(1);
        // whatever else CHOP put on the deleted place plays
        const other = plain.find((e) => hitKey(e) === at && originOf(e) !== origin);
        if (other) {
          expect(app.current.events.some((e) => hitKey(e) === at && originOf(e) === originOf(other))).toBe(true);
          checked++;
        }
        expect(unique(app.current)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('velocity, timing, sample, pitch and reverse follow their hit; added hits stay put, once, with their sample', () => {
    const app = choppedApp();
    const target = moved(app.current)[1]!;
    const origin = target.src!;
    const { cat, bar } = target;
    app.setHitVelocity(9, target.ref!);
    app.setHitTiming(-31, target.ref!);
    app.setHitSample(`${cat}-b`, target.ref!);
    app.setHitPitch(5, target.ref!);
    app.setHitReverse(true, target.ref!);
    // a hit added by hand on an empty place, with a sample of its own
    const free = Array.from({ length: 16 }, (_, s) => (bar * 16 + s) * TPS).find((t) => !app.current.events.some((e) => e.cat === 'perc' && tick(e) === t))!;
    const ref = app.addHit('perc', free)!;
    app.setHitSample('perc-b', ref);
    const n = editCount(app.edits);
    for (let take = 0; take < 8; take++) {
      app.reChop();
      const evs = app.current.events;
      const e = evs.find((x) => x.manual === 'edited' && x.cat === cat && x.bar === bar);
      if (e) {
        expect(originOf(e)).toBe(origin);
        expect([e.vel, e.offsetMs, e.pinned, e.pitch, e.reverse]).toEqual([9, -31, `${cat}-b`, 5, true]);
      } else expect(app.current.editReport!.inactive).toBeGreaterThan(0);
      // never applied to a hit of another origin
      expect(evs.filter((x) => x.manual === 'edited').every((x) => originOf(x) === origin)).toBe(true);
      const added = evs.filter((x) => x.cat === 'perc' && tick(x) === free);
      expect(added).toHaveLength(1);
      expect(added[0]!.manual).toBe('added');
      expect(added[0]!.sample).toBe('perc-b');
      expect(editCount(app.edits)).toBe(n);
      expect(unique(app.current)).toBe(true);
    }
  });

  it('a moved hit is not doubled by RE-CHOP, and RATCHET strokes stay where they were made', () => {
    const app = choppedApp();
    const m = moved(app.current)[0]!;
    const free = Array.from({ length: 16 }, (_, s) => (m.bar * TPB + s * TPS)).find((t) => !app.current.events.some((e) => e.cat === m.cat && tick(e) === t))!;
    expect(app.moveHit(m.ref!, free)).toBe(true);
    const r = moved(app.current).find((e) => e.cat === 'hat' || e.cat === 'snare');
    if (r) app.ratchet(3, 24, r.ref!);
    const strokes = app.current.events.filter((e) => e.manual === 'added' && e.role === 'roll').map(hitKey);
    for (let take = 0; take < 6; take++) {
      app.reChop();
      const plain = bake(app.recipe, app.seeds, K, {}, (id) => id, null).events;
      const count = (evs: BreakEvent[]) => evs.filter((e) => e.cat === m.cat && e.bar === m.bar && originOf(e) === m.src && !e.manual).length;
      expect(count(app.current.events)).toBe(Math.max(0, count(plain) - 1));
      expect(app.current.events.filter((e) => e.manual === 'moved' && tick(e) === free)).toHaveLength(1);
      for (const k of strokes) expect(app.current.events.filter((e) => hitKey(e) === k)).toHaveLength(1);
    }
  });

  it('BAKE, ADD HIT, CHOP, MOVE HIT, RE-CHOP, UNDO, UNDO, REDO, REDO is exact', () => {
    const app = makeApp('31337');
    app.setRecipe({ bars: 4 });
    app.bake();
    const steps: string[] = [heard(app.current)];
    app.addHit('perc', 2 * TPS);
    steps.push(heard(app.current));
    app.setChop(CHOP);
    steps.push(heard(app.current));
    const h = app.current.events.find((e) => e.cat === 'kick' && e.bar === 1)!;
    const to = Array.from({ length: 16 }, (_, s) => TPB + s * TPS).find((t) => !app.current.events.some((e) => e.cat === 'kick' && tick(e) === t))!;
    app.moveHit(h.ref!, to);
    steps.push(heard(app.current));
    app.reChop();
    steps.push(heard(app.current));
    app.undo();
    expect(heard(app.current)).toBe(steps[3]);
    app.undo();
    expect(heard(app.current)).toBe(steps[2]);
    app.redo();
    expect(heard(app.current)).toBe(steps[3]);
    app.redo();
    expect(heard(app.current)).toBe(steps[4]);
  });

  it('saves and loads: the anchored layer sanitises unchanged and bakes the same pattern', () => {
    const app = choppedApp();
    const [a, b2] = moved(app.current);
    app.setHitVelocity(33, a!.ref!);
    app.deleteHit(b2!.ref!);
    app.reChop();
    const stored = JSON.parse(JSON.stringify(app.edits)) as unknown;
    const back = sanitiseEdits(stored, CATEGORIES);
    expect(back).toEqual(app.edits);
    expect(back.v).toBe(2);
    expect(heard(bake(app.recipe, app.seeds, K, {}, (id) => id, back))).toBe(heard(bake(app.recipe, app.seeds, K, {}, (id) => id, app.edits)));
    // and through a reload of the saved state
    const reloaded = makeApp(null);
    expect(heard(reloaded.current)).toBe(heard(app.current));
  });

  it('a layer saved before Phase 17 stays positional, and its next edit anchors it without changing a note', () => {
    const app = choppedApp();
    const plain = app.current.events;
    const m = moved({ events: plain } as Break)[0]!;
    // Phase 16 stored plain places, even on a chopped pattern
    const legacy = sanitiseEdits({ removed: [hitKey(m)], changed: { [hitKey(moved({ events: plain } as Break)[1]!)]: { vel: 11 } }, added: [] }, CATEGORIES);
    expect(legacy.v).toBeUndefined();
    const before = bake(app.recipe, app.seeds, K, {}, (id) => id, legacy);
    expect(before.events.some((e) => hitKey(e) === hitKey(m))).toBe(false);
    expect(before.events.find((e) => e.vel === 11 && e.manual === 'edited')).toBeDefined();
    const up = upgradeEdits(legacy, before.editReport);
    expect(up.v).toBe(2);
    expect(up.removed[0]).toBe(baseRef(m));
    expect(heard(bake(app.recipe, app.seeds, K, {}, (id) => id, up))).toBe(heard(before));
  });

  it('pure layer: exact first, then the nearest of the origin in the bar, each hit once; a missing origin waits', () => {
    const ev = (step: number, src?: string): BreakEvent => ({ cat: 'snare', bar: 0, step, sub: 0, level: 1, role: 'backbeat', why: '', vel: 100, swing: 0, offsetMs: 0, sample: null, ...(src ? { src } : {}) });
    const o = 'snare|0|4|0';
    const edits: Edits = { ...noEdits(), removed: [`snare|0|10|0@${o}`, `snare|0|12|0@${o}`], changed: { 'snare|0|14|0@snare|0|9|0': { vel: 5 } } };
    // CHOP now has that snare at 6 and 13, and another hit on 10
    const out = applyEdits([ev(6, o), ev(10, 'snare|1|4|0'), ev(13, o), ev(14)], edits, { swing: 0, bars: 1 });
    expect(out.events.map((e) => e.step)).toEqual([10, 14]);
    expect(out.events.find((e) => e.step === 14)!.vel).toBe(100);
    expect(out.report).toMatchObject({ inactive: 1, followed: 2 });
  });
});

// ---------------------------------------------------------------------------- Part D: live edits

import { vi } from 'vitest';
import { Player, type SwitchMode } from '../src/audio/player';

/** two bars of kicks on every sixteenth at 120 BPM; `tweak` changes one hit */
function kicks(tag: string, tweak: (e: BreakEvent, i: number) => void = () => {}): Break {
  const b = bake({ ...defaultRecipe('funk', 2), bpm: 120 }, seedsFrom(1));
  b.events = Array.from({ length: 32 }, (_, i) => {
    const e: BreakEvent = { cat: 'kick', bar: Math.floor(i / 16), step: i % 16, sub: 0, swing: 0, offsetMs: 0, sample: tag, vel: 100, level: 1, role: 'kick', why: '' };
    tweak(e, i);
    return e;
  });
  return b;
}
function live(mode: SwitchMode, first: Break) {
  const p = new Player({} as never);
  const ctx = { currentTime: 0, outputLatency: 0 };
  const noteOn = vi.fn();
  const stopAll = vi.fn();
  const internal = p as any;
  p.ctx = ctx as AudioContext;
  internal.notes = { noteOn, stopAll };
  const midiHit = vi.fn(() => true);
  p.midi = { routeKey: () => 'dev:10:36', hit: midiHit, flush() {}, releaseAll() {}, clock() {}, settings: { clockOut: false } } as never;
  internal.tempo = 120;
  internal.build(first);
  internal.audible = internal.current;
  p.playing = true;
  p.switchMode = mode;
  const advance = (t: number) => {
    ctx.currentTime = t;
    internal.pump();
  };
  advance(0);
  return { p, internal, ctx, noteOn, stopAll, midiHit, advance };
}
const SIXTEENTH = 0.125;
const times = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => (c[2] as { time: number }).time).sort((a, b) => a - b);

describe('Part D: edits during playback switch on the grid, never twice', () => {
  it('a timing edit inside the look-ahead does not double the hit (early to late)', () => {
    const { p, noteOn, midiHit, advance } = live('immediate', kicks('a', (e, i) => i === 5 && (e.offsetMs = -20)));
    // step 5 (0.625 s, early at 0.605) is handed to Web Audio by 0.5
    for (let t = 0.025; t <= 0.5; t += 0.025) advance(t);
    p.update(kicks('b', (e, i) => i === 5 && (e.offsetMs = 40)));
    for (let t = 0.525; t < 3.9; t += 0.025) advance(t);
    const ts = times(noteOn).filter((t) => t < 4 - 1e-6);
    expect(ts).toHaveLength(32);
    // MIDI: one note-on per hit too (the same schedule)
    expect(midiHit.mock.calls).toHaveLength(noteOn.mock.calls.length);
  });

  it('a hit moved from late to early across the switch is not dropped', () => {
    const { p, noteOn, advance } = live('immediate', kicks('a', (e, i) => i === 7 && (e.offsetMs = 40)));
    for (let t = 0.025; t <= 0.6; t += 0.025) advance(t);
    p.update(kicks('b', (e, i) => i === 7 && (e.offsetMs = -20)));
    for (let t = 0.625; t < 3.9; t += 0.025) advance(t);
    expect(times(noteOn).filter((t) => t < 4 - 1e-6)).toHaveLength(32);
  });

  it('IMMEDIATE is the next sixteenth past the scheduled audio; NEXT BAR and NEXT LOOP are unchanged; voices are never stopped', () => {
    for (const [mode, at] of [['immediate', 0.375], ['bar', 2], ['loop', 4]] as const) {
      const { p, internal, noteOn, stopAll, advance } = live(mode, kicks('a'));
      for (let t = 0.025; t <= 0.2; t += 0.025) advance(t);
      p.update(kicks('b'));
      expect(p.queuedKind).toBe('edit');
      const sw = internal.switchAt as number;
      expect(Math.abs(sw / SIXTEENTH - Math.round(sw / SIXTEENTH))).toBeLessThan(1e-9);
      if (mode === 'immediate') expect(sw).toBeGreaterThan(internal.scheduledUntil - 0.2);
      else expect(sw).toBe(at);
      for (let t = 0.225; t < 4.4; t += 0.025) advance(t);
      const calls = noteOn.mock.calls.map((c) => c[2] as { time: number; instrument: string });
      // before the boundary the old pattern, from it the new, each sixteenth once
      for (const c of calls) expect(c.instrument).toBe(c.time < sw - 1e-9 ? 'a' : 'b');
      expect(new Set(calls.map((c) => Math.round(c.time / SIXTEENTH))).size).toBe(calls.length);
      expect(stopAll).not.toHaveBeenCalled();
      expect(p.playing).toBe(true);
      expect(p.queued).toBe(false);
    }
  });

  it('a pattern switch is SWITCHING, an edit is EDIT QUEUED', () => {
    const { p } = live('bar', kicks('a'));
    p.setBreak(kicks('b'));
    expect(p.queuedKind).toBe('pattern');
    p.update(kicks('c'));
    expect(p.queuedKind).toBe('edit');
  });
});

describe('Part D: a session of live edits through the App', () => {
  it('add, delete, move, sample, RE-CHOP, RE-ROLL, RE-DESTROY, WILDCARD, undo, redo and switch modes: no double triggers, no reset', () => {
    const p = new Player({ instrument: () => null } as never);
    const ctx = { currentTime: 0, outputLatency: 0 };
    const noteOn = vi.fn();
    const stopAll = vi.fn();
    const internal = p as any;
    p.ctx = ctx as AudioContext;
    internal.notes = { noteOn, stopAll };
    const ingredients = { kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '?', items: [], instrument: () => null };
    const app = new App(ingredients as never, p, '777');
    app.setRecipe({ bars: 2, bpm: 120 });
    internal.tempo = 120;
    internal.build(app.current);
    internal.audible = internal.current;
    p.playing = true;
    p.switchMode = 'immediate';
    let t = 0;
    const run = (secs: number) => {
      for (const end = t + secs; t < end; t += 0.025) {
        ctx.currentTime = t;
        internal.pump();
      }
    };
    const starts: number[] = [];
    const step = (fn: () => void) => {
      fn();
      run(0.3);
      starts.push(internal.loopStart);
    };
    run(0.2);
    const free = (cat: BreakEvent['cat']) => Array.from({ length: 32 }, (_, i) => i * TPS).find((x) => !app.current.events.some((e) => e.cat === cat && tick(e) === x))!;
    step(() => app.addHit('perc', free('perc')));
    step(() => app.deleteHit(app.current.events.find((e) => e.cat === 'hat')!.ref!));
    step(() => app.moveHit(app.current.events.find((e) => e.cat === 'kick' && e.bar === 1)!.ref!, free('kick')));
    step(() => app.setHitSample('snare-b', app.current.events.find((e) => e.cat === 'snare')!.ref!));
    step(() => app.setHitTiming(-40, app.current.events.find((e) => e.cat === 'snare')!.ref!));
    step(() => app.setChop(CHOP));
    step(() => app.reChop());
    step(() => app.setRollsOn(true));
    step(() => app.reRoll());
    step(() => app.setDestroy({ on: true }));
    step(() => app.reDestroy());
    step(() => app.wildcard(4242));
    step(() => app.undo());
    step(() => app.redo());
    step(() => (p.switchMode = 'bar'));
    step(() => app.reChop());
    run(2);
    step(() => (p.switchMode = 'loop'));
    step(() => app.undo());
    run(4.5);
    expect(stopAll).not.toHaveBeenCalled();
    expect(p.playing).toBe(true);
    // the transport only ever moves forward
    for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThanOrEqual(starts[i - 1]! - 4);
    // no voice is triggered twice at (nearly) the same moment: no doubled hit, no phasing copy
    const byVoice = new Map<string, number[]>();
    for (const c of noteOn.mock.calls) byVoice.set(c[1] as string, [...(byVoice.get(c[1] as string) ?? []), (c[2] as { time: number }).time]);
    for (const [, ts] of byVoice) {
      ts.sort((a, b) => a - b);
      for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!).toBeGreaterThan(0.004);
    }
    expect(noteOn.mock.calls.length).toBeGreaterThan(50);
  });
});
