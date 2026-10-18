import { afterEach, expect, it, vi } from 'vitest';
import { emptyMix, audibleCategories, mixerStrips, sanitiseMix, safeGain } from '../src/app/mix';
import { App } from '../src/app/app';
import { Player } from '../src/audio/player';
import { emptyKit } from '../src/engine/kit';

afterEach(() => vi.unstubAllGlobals());
it('sanitises gains and pans, migrates old settings and resolves multiple solos with mute priority', () => {
  const m = sanitiseMix({ kick: { gain: 99, pan: -8 }, snare: { gain: NaN, pan: Infinity }, hat: { mute: true } });
  expect(m.kick).toMatchObject({ gain: 1.5, pan: -1 });
  expect(m.snare).toMatchObject({ gain: 1, pan: 0 });
  expect(m.hat.gain).toBe(1);
  expect(safeGain(-2)).toBe(0); expect(safeGain(Infinity)).toBe(1);
  m.kick.solo = m.snare.solo = m.hat.solo = true;
  expect(audibleCategories(m)).toEqual(['kick', 'snare']);
  expect(mixerStrips(m).hat).toMatchObject({ mute: true, solo: false });
});
it('persists independently of pattern undo, redo, generation and kit loading', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
  const ingredients = { kit: emptyKit, loudness: () => ({}), name: (s: string) => s } as never;
  const player = new Player(ingredients); const app = new App(ingredients, player, '42');
  app.setChannel('ghost', .35, .7); app.toggleMute('hat'); player.setLevel(.65); app.save();
  const mix = structuredClone(app.mix);
  app.bake(); app.undo(); app.redo(); app.kitLoaded({});
  expect(app.mix).toEqual(mix); expect(player.level).toBe(.65);
  const nextPlayer = new Player(ingredients); const next = new App(ingredients, nextPlayer);
  expect(next.mix).toEqual(mix); expect(nextPlayer.level).toBe(.65);
});
it('live mixer updates leave current voices, playback position and pending transitions intact', () => {
  const p = new Player({} as never); const internal = p as any;
  const strips = vi.fn(), master = vi.fn();
  internal.mixer = { setStrip: strips, setMasterGain: master };
  internal.notes = { stopAll: vi.fn() };
  internal.pending = { marker: true }; internal.switchAt = 12; internal.loopStart = 4;
  internal.idx = 8; internal.scheduledUntil = 10; p.playing = true;
  const m = emptyMix(); m.ghost.gain = .3; m.hat.pan = -.6;
  p.setMix(m); p.setLevel(.8);
  expect(strips).toHaveBeenCalledWith('ghost', expect.objectContaining({ gain: .3 }));
  expect(master).toHaveBeenCalledWith(.8);
  expect(internal.notes.stopAll).not.toHaveBeenCalled();
  expect([internal.switchAt, internal.loopStart, internal.idx, internal.scheduledUntil]).toEqual([12, 4, 8, 10]);
  expect(internal.pending).toEqual({ marker: true }); expect(p.playing).toBe(true);
});
