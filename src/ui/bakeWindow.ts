/**
 * BAKE: generate (BAKE, BATCH), FREEZE (RHYTHM = beat + detail + feel, SAMPLES = the kit layer,
 * or single layers), play, loop, level and TAKEAWAY.
 */
import { STEPS, type Layer } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, MWindow, RangeBar } from './widgets';
import type { UiContext } from './context';

const FREEZE_TIP: Record<Layer, string> = {
  beat: 'FREEZE BEAT: keep the kick and snare pattern (and its fills) when baking',
  detail: 'FREEZE DETAIL: keep the ghost, hat, percussion and cymbal decisions when baking',
  feel: "FREEZE FEEL: keep the drummer's timing and dynamics tendencies when baking",
  kit: 'FREEZE SAMPLES: keep the sample choices (the KIT seed) when baking. Selection modes still follow the hits: ROUND ROBIN cycles over whatever hits there are.',
};

export function bakeWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'BAKE', ...rect });
  const b = win.body;
  const W = rect.w - 2;

  new Button(b, [4, 4, W - 8, 24], 'BAKE', { cls: 'bigbtn', tip: 'BAKE a new break from the recipe (B). Frozen layers are kept.', onPress: () => app.bake() });
  new Button(b, [4, 32, (W - 12) / 2, 16], 'BATCH', { tip: 'BATCH: bake 8 candidates to compare (N). Click one in the BATCH window to audition it.', onPress: () => app.bakeBatch() });
  new Button(b, [8 + (W - 12) / 2, 32, (W - 12) / 2, 16], 'TAKEAWAY', { tip: 'TAKEAWAY: export the break as a WAV file (T)', onPress: () => ui.takeaway() });

  const play = new Button(b, [4, 52, 52, 18], '▶ PLAY', { tip: 'Play / stop (Space)', onPress: () => ui.togglePlay() });
  const loop = new Button(b, [60, 52, 40, 18], 'LOOP', {
    tip: 'Loop the break (L). Off: play it once, with its tail.',
    onPress: () => {
      app.player.loop = !app.player.loop;
      app.changed();
    },
  });
  const pos = el('div', 'num', b, [104, 52, W - 108, 18]);
  setTip(pos, 'Position: bar . beat . sixteenth');

  label(b, 6, 76, 'FREEZE');
  const hw = Math.floor((W - 11) / 2);
  const rhythm = new Button(b, [4, 86, hw, 13], 'RHYTHM', {
    cls: 'small',
    tip: 'FREEZE RHYTHM: keep hit placement and performance (BEAT, DETAIL and FEEL together) when baking; only the samples change. Mutations are kept too.',
    onPress: () => app.toggleRhythm(),
  });
  const samples = new Button(b, [7 + hw, 86, W - 11 - hw, 13], 'SAMPLES', { cls: 'small', tip: FREEZE_TIP.kit, onPress: () => app.toggleFreeze('kit') });
  const tw = Math.floor((W - 8 - 6) / 3);
  const layers = (['beat', 'detail', 'feel'] as Layer[]).map((l, i) => new Button(b, [4 + i * (tw + 3), 101, tw, 12], l.toUpperCase(), { cls: 'small', tip: FREEZE_TIP[l], onPress: () => app.toggleFreeze(l) }));

  label(b, 6, 120, 'LEVEL');
  const level = new RangeBar(b, [40, 117, W - 44, 13], {
    get: () => app.player.level,
    set: (v) => {
      app.player.setLevel(v);
      app.save();
    },
    format: (v) => `${v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-∞'} dB`,
    parse: (t) => (/^-?\d+(\.\d+)?$/.test(t) ? Math.min(1, Math.pow(10, Math.min(0, Number(t)) / 20)) : null),
    editText: (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-60'),
    tip: 'Output level, for playback and TAKEAWAY alike. Type a value in dB (0 = full scale).',
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
    rhythm.on = app.rhythmFrozen;
    samples.on = app.frozen.kit;
    layers.forEach((f, i) => (f.on = app.frozen[(['beat', 'detail', 'feel'] as Layer[])[i]!]));
    level.update();
    tick();
  }
  update();
  return { update, tick, win };
}
