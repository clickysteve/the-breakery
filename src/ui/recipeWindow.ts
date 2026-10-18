/**
 * RECIPE: style, engine, tempo, bars, seed (with DICE, history, favourite and MUTATE) and the
 * eight generative controls. Every change re-bakes the same seeds, so you hear what the control
 * does to this break. Every number can be clicked and typed (emmm's numerical fields).
 */
import { swingPercent } from '../engine/performance';
import { STYLE_DEFS } from '../engine/styles';
import { MAX_BARS, MIN_BARS, STYLES, type Bars, type RecipeKey } from '../engine/types';
import { label } from './dom';
import { Button, MWindow, NumBox, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const num = (t: string) => (/^\d+(\.\d+)?$/.test(t) ? Number(t) : null);

const CONTROLS: { key: RecipeKey; label: string; tip: string; format?: (v: number) => string; parse?: (t: string) => number | null }[] = [
  { key: 'density', label: 'DENSITY', tip: 'How many hits: more kicks, and sixteenth hats instead of eighths above a point.' },
  { key: 'complexity', label: 'COMPLEXITY', tip: 'How far from the plain backbeat: extra snares, off-beat kicks, open-hat lifts, 32nd drags, displaced backbeats.' },
  { key: 'syncopation', label: 'SYNCOPATION', tip: 'Target syncopation of the kick/snare foundation. Research suggests medium syncopation grooves most, so this is a target, not "more is better".' },
  { key: 'ghosts', label: 'GHOSTS', tip: 'How many ghost snares. They are built from figures around the backbeats (anticipating, rebounding, two-stroke pickups), not placed at random.' },
  {
    key: 'swing',
    label: 'SWING',
    tip: 'Sixteenth swing, drum-machine style: the second sixteenth of each eighth is delayed. 50% straight, 54–58% the subtle swing of classic breaks, 66% triplet, 75% maximum. Type the percentage.',
    format: (v) => `${Math.round(swingPercent(v))}%`,
    parse: (t) => (num(t) === null ? null : (Math.max(50, Math.min(75, num(t)!)) - 50) / 25),
  },
  { key: 'humanise', label: 'HUMANISE', tip: "The drummer's tendencies: a laid-back snare (more on 2 than on 4), hats leaning ahead, accents a touch late, small correlated drifts. Engine 2: up to ±18 ms. Not random jitter." },
  { key: 'variation', label: 'VARIATION', tip: 'How much later bars differ from the first: answers, development bars, chops (JUNGLE, HARDCORE, BREAKCORE). Programmed recipes repeat exactly below 50%.' },
  { key: 'fills', label: 'FILLS', tip: 'Length and drama of the fills: snare runs, delayed backbeats with early crashes, drop-outs, stutters, chops and rolls. In 6–8 bars a short half-way fill answers the last one.' },
];

const BAR_PLAN: Record<number, string> = {
  1: 'one groove bar',
  2: 'groove + turnaround',
  3: 'groove, answer, turnaround',
  4: 'groove, answer, groove, turnaround',
  5: 'groove, answer, groove, development, turnaround',
  6: 'four bars ending in a short fill, then groove and turnaround',
  7: 'four bars ending in a short fill, then groove, development, turnaround',
  8: 'two four-bar sections: the second develops the first and ends in the turnaround',
};

export function recipeWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'RECIPE', ...rect });
  const b = win.body;
  const W = rect.w - 2;

  // two rows of recipes; the last cell of the second row is the ENGINE toggle
  const perRow = 6;
  const bw = Math.floor((W - 8 - (perRow - 1) * 2) / perRow);
  const styleBtns = STYLES.map((s, i) => {
    const def = STYLE_DEFS[s];
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return new Button(b, [4 + col * (bw + 2), 3 + row * 16, bw, 14], def.label, {
      cls: 'small',
      tip: `${def.label} (${def.bpm[0]}–${def.bpm[1]} BPM): ${def.blurb} Choosing it sets every control to its defaults. The genre name is a tendency, not a promise of authenticity.`,
      onPress: () => app.setStyle(s),
    });
  });
  const engine = new Button(b, [4 + 5 * (bw + 2), 19, bw, 14], 'ENGINE 2', {
    cls: 'small',
    tip: 'ENGINE: 2 is the current generator; 1 is the first release’s, kept exactly so its breaks still reproduce from their seeds. Switch to compare the two on the same seed (original four recipes only).',
    onPress: () => app.setEngine(app.recipe.engine === 1 ? 2 : 1),
  });

  const y2 = 37;
  label(b, 5, y2 + 4, 'BPM');
  const bpm = new NumBox(b, [24, y2, 30, 15], {
    get: () => app.recipe.bpm,
    set: (v) => app.setRecipe({ bpm: v }),
    min: 40,
    max: 220,
    label: 'Tempo, beats per minute',
    tip: 'Tempo, 40–220 BPM. Click and type a value, then Return (Escape cancels); ↑ ↓ step it (Shift: by 10); drag up/down or scroll to sweep it.',
  });

  label(b, 59, y2 + 4, 'BARS');
  const bars = new NumBox(b, [82, y2, 18, 15], {
    get: () => app.recipe.bars,
    set: (v) => app.setRecipe({ bars: v as Bars }),
    min: MIN_BARS,
    max: MAX_BARS,
    pxPerUnit: 8,
    label: 'Pattern length in bars',
    tip: 'Pattern length, 1–8 bars. Click and type, or ↑ ↓. The phrase is built to the length, not by stacking bars.',
  });

  label(b, 105, y2 + 4, 'SEED');
  const seed = new NumBox(b, [128, y2, 92, 15], {
    get: () => app.seeds.beat,
    set: (v) => app.setSeed(Math.max(0, v)),
    min: 0,
    max: 999999999,
    format: () => `${app.seedText}${app.seeds.mut?.length ? ` +${app.seeds.mut.length}` : ''}`,
    editText: () => app.seedText,
    entry: (t) => app.setSeedText(t),
    anyText: true,
    maxLength: 40,
    pxPerUnit: 6,
    label: 'Seed: a number or a name',
    tip: 'The seed: a number, or any words ("funky chicken", "glasgow 1993"). The same seed, recipe and engine always bake the same break. Click and type, then Return. ↑ ↓ step to neighbouring numbers (not related breaks: use MUT for those). +N = mutations.',
  });
  const bx = 222;
  const dice = new Button(b, [bx, y2, 22, 15], 'DICE', { cls: 'small', tip: 'DICE: roll a new named seed for every layer (D)', onPress: () => app.dice() });
  const back = new Button(b, [bx + 24, y2, 11, 15], '◀', { cls: 'small', tip: 'Back to the previous seed in the history (←)', onPress: () => app.historyBack() });
  const fwd = new Button(b, [bx + 37, y2, 11, 15], '▶', { cls: 'small', tip: 'Forward in the history (→)', onPress: () => app.historyForward() });
  const fav = new Button(b, [bx + 50, y2, 20, 15], 'FAV', { cls: 'small', tip: 'Save this break to the favourites (S): recipe, seeds, mutations and sample settings. Inverted when it is one; press again to remove it. Favourites are in the Seeds menu.', onPress: () => app.toggleFavourite() });
  const mut = new Button(b, [bx + 72, y2, W - bx - 72 - 4, 15], 'MUT', {
    cls: 'small',
    tip: 'MUTATE (U): a related variation of this break: a few small changes to the groove itself (a kick moved or doubled, a ghost, a lift), so every bar follows. Frozen layers are kept. ◀ goes back.',
    onPress: () => app.mutate(),
  });

  const ranges: RangeBar[] = [];
  CONTROLS.forEach((c, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const x = 4 + col * Math.floor(W / 2);
    const y = 58 + row * 18;
    label(b, x + 2, y + 3, c.label);
    ranges.push(
      new RangeBar(b, [x + 72, y, Math.floor(W / 2) - 80, 14], {
        get: () => app.recipe[c.key],
        // baking is cheap (about a millisecond), so the break follows the drag
        set: (v) => app.setRecipe({ [c.key]: v }),
        format: c.format ?? pct,
        parse: c.parse,
        tip: c.tip,
        label: c.label,
      }),
    );
  });

  function update(): void {
    styleBtns.forEach((btn, i) => {
      btn.on = STYLES[i] === app.recipe.style;
    });
    engine.text = `ENGINE ${app.recipe.engine}`;
    engine.on = app.recipe.engine === 1;
    bpm.update();
    bars.update();
    seed.update();
    setTipBars();
    back.disabled = !app.history.canBack;
    fwd.disabled = !app.history.canForward;
    fav.on = app.isFavourite;
    mut.disabled = app.recipe.engine === 1;
    dice.on = false;
    ranges.forEach((r) => r.update());
  }
  function setTipBars(): void {
    bars.el.dataset.tip = `Pattern length, 1–8 bars (now ${app.recipe.bars}: ${BAR_PLAN[app.recipe.bars]}). Click and type, or ↑ ↓.`;
  }
  update();
  return { update, win };
}
