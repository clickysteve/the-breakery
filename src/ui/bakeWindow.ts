/**
 * BAKE: generate (BAKE, BATCH), FREEZE (RHYTHM = beat + detail + feel, SAMPLES = the kit layer,
 * or single layers), play, loop, level and TAKEAWAY.
 */
import { saveSwitchMode } from '../app/switchMode';
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

  // one column of rows on a 4px grid: generate, then transport, then FREEZE, then level
  const G = 4;
  const half = Math.floor((W - 2 * G - G) / 2);
  const col2 = G + half + G;
  new Button(b, [G, 4, W - 2 * G, 24], 'BAKE', { cls: 'bigbtn', tip: 'BAKE a new break from the recipe (B). Frozen layers are kept.', onPress: () => app.bake() });
  new Button(b, [G, 32, half, 16], 'BATCH', { tip: 'BATCH: bake 8 candidates to compare (N). Click one in the BATCH tab to audition it.', onPress: () => app.bakeBatch() });
  new Button(b, [col2, 32, W - G - col2, 16], 'TAKEAWAY', { tip: 'TAKEAWAY: export the break as a WAV file, with stems and MIDI if you like (T)', onPress: () => ui.takeaway() });

  const third = Math.floor((W - 2 * G - 2 * G) / 3);
  const play = new Button(b, [G, 52, third, 16], '▶ PLAY', { tip: 'Play / stop (Space)', onPress: () => ui.togglePlay() });
  const loop = new Button(b, [G + third + G, 52, third, 16], 'LOOP', {
    tip: 'Loop the break (L). Off: play it once, with its tail.',
    onPress: () => {
      app.player.loop = !app.player.loop;
      app.changed();
    },
  });
  const pos = el('div', 'num', b, [G + 2 * (third + G), 52, W - G - (G + 2 * (third + G)), 16]);
  setTip(pos, 'Position: bar . beat . sixteenth (› = a new pattern is waiting to start)');

  const modes = ['bar', 'loop', 'immediate'] as const;
  const modeNames = ['NEXT BAR', 'NEXT LOOP', 'IMMEDIATE'];
  label(b, G + 1, 75, 'SWITCH', 'head');
  const mode = new Button(b, [44, 72, W - G - 44, 14], 'NEXT BAR', {
    cls: 'small', tip: 'SWITCH: when a new pattern (BAKE, MUTATE, a candidate, an edit of the recipe) takes over while playing. Click to cycle NEXT BAR, NEXT LOOP, IMMEDIATE.',
    onPress: () => {
      app.player.switchMode = modes[(modes.indexOf(app.player.switchMode) + 1) % modes.length]!;
      saveSwitchMode(app.player.switchMode);
      app.changed(false);
    },
  });
  label(b, G + 1, 93, 'FREEZE', 'head');
  const fw = Math.floor((W - G - 44 - G) / 2);
  const rhythm = new Button(b, [44, 90, fw, 14], 'RHYTHM', {
    cls: 'small',
    tip: 'FREEZE RHYTHM: keep hit placement and performance (BEAT, DETAIL and FEEL together) when baking; only the samples change. Mutations are kept too.',
    onPress: () => app.toggleRhythm(),
  });
  const samples = new Button(b, [44 + fw + G, 90, W - G - (44 + fw + G), 14], 'SAMPLES', { cls: 'small', tip: FREEZE_TIP.kit, onPress: () => app.toggleFreeze('kit') });
  const tw = Math.floor((W - 2 * G - 3 * G) / 4);
  const layers = (['beat', 'detail', 'feel'] as Layer[]).map((l, i) => new Button(b, [G + i * (tw + G), 108, tw, 14], l.toUpperCase(), { cls: 'small', tip: FREEZE_TIP[l], onPress: () => app.toggleFreeze(l) }));
  const edits = new Button(b, [G + 3 * (tw + G), 108, W - G - (G + 3 * (tw + G)), 14], 'EDITS', {
    cls: 'small',
    tip: 'FREEZE EDITS (E): new breaks (BAKE, BATCH, a seed, MUTATE) keep your hand edits, by position. Off: hand edits stay with their break (◀ in the history returns to it); a new break starts as generated. Recipe, sample and length changes always keep them.',
    onPress: () => app.toggleKeepEdits(),
  });

  label(b, G + 1, 129, 'LEVEL', 'head');
  const level = new RangeBar(b, [44, 126, W - G - 44, 14], {
    get: () => app.player.level / 1.5,
    set: (v) => {
      app.player.setLevel(v * 1.5);
      app.changed();
    },
    format: (v) => `${v > 0 ? (20 * Math.log10(v * 1.5)).toFixed(1) : '-∞'} dB`,
    parse: (t) => (/^-?\d+(\.\d+)?$/.test(t) ? Math.min(1, Math.pow(10, Number(t) / 20) / 1.5) : null),
    editText: (v) => (v > 0 ? (20 * Math.log10(v * 1.5)).toFixed(1) : '-60'),
    tip: 'MASTER LEVEL, for playback and TAKEAWAY alike (the same control as MASTER in the MIXER). Type a value in dB (0 = unity gain).',
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
    mode.text = modeNames[modes.indexOf(app.player.switchMode)]!;
    play.text = app.player.playing ? '■ STOP' : '▶ PLAY';
    play.on = app.player.playing;
    loop.on = app.player.loop;
    rhythm.on = app.rhythmFrozen;
    samples.on = app.frozen.kit;
    layers.forEach((f, i) => (f.on = app.frozen[(['beat', 'detail', 'feel'] as Layer[])[i]!]));
    edits.on = app.keepEdits;
    level.update();
    tick();
  }
  update();
  return { update, tick, win };
}
