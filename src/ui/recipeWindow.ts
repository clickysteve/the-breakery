/**
 * RECIPE: style, tempo, bars, seed and the eight generative controls. Every change re-bakes the
 * same seeds, so you hear what the control does to this break.
 */
import { swingPercent } from '../engine/performance';
import { STYLE_DEFS } from '../engine/styles';
import { STYLES, type Bars, type RecipeKey } from '../engine/types';
import { label } from './dom';
import { Button, MWindow, NumBox, RangeBar } from './widgets';
import type { UiContext } from './context';
import { promptDialog } from './dialogs';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const CONTROLS: { key: RecipeKey; label: string; tip: string; format?: (v: number) => string }[] = [
  { key: 'density', label: 'DENSITY', tip: 'How many hits: more kicks, and sixteenth hats instead of eighths above a point.' },
  { key: 'complexity', label: 'COMPLEXITY', tip: 'How far from the plain backbeat: extra snares, off-beat kicks, open-hat lifts, 32nd drags, displaced backbeats.' },
  { key: 'syncopation', label: 'SYNCOPATION', tip: 'Target syncopation of the kick/snare foundation. Research suggests medium syncopation grooves most, so this is a target, not "more is better".' },
  { key: 'ghosts', label: 'GHOSTS', tip: 'How many ghost snares. They are placed around the backbeats (anticipating or answering them), not at random.' },
  { key: 'swing', label: 'SWING', tip: 'Sixteenth swing, drum-machine style: the second sixteenth of each eighth is delayed. 50% straight, 66% triplet, 75% maximum.', format: (v) => `${Math.round(swingPercent(v))}%` },
  { key: 'humanise', label: 'HUMANISE', tip: "The drummer's tendencies: a slightly late snare, hats leaning ahead, small correlated drifts in timing and dynamics (at most ±10 ms). Not random jitter." },
  { key: 'variation', label: 'VARIATION', tip: 'How much later bars differ from the first: moved or extra kicks, ghosts and lifts, mostly in the second half of the bar.' },
  { key: 'fills', label: 'FILLS', tip: 'Length and drama of the turnaround at the end of the phrase: snare runs, delayed backbeats with early crashes, drop-outs, stutters.' },
];

export function recipeWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'RECIPE', ...rect });
  const b = win.body;
  const W = rect.w - 2;

  const bw = Math.floor((W - 8 - 3 * 3) / 4);
  const styleBtns = STYLES.map((s, i) => {
    const def = STYLE_DEFS[s];
    return new Button(b, [4 + i * (bw + 3), 4, bw, 16], def.label, {
      tip: `${def.label}: a starting recipe (${def.bpm[0]}–${def.bpm[1]} BPM). Sets every control to its defaults; the genre name is a tendency, not a promise of authenticity.`,
      onPress: () => app.setStyle(s),
    });
  });

  label(b, 6, 31, 'BPM');
  const bpm = new NumBox(b, [26, 27, 32, 15], {
    get: () => app.recipe.bpm,
    set: (v) => app.setRecipe({ bpm: v }),
    min: 40,
    max: 220,
    label: 'Tempo, beats per minute',
    tip: 'Tempo. Drag up/down, scroll, or use the arrow keys; double-click to type.',
    ask: () => void promptDialog(ui.screen, 'Tempo (BPM, 40–220):', String(app.recipe.bpm)).then((t) => t !== null && Number(t) > 0 && app.setRecipe({ bpm: Number(t) })),
  });

  label(b, 66, 31, 'BARS');
  const barBtns = ([1, 2, 4] as Bars[]).map((n, i) =>
    new Button(b, [90 + i * 19, 27, 17, 15], String(n), { tip: `${n} bar${n > 1 ? 's' : ''}: ${n === 1 ? 'one groove bar' : n === 2 ? 'groove + turnaround' : 'groove, answer, groove, turnaround'}`, onPress: () => app.setRecipe({ bars: n }) }),
  );

  label(b, 154, 31, 'SEED');
  const seed = new NumBox(b, [180, 27, 56, 15], {
    get: () => app.seeds.beat,
    set: (v) => app.setSeed(v),
    min: 0,
    max: 999999,
    pxPerUnit: 6,
    label: 'Seed',
    tip: 'The seed: the same seed and recipe always bake the same break. Arrow keys step to neighbouring seeds; double-click to type one.',
    ask: () => void promptDialog(ui.screen, 'Seed (0–999999):', String(app.seeds.beat)).then((t) => t !== null && t.trim() !== '' && !Number.isNaN(Number(t)) && app.setSeed(Number(t))),
  });
  new Button(b, [240, 27, W - 244, 15], 'RESET', { cls: 'small', tip: "Back to this style's default recipe", onPress: () => app.resetRecipe() });

  const bars: RangeBar[] = [];
  CONTROLS.forEach((c, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const x = 4 + col * Math.floor(W / 2);
    const y = 52 + row * 20;
    label(b, x + 2, y + 4, c.label);
    bars.push(
      new RangeBar(b, [x + 72, y, Math.floor(W / 2) - 80, 15], {
        get: () => app.recipe[c.key],
        // baking is cheap (well under a millisecond), so the break follows the drag
        set: (v) => app.setRecipe({ [c.key]: v }),
        format: c.format ?? pct,
        tip: c.tip,
        label: c.label,
      }),
    );
  });

  function update(): void {
    styleBtns.forEach((btn, i) => (btn.on = STYLES[i] === app.recipe.style));
    barBtns.forEach((btn, i) => (btn.on = [1, 2, 4][i] === app.recipe.bars));
    bpm.update();
    seed.update();
    bars.forEach((r) => r.update());
  }
  update();
  return { update, win };
}
