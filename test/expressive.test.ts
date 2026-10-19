/**
 * PHASE 12, THE EXPRESSIVE BREAK ENGINE: per-hit pitch and reverse, roll EXPRESSION and RATCHET,
 * DESTROY, the PERSONALITIES (and DILLA), BREAK DNA (AMEN), REGEN TRACK and TOM ACTIVITY's
 * revision 2. Structural checks: identities at 0, explicit settings kept, determinism, bounds,
 * persistence and undo. Whether any of it sounds good is for listening; these tests do not claim it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { entryKey, sanitiseEntry } from '../src/app/seeds';
import { reverseChannels, REVERSE_FADE_IN } from '../src/audio/reverse';
import { breakTimeline, noteInstrument, notePitch, REVERSED, ROOT_PITCH } from '../src/audio/timeline';
import { destroy, defaultDestroy, destroyActive, sanitiseDestroy, DESTROY_STYLES, type DestroySettings } from '../src/engine/destroy';
import { dillaCap, dillaPerform, dillaStrategy, DILLA_STRATEGIES } from '../src/engine/dilla';
import { amenSlots, dnaChopStyle, sanitiseDna } from '../src/engine/dna';
import { CHOP_STYLE } from '../src/engine/chopper';
import { applyEdits, editsKey, findRef, noEdits, ratchetHit, sanitiseEdits, setPitch, setReverse } from '../src/engine/edits';
import { bake, reseed, sanitiseRecipe, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { personaPerform, PERSONALITIES, PERSONA_MAX_MS, sanitisePersonality, type PersonalityId } from '../src/engine/personality';
import { applyRegen, regenSeeds, regenStep, sanitiseRegen } from '../src/engine/regen';
import { makeRng } from '../src/engine/rng';
import { defaultRollExpr, diceExpr, exprActive, expressRolls, expressStrokes, presetExpr, PRESET_SHAPES, RATCHETS, ROLL_PRESETS, sanitiseRollExpr, type RollExpression } from '../src/engine/rollExpr';
import { rollGroups } from '../src/engine/rolls';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, CURRENT_REVISION, isTom, MAX_PITCH, safePitch, STYLES, TPB, TPS, type Bars, type Break, type BreakEvent, type Category, type Recipe, type Seeds, type Style } from '../src/engine/types';
import { breakMidi } from '../src/midi/breakMidi';
import { hasChrome, inChromium } from './chromium';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
const K = kit();
const SEEDS = [13, 4242, 7919, 90001, 123457, 31337];
const tick = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const R = (style: Style, bars: Bars = 4, patch: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, bars), ...patch });
const B = (r: Recipe, seed = 4242, seeds?: Seeds) => bake(r, seeds ?? seedsFrom(seed), K, {}, (id) => id);
const row = (e: BreakEvent) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.sample, e.role, e.pitch ?? 0, !!e.reverse];
const flat = (b: Break | BreakEvent[]) => JSON.stringify((Array.isArray(b) ? b : b.events).map(row));
const only = (b: Break, pred: (e: BreakEvent) => boolean) => JSON.stringify(b.events.filter(pred).map(row).sort());

// ------------------------------------------------------------------ A. per-hit pitch and reverse

describe('per-hit pitch and reverse', () => {
  it('defaults are the root pitch and the forward sample, so old patterns render exactly as before', () => {
    expect(notePitch({})).toBe(ROOT_PITCH);
    expect(noteInstrument('snare-a', {})).toBe('snare-a');
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 3)) {
        const b = B(R(style), seed);
        expect(b.events.some((e) => e.pitch !== undefined || e.reverse !== undefined)).toBe(false);
        expect(breakTimeline(b).events.every((n) => n.type !== 'note' || (n.pitch === ROOT_PITCH && !String(n.instrument).endsWith(REVERSED)))).toBe(true);
      }
  });

  it('the timeline (offline render, WAV, stems) carries pitch as the note pitch and reverse as the reversed instrument', () => {
    const b = B(R('funk', 2));
    b.events[0] = { ...b.events[0]!, pitch: 7 };
    b.events[1] = { ...b.events[1]!, reverse: true, pitch: -12 };
    const notes = breakTimeline(b).events.filter((n) => n.type === 'note') as { pitch: number; instrument: string; tick: number }[];
    const at = (e: BreakEvent) => notes.find((n) => n.instrument.startsWith(e.sample!) && n.pitch !== undefined && Math.abs(n.tick - breakTimeline({ ...b, events: [e] }).events[0]!.tick) < 1)!;
    expect(at(b.events[0]!).pitch).toBe(ROOT_PITCH + 7);
    expect(at(b.events[1]!).instrument).toBe(b.events[1]!.sample + REVERSED);
    expect(at(b.events[1]!).pitch).toBe(ROOT_PITCH - 12);
    // the reversed hit starts where the hit is: same tick as forwards
    expect(breakTimeline({ ...b, events: [b.events[1]!] }).events[0]!.tick).toBe(breakTimeline({ ...b, events: [{ ...b.events[1]!, reverse: undefined }] }).events[0]!.tick);
  });

  it('pitch is clamped to ±24 semitones', () => {
    expect(MAX_PITCH).toBe(24);
    expect(safePitch(40)).toBe(24);
    expect(safePitch(-99)).toBe(-24);
    expect(safePitch(3.6)).toBe(4);
    expect(safePitch('x')).toBe(0);
  });

  it('a reversed sample: the silent tail trimmed, played backwards, a short fade-in where the tail was cut', () => {
    const sr = 1000;
    const len = 400;
    const ch = new Float32Array(len);
    for (let i = 0; i < 300; i++) ch[i] = 1 - i / 300; // a decaying hit, then 100 samples of silence
    const [r] = reverseChannels([ch], sr);
    expect(r!.length).toBeLessThan(len);
    expect(r!.length).toBeGreaterThan(280);
    // the end of the reversed copy is the attack
    expect(r![r!.length - 1]).toBeCloseTo(1, 6);
    // the fade: the first sample is quiet, the end of the fade is at full gain
    const fade = Math.round(sr * REVERSE_FADE_IN);
    expect(Math.abs(r![0]!)).toBeLessThan(Math.abs(ch[r!.length - 1]!) + 1e-6);
    expect(r![fade + 5]).toBeCloseTo(ch[r!.length - 1 - fade - 5]!, 6);
    // the original is untouched
    expect(ch[0]).toBe(1);
    // silence stays a valid (one-sample) buffer
    expect(reverseChannels([new Float32Array(10)], sr)[0]!.length).toBe(10);
  });

  it('MIDI keeps its GM notes and ignores pitch and reverse (no pitch bend)', () => {
    const b = B(R('funk', 2));
    const plain = breakMidi(b).bytes;
    const expressed = { ...b, events: b.events.map((e, i) => ({ ...e, ...(i % 2 ? { pitch: 12 } : { reverse: true as const }) })) };
    expect(Buffer.from(breakMidi(expressed).bytes).equals(Buffer.from(plain))).toBe(true);
    expect(Buffer.from(plain).includes(0xe0)).toBe(false);
  });

  it('hand edits set pitch and reverse, persist through sanitising, and leave old fingerprints unchanged', () => {
    const b = B(R('funk', 2));
    const e = b.events.find((x) => x.cat === 'snare')!;
    let ed = setPitch(noEdits(), b.events, e.ref!, 30).edits;
    ed = setReverse(ed, b.events, e.ref!, true).edits;
    const out = applyEdits(b.events, ed, b.recipe).events;
    const hit = out.find((x) => x.cat === e.cat && tick(x) === tick(e))!;
    expect(hit.pitch).toBe(24);
    expect(hit.reverse).toBe(true);
    const back = sanitiseEdits(JSON.parse(JSON.stringify(ed)), CATEGORIES);
    expect(back).toEqual(ed);
    // pitch 0 and forward overrides survive too
    const zero = setReverse(setPitch(ed, out, e.ref!, 0).edits, out, e.ref!, false).edits;
    const out0 = applyEdits(b.events, zero, b.recipe).events.find((x) => x.cat === e.cat && tick(x) === tick(e))!;
    expect(out0.pitch ?? 0).toBe(0);
    expect(out0.reverse).toBeFalsy();
    // a plain velocity edit fingerprints exactly as before Phase 12 (no expression fields in it)
    const plain = { removed: [], changed: { [e.ref!]: { vel: 90 } }, added: [{ id: 'm1', cat: 'kick' as Category, bar: 0, step: 3, sub: 0, vel: 100, offsetMs: 0 }] };
    expect(editsKey(plain)).toBe(JSON.stringify([[], [[e.ref!, { vel: 90 }]], [['kick', 0, 3, 0, 100, 0, '']]]));
  });
});

// ------------------------------------------------------------------ B. roll expression and ratchet

describe('roll EXPRESSION', () => {
  it('CLASSIC (and an absent setting) is the break exactly; it is not even stored', () => {
    expect(exprActive(defaultRollExpr())).toBe(false);
    expect(sanitiseRollExpr(defaultRollExpr())).toBeUndefined();
    for (const style of STYLES) {
      const r = R(style, 4, { rolls: 0.8 });
      expect(flat(B({ ...r, rollExpr: presetExpr('classic') }))).toBe(flat(B(r)));
    }
  });

  it('every preset changes only the rolls: every other hit stays exactly as it was', () => {
    const notRoll = (e: BreakEvent) => e.role !== 'roll';
    let changed = 0;
    for (const style of ['funk', 'jungle', 'breakcore', 'dnb'] as Style[])
      for (const seed of SEEDS.slice(0, 3)) {
        const r = R(style, 4, { rolls: 0.8 });
        const base = B(r, seed);
        for (const p of ROLL_PRESETS) {
          const x = B({ ...r, rollExpr: presetExpr(p) }, seed);
          expect(only(x, notRoll)).toBe(only(base, notRoll));
          if (only(x, (e) => e.role === 'roll') !== only(base, (e) => e.role === 'roll')) changed++;
        }
      }
    expect(changed).toBeGreaterThan(30);
  });

  it('the 12 presets exist and are distinct', () => {
    expect(ROLL_PRESETS).toHaveLength(12);
    expect(new Set(ROLL_PRESETS.map((p) => JSON.stringify(PRESET_SHAPES[p]))).size).toBe(12);
  });

  it('ratchets of 2..16: that many strokes, on distinct ticks inside the span, never louder than the roll’s peak', () => {
    for (const n of RATCHETS.filter((x) => x > 0))
      for (const vel of ['keep', 'flat', 'fadein', 'fadeout', 'swell', 'accent', 'random'] as const)
        for (const timing of ['even', 'accelerate', 'decelerate', 'swing', 'chaotic'] as const) {
          const s = expressStrokes(48, [100, 80, 90, 70], { ...PRESET_SHAPES.classic, ratchet: n, vel, timing }, makeRng(n * 31 + vel.length), 1.2);
          expect(s).toHaveLength(n);
          const ticks = s.map((x) => x.tick);
          expect(new Set(ticks).size).toBe(n);
          expect(ticks.every((t, i) => t >= 0 && t < 48 && (i === 0 || t > ticks[i - 1]!))).toBe(true);
          expect(s.every((x) => x.vel >= 1 && x.vel <= 100)).toBe(true);
        }
  });

  it('pitch contours: RISE climbs, FALL falls, PING-PONG alternates, STAIRCASE steps, all within ±24', () => {
    const shape = (pitch: RollExpression['pitch'], from: number, to: number) => expressStrokes(48, [100], { ...PRESET_SHAPES.classic, ratchet: 8, pitch, from, to }, makeRng(1), 1).map((s) => s.pitch);
    const rise = shape('rise', 0, 12);
    expect(rise[0]).toBe(0);
    expect(rise[7]).toBe(12);
    expect(rise.every((p, i) => i === 0 || p >= rise[i - 1]!)).toBe(true);
    const fall = shape('fall', 0, -12);
    expect(fall[0]).toBe(0);
    expect(fall[7]).toBe(-12);
    expect(fall.every((p, i) => i === 0 || p <= fall[i - 1]!)).toBe(true);
    expect(shape('pingpong', 0, 7)).toEqual([0, 7, 0, 7, 0, 7, 0, 7]);
    const stairs = shape('stairs', 0, 12);
    expect(new Set(stairs).size).toBe(4);
    const ud = shape('updown', 0, 12);
    expect(Math.max(...ud)).toBeGreaterThan(ud[0]!);
    expect(ud[7]).toBeLessThan(Math.max(...ud));
    for (const p of shape('random', -24, 24)) expect(Math.abs(p)).toBeLessThanOrEqual(24);
  });

  it('timing contours: ACCELERATE closes the gaps, DECELERATE opens them', () => {
    const gaps = (timing: RollExpression['timing']) => {
      const t = expressStrokes(96, [100], { ...PRESET_SHAPES.classic, ratchet: 6, timing }, makeRng(2), 1).map((s) => s.tick);
      return t.slice(1).map((x, i) => x - t[i]!);
    };
    const acc = gaps('accelerate');
    const dec = gaps('decelerate');
    expect(acc[0]!).toBeGreaterThan(acc[acc.length - 1]!);
    expect(dec[0]!).toBeLessThan(dec[dec.length - 1]!);
    expect(new Set(gaps('even')).size).toBeLessThanOrEqual(2);
  });

  it('velocity contours and reverse modes', () => {
    const s = (patch: Partial<RollExpression>) => expressStrokes(48, [100], { ...PRESET_SHAPES.classic, ratchet: 6, ...patch }, makeRng(3), 1);
    const fin = s({ vel: 'fadein' }).map((x) => x.vel);
    expect(fin[0]!).toBeLessThan(fin[5]!);
    const fout = s({ vel: 'fadeout' }).map((x) => x.vel);
    expect(fout[0]!).toBeGreaterThan(fout[5]!);
    const sw = s({ vel: 'swell' }).map((x) => x.vel);
    expect(Math.max(...sw)).toBeGreaterThan(sw[0]!);
    expect(s({ reverse: 'all' }).every((x) => x.reverse)).toBe(true);
    expect(s({ reverse: 'alternate' }).map((x) => x.reverse)).toEqual([false, true, false, true, false, true]);
    expect(s({ reverse: 'last' }).map((x) => x.reverse)).toEqual([false, false, false, false, false, true]);
    expect(s({ reverse: 'off' }).some((x) => x.reverse)).toBe(false);
  });

  it('DICE is deterministic, varied and always a valid expression', () => {
    expect(diceExpr(77)).toEqual(diceExpr(77));
    const takes = Array.from({ length: 40 }, (_, i) => diceExpr(i * 1013 + 1));
    expect(new Set(takes.map((t) => JSON.stringify({ ...t, variant: 0 }))).size).toBeGreaterThan(30);
    for (const t of takes) expect(sanitiseRollExpr(t)).toEqual(t);
    const r = R('jungle', 4, { rolls: 0.8, rollExpr: diceExpr(5) });
    expect(flat(B(r))).toBe(flat(B(r)));
  });

  it('expression reshapes rolls whole, and a reversed or pitched stroke stays on the drum it was', () => {
    const b = B(R('jungle', 4, { rolls: 1 }), 4242);
    const groups = rollGroups(b.events).length;
    expect(groups).toBeGreaterThan(0);
    const x = expressRolls(b.events, presetExpr('reverseburst'), b.seeds.feel, b.recipe.bpm);
    expect(x.rolls).toBe(groups);
    expect(x.events.filter((e) => e.role === 'roll').every((e) => e.reverse)).toBe(true);
    // a roll never doubles a hit of its drum
    const keys = x.events.map((e) => `${e.cat}|${tick(e)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ROLL GENERATION off: no preset (not even STUTTER or a ratchet count) brings rolls back', () => {
    for (const style of STYLES)
      for (const p of ROLL_PRESETS) {
        const b = B(R(style, 4, { rolls: 1, rollsOn: false, rollExpr: presetExpr(p), chop: { on: true, amount: 0.8, slice: 'small', retrigger: 1, variant: 0 } }), 4242);
        expect(b.events.filter((e) => e.role === 'roll')).toHaveLength(0);
      }
  });
});

describe('RATCHET (a hand edit)', () => {
  it('splits the hit into n strokes over the span, one undoable edit, and the strokes are roll hits', () => {
    const b = B(R('funk', 2, { rolls: 0 }));
    const e = b.events.find((x) => x.cat === 'snare' && x.bar === 0)!;
    for (const n of [2, 3, 4, 6, 8]) {
      const r = ratchetHit(noEdits(), b.events, e.ref!, n, 48, PRESET_SHAPES.dive, b.recipe.bpm, b.recipe.bars);
      expect(r.ref).not.toBeNull();
      const out = applyEdits(b.events, r.edits, b.recipe).events;
      const strokes = out.filter((x) => x.cat === e.cat && x.role === 'roll' && tick(x) >= tick(e) && tick(x) < tick(e) + 48);
      expect(strokes.length).toBeGreaterThanOrEqual(n - 1);
      expect(strokes.length).toBeLessThanOrEqual(n);
      expect(strokes.some((s) => (s.pitch ?? 0) < 0)).toBe(true); // DIVE falls
      expect(r.edits.added.every((m) => m.ratchet && m.role === 'roll')).toBe(true);
    }
    expect(ratchetHit(noEdits(), b.events, e.ref!, 1, 48, PRESET_SHAPES.classic, 120, 2).ref).toBeNull();
  });
});

// ------------------------------------------------------------------ H. DESTROY

describe('DESTROY', () => {
  const ctx = (b: Break, noRolls = false) => ({ plan: b.plan, seed: b.seeds.beat, bpm: b.recipe.bpm, noRolls });
  const on = (d: Partial<DestroySettings> = {}): DestroySettings => ({ ...defaultDestroy(), on: true, amount: 0.5, ...d });

  it('off, or AMOUNT 0, changes nothing', () => {
    for (const style of STYLES) {
      const r = R(style);
      const base = flat(B(r));
      expect(flat(B({ ...r, destroy: on({ amount: 0 }) }))).toBe(base);
      expect(flat(B({ ...r, destroy: { ...on({ amount: 0.9 }), on: false } }))).toBe(base);
    }
    expect(destroyActive(on({ amount: 0 }))).toBe(false);
  });

  it('more AMOUNT destroys more beats (the same ones first), and the first beat is never touched', () => {
    for (const style of DESTROY_STYLES)
      for (const seed of SEEDS) {
        const b = B(R('funk', 4), seed);
        let last = 0;
        const firstBeat = (evs: BreakEvent[]) => JSON.stringify(evs.filter((e) => tick(e) < 4 * TPS).map(row).sort());
        for (const amount of [0.1, 0.3, 0.5, 0.7, 1]) {
          const d = destroy(b.events, on({ amount, style }), ctx(b));
          expect(d.report.edited).toBeGreaterThanOrEqual(last);
          last = d.report.edited;
          expect(firstBeat(d.events)).toBe(firstBeat(b.events));
          for (const e of d.events) expect(Math.abs(e.pitch ?? 0)).toBeLessThanOrEqual(MAX_PITCH);
        }
        expect(last).toBeGreaterThan(0);
      }
  });

  it('does not compound: the same settings twice, or reached by another path, give the same break', () => {
    const r = R('jungle');
    const a = flat(B({ ...r, destroy: on({ amount: 0.6, style: 'chaos' }) }));
    expect(flat(B({ ...r, destroy: on({ amount: 0.6, style: 'chaos' }) }))).toBe(a);
    const app = makeApp().app;
    app.setDestroy({ on: true, amount: 0.3, style: 'chaos' });
    app.setDestroy({ amount: 0.9 });
    app.setDestroy({ amount: 0.6 });
    const direct = makeApp().app;
    direct.setDestroy({ on: true, amount: 0.6, style: 'chaos' });
    expect(flat(app.current)).toBe(flat(direct.current));
  });

  it('every operation appears, and with ROLL GENERATION off a stutter repeats sixteenths (no new rolls)', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS)
      for (const s of DESTROY_STYLES) {
        const b = B(R('funk', 4), seed);
        const d = destroy(b.events, on({ amount: 1, style: s }), ctx(b, true));
        for (const k of Object.keys(d.report.ops)) seen.add(k);
        expect(d.events.filter((e) => e.role === 'roll').length).toBeLessThanOrEqual(b.events.filter((e) => e.role === 'roll').length);
      }
    expect([...seen].sort()).toEqual(['dive', 'freeze', 'gate', 'reverse', 'rise', 'skip', 'stutter', 'tapestop']);
  });

  it('DICE gives another take; sanitising keeps the settings', () => {
    const b = B(R('funk', 4));
    const a = destroy(b.events, on({ amount: 0.7, style: 'chaos' }), ctx(b));
    const c = destroy(b.events, on({ amount: 0.7, style: 'chaos', variant: 99 }), ctx(b));
    expect(flat(a.events)).not.toBe(flat(c.events));
    expect(sanitiseDestroy(JSON.parse(JSON.stringify(on({ variant: 5 }))))).toEqual(on({ variant: 5 }));
    expect(sanitiseDestroy({ on: true, amount: 7, style: 'nope' })).toEqual({ on: true, amount: 1, style: 'stutter', variant: 0 });
  });
});

// ------------------------------------------------------------------ C. personalities

describe('PERSONALITIES', () => {
  it('17 of them; NEUTRAL, or INTENSITY 0, is the recipe exactly', () => {
    expect(PERSONALITIES).toHaveLength(17);
    for (const style of STYLES) {
      const r = R(style);
      const base = flat(B(r));
      expect(flat(B({ ...r, personality: { id: 'neutral', amount: 1 } }))).toBe(base);
      for (const id of PERSONALITIES) expect(flat(B({ ...r, personality: { id, amount: 0 } }))).toBe(base);
    }
  });

  it('every personality changes the break at full intensity, deterministically', () => {
    for (const id of PERSONALITIES.filter((p) => p !== 'neutral')) {
      const r = R('funk', 4, { personality: { id, amount: 1 } });
      const diff = SEEDS.filter((s) => flat(B(r, s)) !== flat(B(R('funk', 4), s))).length;
      expect(diff, id).toBeGreaterThan(SEEDS.length / 2);
      expect(flat(B(r))).toBe(flat(B(r)));
    }
  });

  it('explicit settings keep their meaning: TOMS 0 adds no toms, ROLLS off adds no rolls, a sparse DENSITY stays sparse', () => {
    for (const id of PERSONALITIES)
      for (const style of ['funk', 'jungle', 'breakcore', 'hiphop'] as Style[])
        for (const seed of SEEDS.slice(0, 3)) {
          const b = B(R(style, 4, { toms: 0, rollsOn: false, personality: { id, amount: 1 } }), seed);
          expect(b.events.filter((e) => isTom(e.cat)), `${id} ${style}`).toHaveLength(0);
          expect(b.events.filter((e) => e.role === 'roll'), `${id} ${style}`).toHaveLength(0);
        }
    const mean = (r: Recipe) => SEEDS.reduce((s, x) => s + B(r, x).events.length, 0) / SEEDS.length;
    // (JUNGLE and HIP-HOP barely change with DENSITY, so the bound is against the sparse recipe itself)
    for (const style of ['funk', 'jungle', 'hiphop', 'dnb', 'breakcore'] as Style[]) {
      const sparse = R(style, 4, { density: 0.2, rollsOn: false });
      const normal = mean(R(style, 4, { rollsOn: false }));
      const own = mean(sparse);
      for (const id of PERSONALITIES) {
        const m = mean({ ...sparse, personality: { id, amount: 1 } });
        expect(m, `${id} ${style}`).toBeLessThanOrEqual(own * 1.2);
        if (normal > own * 1.25) expect(m, `${id} ${style}`).toBeLessThan(normal);
      }
    }
  });

  it('offsets stay within ±40 ms and the loop’s first hit is never early', () => {
    for (const id of PERSONALITIES)
      for (const seed of SEEDS.slice(0, 3)) {
        const b = B(R('funk', 4, { personality: { id, amount: 1 } }), seed);
        for (const e of b.events) expect(Math.abs(e.offsetMs), id).toBeLessThanOrEqual(PERSONA_MAX_MS);
        for (const e of b.events.filter((x) => tick(x) === 0)) expect(e.offsetMs).toBeGreaterThanOrEqual(0);
      }
  });

  it('carried through setStyle, persisted, and sanitised', () => {
    expect(sanitisePersonality({ id: 'angry', amount: 3 })).toEqual({ id: 'angry', amount: 1 });
    expect(sanitisePersonality({ id: 'grumpy', amount: 1 })).toBeUndefined();
    const { app } = makeApp();
    app.setPersonality({ id: 'lazy', amount: 0.8 });
    app.setStyle('hiphop');
    expect(app.recipe.personality).toEqual({ id: 'lazy', amount: 0.8 });
  });
});

// ------------------------------------------------------------------ D. DILLA

describe('DILLA', () => {
  const ev = (cat: Category, bar: number, step: number): BreakEvent => ({ cat, bar, step, sub: 0, level: 1, role: cat === 'snare' ? 'backbeat' : 'time', why: '', vel: 100, swing: 0, offsetMs: 0, sample: null });
  const grid = () => [0, 1, 2, 3].flatMap((bar) => [ev('kick', bar, 0), ev('kick', bar, 10), ev('snare', bar, 4), ev('snare', bar, 12), ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => ev('hat', bar, s))]);
  const ctx = (feelSeed: number) => ({ plan: ['A', 'A', 'A', 'A'] as const, feelSeed, swing: 0.1 });

  it('INTENSITY 0 is the baseline exactly', () => {
    const e = grid();
    expect(dillaPerform(e, 0, { ...ctx(5), plan: [...ctx(5).plan] })).toBe(e);
    const r = R('hiphop');
    expect(flat(B({ ...r, personality: { id: 'dilla', amount: 0 } }))).toBe(flat(B(r)));
  });

  it('kick, snare and hats each in their own time, within the intensity’s cap, repeating every two bars', () => {
    for (let s = 0; s < 40; s++) {
      for (const a of [0.3, 0.7, 1]) {
        const out = dillaPerform(grid(), a, { ...ctx(s), plan: ['A', 'A', 'A', 'A'] });
        for (const e of out) expect(Math.abs(e.offsetMs)).toBeLessThanOrEqual(dillaCap(a) + 1e-9);
        for (const e of out.filter((x) => tick(x) === 0)) expect(e.offsetMs).toBeGreaterThanOrEqual(0);
        // the two-bar table repeats (the snare and hats; the kick breathes in the fourth bar)
        const at = (cat: Category, bar: number, step: number) => out.find((x) => x.cat === cat && x.bar === bar && x.step === step)!;
        expect(at('snare', 2, 4).offsetMs).toBe(at('snare', 0, 4).offsetMs);
        expect(at('hat', 3, 6).offsetMs).toBe(at('hat', 1, 6).offsetMs);
        expect(at('hat', 3, 6).swing).toBe(at('hat', 1, 6).swing);
      }
      const out = dillaPerform(grid(), 1, { ...ctx(s), plan: ['A', 'A', 'A', 'A'] });
      const mean = (cat: Category) => out.filter((x) => x.cat === cat).reduce((m, x) => m + x.offsetMs, 0) / out.filter((x) => x.cat === cat).length;
      // asymmetric: the voices do not share one lean
      expect(new Set([Math.round(mean('kick')), Math.round(mean('snare')), Math.round(mean('hat'))]).size).toBeGreaterThan(1);
    }
    const strategies = new Set(Array.from({ length: 60 }, (_, i) => dillaStrategy(i * 7 + 1)));
    expect(strategies.size).toBe(DILLA_STRATEGIES.length);
  });

  it('never offsets twice: the personality pass leaves DILLA’s timing to DILLA', () => {
    const b = B(R('hiphop', 4), 4242);
    const p = { id: 'dilla' as PersonalityId, amount: 0.7 };
    const c = { plan: b.plan, feelSeed: b.seeds.feel, bpm: b.recipe.bpm, swing: b.recipe.swing };
    const both = personaPerform(b.events, p, c);
    const timingOnly = dillaPerform(b.events, 0.7, c);
    expect(both.map((e) => [e.offsetMs, e.swing])).toEqual(timingOnly.map((e) => [e.offsetMs, e.swing]));
  });
});

// ------------------------------------------------------------------ E. BREAK DNA

describe('BREAK DNA: AMEN', () => {
  it('NONE, or INFLUENCE 0, is the recipe exactly', () => {
    for (const style of STYLES) {
      const r = R(style);
      expect(flat(B({ ...r, dna: { id: 'amen', amount: 0 } }))).toBe(flat(B(r)));
    }
    expect(sanitiseDna({ id: 'think', amount: 1 })).toBeUndefined();
    expect(sanitiseDna({ id: 'amen', amount: 2 })).toEqual({ id: 'amen', amount: 1 });
  });

  it('A A A′ B: the four-bar unit, a short loop still ending on its B', () => {
    expect(amenSlots(['A', 'A2', 'B', 'T'])).toEqual(['A', 'A', 'G', 'B']);
    expect(amenSlots(['A', 'T'])).toEqual(['A', 'B']);
    expect(amenSlots(['A'])).toEqual(['A']);
    expect(amenSlots(['A', 'A', 'A', 'B', 'A', 'A', 'A', 'T'])).toEqual(['A', 'A', 'G', 'B', 'A', 'A', 'G', 'B']);
  });

  it('at full influence the vocabulary is there: the kick pair on 3 and the syncopated snares in the A bars', () => {
    for (const style of ['funk', 'hiphop', 'dnb', 'breakcore'] as Style[])
      for (const seed of SEEDS) {
        const b = B(R(style, 4, { dna: { id: 'amen', amount: 1 }, rollsOn: false }), seed);
        const has = (cat: Category, bar: number, step: number) => b.events.some((e) => e.cat === cat && e.bar === bar && e.step === step);
        expect(has('kick', 0, 10) && has('kick', 0, 11), `${style} ${seed}`).toBe(true);
        expect(has('snare', 0, 7) || has('snare', 0, 9), `${style} ${seed}`).toBe(true);
        expect(b.events.some((e) => e.why.includes('AMEN DNA'))).toBe(true);
      }
  });

  it('never adds toms or rolls: TOMS 0 and ROLL GENERATION off keep their meaning', () => {
    for (const style of STYLES)
      for (const amount of [0.3, 0.7, 1]) {
        const b = B(R(style, 4, { toms: 0, rollsOn: false, dna: { id: 'amen', amount } }), 4242);
        expect(b.events.filter((e) => isTom(e.cat))).toHaveLength(0);
        expect(b.events.filter((e) => e.role === 'roll')).toHaveLength(0);
      }
  });

  it('HALFTIME keeps its backbeat on 3', () => {
    for (const seed of SEEDS) {
      const plain = B(R('halftime', 4, { rollsOn: false }), seed);
      const amen = B(R('halftime', 4, { rollsOn: false, dna: { id: 'amen', amount: 1 } }), seed);
      const bb = (b: Break) => b.events.filter((e) => e.cat === 'snare' && e.step === 8 && e.sub === 0 && e.role === 'backbeat').map((e) => e.bar);
      expect(bb(amen)).toEqual(bb(plain));
    }
  });

  it('deterministic; different seeds build related, not identical, Amens', () => {
    const r = R('funk', 4, { dna: { id: 'amen', amount: 0.8 } });
    expect(flat(B(r, 5))).toBe(flat(B(r, 5)));
    expect(new Set(SEEDS.map((s) => flat(B(r, s)))).size).toBe(SEEDS.length);
  });

  it('with CHOP it leans the chop towards snare-led edits, and its retriggers grow only with ROLL GENERATION on', () => {
    const cs = CHOP_STYLE.jungle;
    const off = dnaChopStyle(cs, { id: 'amen', amount: 1 }, false);
    const on = dnaChopStyle(cs, { id: 'amen', amount: 1 }, true);
    expect(off.snareLed).toBeGreaterThan(cs.snareLed);
    expect(off.retrigger).toBe(cs.retrigger);
    expect(on.retrigger).toBeGreaterThan(cs.retrigger);
    expect(dnaChopStyle(cs, undefined, true)).toBe(cs);
  });
});

// ------------------------------------------------------------------ F. REGEN TRACK

describe('REGEN TRACK', () => {
  const withRegen = (seed: number, cats: Category[], n?: Seeds['regen']): Seeds => ({ ...seedsFrom(seed), regen: n ?? regenStep(undefined, cats) });

  it('only the selected tracks change; every other track stays byte-identical', () => {
    const cases: Partial<Recipe>[] = [{}, { personality: { id: 'frantic', amount: 0.9 } }, { personality: { id: 'dilla', amount: 0.8 } }, { chop: { on: true, amount: 0.6, slice: 'medium', retrigger: 0.4, variant: 0 } }, { destroy: { on: true, amount: 0.5, style: 'chaos', variant: 0 } }, { dna: { id: 'amen', amount: 0.7 }, rolls: 0.8 }];
    let changed = 0;
    for (const style of ['funk', 'jungle', 'hiphop', 'breakcore'] as Style[])
      for (const patch of cases)
        for (const cats of [['kick'], ['hat'], ['snare', 'ghost'], ['htom', 'mtom', 'ltom']] as Category[][])
          for (const seed of SEEDS.slice(0, 2)) {
            const r = R(style, 4, patch);
            const base = B(r, seed);
            const re = B(r, seed, withRegen(seed, cats));
            const other = (e: BreakEvent) => !cats.includes(e.cat);
            expect(only(re, other), `${style} ${JSON.stringify(patch)} ${cats}`).toBe(only(base, other));
            if (only(re, (e) => cats.includes(e.cat)) !== only(base, (e) => cats.includes(e.cat))) changed++;
          }
    expect(changed).toBeGreaterThan(120);
  });

  it('a regenerated track is new: not the same hits again, and deterministic', () => {
    for (const style of STYLES)
      for (const cat of ['kick', 'snare', 'hat'] as Category[]) {
        const r = R(style);
        const s = withRegen(4242, [cat]);
        const a = B(r, 4242, s);
        expect(flat(a)).toBe(flat(B(r, 4242, s)));
        const base = B(r);
        if (base.events.some((e) => e.cat === cat)) expect(only(a, (e) => e.cat === cat), `${style} ${cat}`).not.toBe(only(base, (e) => e.cat === cat));
      }
  });

  it('keeps the groove’s anchors: the downbeat kick and the backbeats', () => {
    for (const seed of SEEDS) {
      const a = B(R('funk'), seed, withRegen(seed, ['kick']));
      expect(a.events.some((e) => e.cat === 'kick' && tick(e) === 0)).toBe(true);
      const s = B(R('funk'), seed, withRegen(seed, ['snare']));
      expect(s.events.filter((e) => e.cat === 'snare' && e.role === 'backbeat').length).toBeGreaterThan(0);
    }
  });

  it('lineage: a later step on the same tracks replaces the earlier; steps on other tracks stack', () => {
    const a = regenStep(undefined, ['kick']);
    const b = regenStep(a, ['kick']);
    expect(b).toEqual([{ cats: ['kick'], n: 2 }]);
    const c = regenStep(b, ['hat']);
    expect(c).toEqual([{ cats: ['kick'], n: 2 }, { cats: ['hat'], n: 3 }]);
    expect(regenStep(c, ['kick', 'hat'])).toEqual([{ cats: ['kick', 'hat'], n: 4 }]);
    expect(sanitiseRegen([{ cats: ['kick', 'nope'], n: 'x' }, { cats: [] }, 5])).toEqual([{ cats: ['kick'], n: 1 }]);
    expect(sanitiseRegen('x')).toBeUndefined();
    // candidates keep the break's feel and kit
    const s = regenSeeds(seedsFrom(9), { cats: ['kick'], n: 1 }, 0);
    expect([s.feel, s.kit]).toEqual([9, 9]);
    expect(s.beat).not.toBe(9);
  });

  it('belongs to the beat it was made on: kept when BEAT and DETAIL are frozen, dropped otherwise', () => {
    const s = withRegen(3, ['kick']);
    expect(reseed(s, { beat: true, detail: true }, 99).regen).toEqual(s.regen);
    expect(reseed(s, { beat: true }, 99).regen).toBeUndefined();
    expect(reseed(s, {}, 99).regen).toBeUndefined();
  });

  it('applyRegen with no lineage is the identity', () => {
    const b = B(R('funk'));
    expect(applyRegen(b.events, b.seeds, b.plan, () => []).events).toBe(b.events);
  });
});

// ------------------------------------------------------------------ G. TOM ACTIVITY, revision 2

describe('TOM ACTIVITY (revision 2)', () => {
  const recipes: Style[] = ['hiphop', 'broken', 'funk', 'jungle', 'dnb', 'breakcore'];
  const toms = (r: Recipe) => SEEDS.reduce((s, x) => s + B(r, x).events.filter((e) => isTom(e.cat)).length, 0) / SEEDS.length;

  it('is the current revision for new recipes', () => {
    expect(CURRENT_REVISION).toBe(2);
    expect(defaultRecipe('funk').revision).toBe(2);
  });

  it('0 % has no toms; more activity means more toms; never in the first beat of the loop', () => {
    for (const style of recipes) {
      let last = -1;
      for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const r = R(style, 4, { toms: t, rolls: 0, rollsOn: false });
        const m = toms(r);
        if (t === 0) expect(m).toBe(0);
        expect(m, `${style} ${t}`).toBeGreaterThanOrEqual(last);
        last = m;
        for (const s of SEEDS) expect(B(r, s).events.filter((e) => isTom(e.cat) && tick(e) < 4 * TPS)).toHaveLength(0);
      }
      expect(last, style).toBeGreaterThan(8);
    }
  });

  it('revision 1 recipes still bake as revision 1 made them', () => {
    const r1 = R('funk', 4, { toms: 0.8, revision: 1, rolls: 0 });
    const r2 = R('funk', 4, { toms: 0.8, revision: 2, rolls: 0 });
    expect(SEEDS.some((s) => flat(B(r1, s)) !== flat(B(r2, s)))).toBe(true);
    expect(sanitiseRecipe(r1).revision).toBe(1);
  });
});

// ------------------------------------------------------------------ J. state and compatibility

describe('state and compatibility', () => {
  it('a recipe saved before Phase 12 sanitises without any new field, and bakes the same', () => {
    for (const style of STYLES) {
      const old = JSON.parse(JSON.stringify(R(style))) as Recipe;
      const s = sanitiseRecipe(old);
      expect(s.rollExpr).toBeUndefined();
      expect(s.personality).toBeUndefined();
      expect(s.dna).toBeUndefined();
      expect(s.destroy).toBeUndefined();
      expect(flat(B(s))).toBe(flat(B(old)));
    }
  });

  it('the new settings survive JSON and sanitising; nonsense is dropped', () => {
    const r = R('jungle', 4, { rollExpr: diceExpr(3), personality: { id: 'nervous', amount: 0.4 }, dna: { id: 'amen', amount: 0.5 }, destroy: { on: true, amount: 0.3, style: 'gate', variant: 2 } });
    const back = sanitiseRecipe(JSON.parse(JSON.stringify(r)));
    expect(back.rollExpr).toEqual(r.rollExpr);
    expect(back.personality).toEqual(r.personality);
    expect(back.dna).toEqual(r.dna);
    expect(back.destroy).toEqual(r.destroy);
    const junk = sanitiseRecipe({ ...R('funk'), rollExpr: 'x', personality: { id: 'zz' }, dna: 5, destroy: null } as unknown as Recipe);
    expect([junk.rollExpr, junk.personality, junk.dna, junk.destroy]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('history keys are unchanged for breaks without the new settings, and differ with them', () => {
    const e = { recipe: R('funk'), seeds: seedsFrom(5) };
    const key = entryKey(e);
    expect(key).not.toMatch(/personality|dna|destroy|regen|rollExpr/);
    expect(entryKey({ ...e, recipe: { ...e.recipe, personality: { id: 'angry', amount: 0.5 } } })).not.toBe(key);
    expect(entryKey({ ...e, seeds: { ...e.seeds, regen: [{ cats: ['kick'], n: 1 }] } })).not.toBe(key);
    const saved = sanitiseEntry(JSON.parse(JSON.stringify({ ...e, seeds: { ...e.seeds, regen: [{ cats: ['kick'], n: 1 }] } })))!;
    expect(saved.seeds.regen).toEqual([{ cats: ['kick'], n: 1 }]);
  });
});

// ------------------------------------------------------------------ the App

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function makeApp(seed: string | undefined = '4242') {
  const ingredients = { kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '—' };
  const sent: Break[] = [];
  const player = { loop: true, level: 0.5, playing: true, setLevel() {}, setMix() {}, setOutput() {}, setBreak: (b: Break) => sent.push(b), update: (b: Break) => sent.push(b), audition: async () => {}, onSwap: () => {} };
  const app = new App(ingredients as never, player as never, seed);
  app.setStyle('funk');
  app.setRecipe({ bars: 4 });
  return { app, sent };
}

describe('Phase 12 in the App', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('REGEN TRACK: one undo step, the other tracks unchanged, the batch kept, FREEZE does not stop it', () => {
    const { app, sent } = makeApp();
    app.bakeBatch(4);
    const batch = app.batch.map((b) => flat(b));
    app.toggleFreeze('beat');
    const before = flat(app.current);
    const others = only(app.current, (e) => e.cat !== 'kick');
    app.selectTrack('kick');
    expect(app.trackSel).toEqual(['kick']);
    const n = sent.length;
    app.regenTracks();
    expect(sent.length).toBeGreaterThan(n); // live playback follows
    expect(flat(app.current)).not.toBe(before);
    expect(only(app.current, (e) => e.cat !== 'kick')).toBe(others);
    expect(app.batch.map((b) => flat(b))).toEqual(batch);
    expect(app.status).toMatch(/FREEZE does not stop REGEN TRACK/);
    app.undo();
    expect(flat(app.current)).toBe(before);
    app.redo();
    expect(flat(app.current)).not.toBe(before);
  });

  it('track selection: click selects one, again clears, shift-click adds and removes', () => {
    const { app } = makeApp();
    app.selectTrack('kick');
    app.selectTrack('hat', true);
    expect(app.trackSel).toEqual(['kick', 'hat']);
    app.selectTrack('kick', true);
    expect(app.trackSel).toEqual(['hat']);
    app.selectTrack('hat');
    expect(app.trackSel).toEqual([]);
    app.regenTracks();
    expect(app.status).toMatch(/select a track first/);
    // a track with no hits (its part played on another track) is left alone, and the App says so
    const empty = CATEGORIES.find((c) => !app.current.events.some((e) => e.cat === c))!;
    const before = flat(app.current);
    app.regenTracks([empty]);
    expect(app.status).toMatch(/nothing to regenerate/);
    expect(flat(app.current)).toBe(before);
  });

  it('hit pitch, reverse and ratchet are undoable hand edits that persist across a reload', () => {
    const { app } = makeApp();
    const e = app.current.events.find((x) => x.cat === 'snare')!;
    app.select(e.ref!);
    app.setHitPitch(-7);
    app.setHitReverse(true);
    const hit = findRef(app.current.events, app.selected)!;
    expect([hit.pitch, hit.reverse]).toEqual([-7, true]);
    app.undo();
    expect(findRef(app.current.events, app.selected)?.reverse).toBeFalsy();
    app.redo();
    app.rollPreset('dive');
    app.ratchet(4, 48);
    expect(app.current.events.filter((x) => x.role === 'roll' && x.cat === 'snare').length).toBeGreaterThanOrEqual(3);
    const saved = flat(app.current);
    app.save();
    const again = new App({ kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '—' } as never, { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setOutput() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} } as never);
    expect(flat(again.current)).toBe(saved);
  });

  it('personality, DNA, DESTROY and roll expression persist across a reload and are each undoable', () => {
    const { app } = makeApp();
    const plain = flat(app.current);
    app.setPersonality({ id: 'angry', amount: 0.9 });
    app.setDna({ id: 'amen', amount: 0.7 });
    app.setDestroy({ on: true, amount: 0.4, style: 'pitch' });
    app.diceRolls(11);
    const now = flat(app.current);
    expect(now).not.toBe(plain);
    app.save();
    const again = new App({ kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '—' } as never, { loop: true, level: 0.5, playing: false, setLevel() {}, setMix() {}, setOutput() {}, setBreak() {}, update() {}, audition: async () => {}, onSwap: () => {} } as never);
    expect(again.recipe.personality).toEqual({ id: 'angry', amount: 0.9 });
    expect(again.recipe.dna).toEqual({ id: 'amen', amount: 0.7 });
    expect(again.recipe.destroy?.style).toBe('pitch');
    expect(flat(again.current)).toBe(now);
    for (let i = 0; i < 4; i++) app.undo();
    expect(flat(app.current)).toBe(plain);
  });

  it('ROLL GENERATION is off by default and no Phase 12 control turns it on; CLEAR ROLLS still clears', () => {
    const { app } = makeApp();
    expect(app.rollGeneration).toBe(false);
    app.rollPreset('stutter');
    app.diceRolls(3);
    app.setPersonality({ id: 'manic', amount: 1 });
    app.setDna({ id: 'amen', amount: 1 });
    app.setDestroy({ on: true, amount: 1, style: 'stutter' });
    expect(app.rollGeneration).toBe(false);
    expect(app.current.events.filter((e) => e.role === 'roll')).toHaveLength(0);
    app.setRollsOn(true);
    app.setRecipe({ rolls: 1 });
    expect(app.current.events.some((e) => e.role === 'roll')).toBe(true);
    app.clearRolls();
    expect(app.current.events.filter((e) => e.role === 'roll')).toHaveLength(0);
  });
});

it.skipIf(!hasChrome)('pitch and reverse in the offline render, stems and the live player (real Web Audio)', async () => {
  const result = await inChromium('/test/mixer-test.html', `import('/test/expressiveBrowser.ts').then(m => m.run())`);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  console.log(result.value);
  expect(result.value).toContain('passed');
}, 120000);
