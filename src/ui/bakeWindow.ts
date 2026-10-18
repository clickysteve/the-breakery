/**
 * BAKE: generate (BAKE, BATCH), FREEZE layers, play, loop, level and TAKEAWAY.
 */
import { LAYERS, STEPS, type Layer } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, MWindow, RangeBar } from './widgets';
import type { UiContext } from './context';

const FREEZE_TIP: Record<Layer, string> = {
  beat: 'FREEZE BEAT: keep the kick and snare pattern (and its fills) when baking',
  detail: 'FREEZE DETAIL: keep the ghost, hat, percussion and cymbal decisions when baking',
  feel: "FREEZE FEEL: keep the drummer's timing and dynamics tendencies when baking",
  kit: 'FREEZE KIT: keep the sample choices when baking',
};

export function bakeWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'BAKE', ...rect });
  const b = win.body;
  const W = rect.w - 2;

  new Button(b, [4, 4, W - 8, 24], 'BAKE', { cls: 'bigbtn', tip: 'BAKE a new break from the recipe (B). Frozen layers are kept.', onPress: () => app.bake() });
  new Button(b, [4, 32, (W - 12) / 2, 16], 'BATCH', { tip: 'BATCH: bake 8 candidates to compare (N). Click one in the BATCH window to audition it.', onPress: () => app.bakeBatch() });
  new Button(b, [8 + (W - 12) / 2, 32, (W - 12) / 2, 16], 'TAKEAWAY', { tip: 'TAKEAWAY: export the break as a WAV file (T)', onPress: () => ui.takeaway() });

  const play = new Button(b, [4, 54, 52, 18], '▶ PLAY', { tip: 'Play / stop (Space)', onPress: () => ui.togglePlay() });
  const loop = new Button(b, [60, 54, 40, 18], 'LOOP', {
    tip: 'Loop the break (L). Off: play it once, with its tail.',
    onPress: () => {
      app.player.loop = !app.player.loop;
      app.changed();
    },
  });
  const pos = el('div', 'num', b, [104, 54, W - 108, 18]);
  setTip(pos, 'Position: bar . beat . sixteenth');

  label(b, 6, 80, 'FREEZE');
  const fw = Math.floor((W - 8 - 9) / 4);
  const freeze = LAYERS.map((l, i) => new Button(b, [4 + i * (fw + 3), 91, fw, 14], l.toUpperCase(), { cls: 'small', tip: FREEZE_TIP[l], onPress: () => app.toggleFreeze(l) }));

  label(b, 6, 113, 'LEVEL');
  const level = new RangeBar(b, [40, 110, W - 44, 13], {
    get: () => app.player.level,
    set: (v) => {
      app.player.setLevel(v);
      app.save();
    },
    format: (v) => `${v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-∞'} dB`,
    tip: 'Output level, for playback and TAKEAWAY alike',
    label: 'Level',
  });

  let lastPos = '';
  function tick(): void {
    const p = app.player.position();
    let t = '-.-.-';
    if (p) {
      const bars = app.player.break?.recipe.bars ?? 1;
      const s = Math.floor(p.frac * bars * STEPS);
      t = `${Math.floor(s / STEPS) + 1}.${Math.floor((s % STEPS) / 4) + 1}.${(s % 4) + 1}`;
    }
    if (app.player.queued) t += ' ›';
    if (t !== lastPos) {
      pos.textContent = t;
      lastPos = t;
    }
  }

  function update(): void {
    play.text = app.player.playing ? '■ STOP' : '▶ PLAY';
    play.on = app.player.playing;
    loop.on = app.player.loop;
    freeze.forEach((f, i) => (f.on = app.frozen[LAYERS[i]!]));
    level.update();
    tick();
  }
  update();
  return { update, tick, win };
}
