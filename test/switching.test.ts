import { emptyMix } from '../src/app/mix';
import { expect, it, vi } from 'vitest';
import { Player, type SwitchMode } from '../src/audio/player';
import { App } from '../src/app/app';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { emptyKit } from '../src/engine/kit';
import type { Break } from '../src/engine/types';

function pattern(seed: number): Break {
  const b = bake({ ...defaultRecipe('funk', 2), bpm: 120 }, seedsFrom(seed));
  b.events = Array.from({ length: 32 }, (_, i) => ({ cat: 'kick', bar: Math.floor(i / 16), step: i % 16, sub: 0, swing: 0, offsetMs: 0, sample: String(seed), vel: 100, level: 1, role: 'kick', why: '' }));
  return b;
}
function setup(mode: SwitchMode = 'bar') {
  const p = new Player({} as never);
  const ctx = { currentTime: 0, outputLatency: 0 };
  const noteOn = vi.fn();
  const internal = p as any;
  p.ctx = ctx as AudioContext;
  internal.notes = { noteOn, stopAll: vi.fn() };
  internal.tempo = 120;
  internal.build(pattern(1));
  internal.audible = internal.current;
  p.playing = true;
  p.switchMode = mode;
  const advance = (t: number) => { ctx.currentTime = t; internal.pump(); };
  advance(0);
  return { p, internal, ctx, noteOn, advance };
}

for (const [mode, boundary] of [['bar', 2], ['loop', 4]] as const) {
  it(`${mode}: switches once at boundary, preserves phase and downbeat`, () => {
    const { p, internal, noteOn, advance } = setup(mode);
    advance(.4);
    const b = pattern(2);
    p.setBreak(b);
    expect(internal.switchAt).toBe(boundary);
    const mix = emptyMix(); mix.kick.gain = .6; mix.hat.pan = -.5;
    p.setMix(mix); p.setLevel(.7);
    expect(internal.switchAt).toBe(boundary);
    expect(p.break!.seeds.beat).toBe(1);
    for (let t = .45; t <= boundary + .05; t += .025) advance(t);
    expect(p.break).toBe(b);
    const downbeats = noteOn.mock.calls.filter(c => Math.abs(c[2].time - boundary) < 1e-8);
    expect(downbeats).toHaveLength(1);
    expect(downbeats[0]![2].instrument).toBe('2');
    expect(p.position()!.frac).toBeCloseTo((boundary % 4) / 4, 1);
  });
}
it('immediate: retains phase, skips previously scheduled hits and never restarts', () => {
  const { p, internal, noteOn, advance } = setup('immediate');
  advance(.4);
  const before = p.position()!.frac;
  p.setBreak(pattern(2));
  expect(internal.switchAt).toBeGreaterThan(.5);
  advance(.51);
  expect(p.position()!.frac).toBeGreaterThan(before);
  expect(p.playing).toBe(true);
  const times = noteOn.mock.calls.map(c => c[2].time);
  expect(new Set(times).size).toBe(times.length);
});
it('only the latest pending replacement becomes active', () => {
  const { p, advance } = setup();
  p.setBreak(pattern(2)); p.setBreak(pattern(3));
  const last = pattern(4); p.setBreak(last);
  advance(1.9); advance(2);
  expect(p.break).toBe(last);
  expect(p.queued).toBe(false);
});
it('stop adopts the selected pattern and clears all pending state', () => {
  const { p, internal } = setup();
  const b = pattern(2); p.setBreak(b); p.stop();
  expect(p.break).toBe(b);
  expect(p.queued).toBe(false);
  expect(internal.switchAt).toBe(Infinity);
  expect(p.position()).toBeNull();
});
it('BAKE, BAKE, MUTATE, UNDO and REDO preserve selected history during playback', () => {
  const { p, internal, advance } = setup();
  const app = new App({ kit: emptyKit, loudness: () => ({}), name: (s: string) => s } as never, p, '42');
  app.bake(); const first = app.current;
  app.bake(); const second = app.current;
  app.mutate(); const mutation = app.current;
  expect(internal.pending).toBe(mutation);
  app.undo(); expect(app.current).toEqual(second); expect(internal.pending).toEqual(second);
  app.undo(); expect(app.current).toEqual(first);
  app.redo(); expect(app.current).toEqual(second);
  app.redo(); expect(app.current).toEqual(mutation);
  advance(1.9); advance(2);
  expect(p.break).toEqual(mutation);
  expect(p.playing).toBe(true);
});
