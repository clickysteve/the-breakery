/**
 * RECIPE · CYMBALS · PERSONALITY · CHOP · ROLLS · MUTATE, one window with six tabs.
 *
 * RECIPE: style (with RANDOM RECIPE), tempo (with TEMPO LOCK and the tempo DICE), bars, seed (with DICE, history and favourite), a row
 * showing CHOP (the transformation), ROLL GENERATION and the cymbals' activity, each opening its tab (a LEGACY break offers
 * USE CURRENT GROOVE there), the eight generative controls and TOM ACTIVITY. GROOVE, the only
 * generator, has no selector: every break is baked by it. Every change re-bakes the same
 * seeds, so you hear what the control does to this break. Every number can be clicked and typed
 * (emmm's numerical fields). CHOP: the phrase transformation (chopTab.ts). ROLLS: roll generation
 * (rollsTab.ts). MUTATE: mutation and related sections (mutateTab.ts). PERSONALITY: who plays the
 * break and its BREAK DNA (personalityTab.ts). CYMBALS: HI-HAT and RIDE ACTIVITY and how they share
 * the time (cymbalsTab.ts).
 */
import { hatActivity, rideActivity } from '../engine/cymbals';
import { swingPercent } from '../engine/performance';
import { STYLE_DEFS } from '../engine/styles';
import { tempoRange } from '../engine/tempo';
import { CATEGORY_LABEL, MAX_BARS, MIN_BARS, STYLES, TOMS, type Bars, type RecipeKey } from '../engine/types';
import { chopTab } from './chopTab';
import { cymbalsTab } from './cymbalsTab';
import { el, label, setTip } from './dom';
import { mutateTab } from './mutateTab';
import { personalityTab } from './personalityTab';
import { rollsTab } from './rollsTab';
import { Button, MWindow, NumBox, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** The window's tabs, by index. */
export const TAB = { recipe: 0, cymbals: 1, persona: 2, chop: 3, rolls: 4, mutate: 5 } as const;
const num = (t: string) => (/^\d+(\.\d+)?$/.test(t) ? Number(t) : null);

const CONTROLS: { key: RecipeKey; label: string; tip: string; format?: (v: number) => string; parse?: (t: string) => number | null }[] = [
  { key: 'density', label: 'DENSITY', tip: 'How many hits: more kicks and ghosts, and a little more in the cymbals. The hats and the ride have their own activity (CYMBALS tab).' },
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
  { key: 'humanise', label: 'HUMANISE', tip: "The drummer's tendencies: a laid-back snare (more on 2 than on 4), hats leaning ahead, accents a touch late, small correlated drifts. Up to ±18 ms. Not random jitter." },
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
  const win = new MWindow(parent, { title: 'RECIPE', tabs: ['RECIPE', 'CYMBALS', 'PERSONALITY', 'CHOP', 'ROLLS', 'MUTATE'], ...rect, onTab: () => update() });
  const [b, cymbalsPane, personaPane, chopPane, rollsPane, mutatePane] = win.panes as [HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement];
  const W = rect.w - 2;
  const cymbals = cymbalsTab(cymbalsPane, ui, W);
  const persona = personalityTab(personaPane, ui, W);
  const chop = chopTab(chopPane, ui, W);
  const rolls = rollsTab(rollsPane, ui, W);
  const mut = mutateTab(mutatePane, ui, W);

  // RECIPE: two rows of recipes (the last cell of the second row is RANDOM RECIPE). What is done with
  // the GROOVE (CHOP) and whether it rolls are not recipes, so they have their own row below, between rules.
  const perRow = 6;
  const bw = Math.floor((W - 8 - (perRow - 1) * 2) / perRow);
  const styleBtns = STYLES.map((s, i) => {
    const def = STYLE_DEFS[s];
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return new Button(b, [4 + col * (bw + 2), 1 + row * 14, bw, 13], def.label, {
      cls: 'small',
      tip: `${def.label} (${tempoRange(s)}): ${def.blurb} Choosing it sets every control to its defaults and picks a tempo from its range (not with TEMPO LOCK). The genre name is a tendency, not a promise of authenticity.`,
      onPress: () => app.setStyle(s),
    });
  });
  const random = new Button(b, [4 + 5 * (bw + 2), 15, bw, 13], 'RANDOM', {
    cls: 'small',
    tip: 'RANDOM RECIPE: pick a different recipe at random and bake a new break with it. The length, kit and CHOP settings stay, FREEZE is respected, and ⌘Z undoes it.',
    onPress: () => void app.randomRecipe(),
  });
  random.el.setAttribute('aria-label', 'Random recipe');
  el('div', 'rule', b, [4, 30, W - 8]);

  const y2 = 32;
  label(b, 5, y2 + 4, 'BPM');
  const bpm = new NumBox(b, [24, y2, 30, 15], {
    get: () => app.recipe.bpm,
    set: (v) => app.setRecipe({ bpm: v }),
    min: 40,
    max: 220,
    label: 'Tempo, beats per minute',
    tip: 'Tempo, 40–220 BPM. Click and type a value, then Return (Escape cancels); ↑ ↓ step it (Shift: by 10); drag up/down or scroll to sweep it. The box always sets it, TEMPO LOCK or not.',
  });
  const lock = new Button(b, [56, y2, 30, 15], 'LOCK', {
    cls: 'small',
    tip: 'TEMPO LOCK: keep this tempo when choosing a recipe, with RANDOM RECIPE, WILDCARD and REGEN (BAKE never changes it). The BPM box still sets it. An external MIDI clock sets the playing tempo either way.',
    onPress: () => app.setTempoLock(!app.tempoLock),
  });
  lock.el.setAttribute('aria-label', 'Tempo lock');
  const tdice = new Button(b, [88, y2, 24, 15], 'RND', {
    cls: 'small',
    tip: 'TEMPO DICE: a new tempo from the recipe’s range, for the same break (the pattern is not regenerated). Not with TEMPO LOCK on.',
    onPress: () => void app.diceTempo(),
  });
  tdice.el.setAttribute('aria-label', 'Roll a new tempo');

  label(b, 117, y2 + 4, 'BARS');
  const bars = new NumBox(b, [140, y2, 18, 15], {
    get: () => app.recipe.bars,
    set: (v) => app.setRecipe({ bars: v as Bars }),
    min: MIN_BARS,
    max: MAX_BARS,
    pxPerUnit: 8,
    label: 'Pattern length in bars',
    tip: 'Pattern length, 1–8 bars. Click and type, or ↑ ↓. The phrase is built to the length, not by stacking bars.',
  });

  label(b, 163, y2 + 4, 'SEED');
  const bx = W - 4 - 24 - 2 - 12 - 1 - 12 - 2 - 26;
  const seed = new NumBox(b, [186, y2, bx - 2 - 186, 15], {
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
    tip: 'The seed: a number, or any words ("funky chicken", "glasgow 1993"). The same seed and recipe always bake the same break. Click and type, then Return. ↑ ↓ step to neighbouring numbers (not related breaks: MUTATE makes those). +N = mutations.',
  });
  const dice = new Button(b, [bx, y2, 26, 15], 'DICE', { cls: 'small', tip: 'DICE: roll a new named seed for every layer (D)', onPress: () => app.dice() });
  const back = new Button(b, [bx + 28, y2, 12, 15], '◀', { cls: 'small', tip: 'Back to the previous seed in the history (←)', onPress: () => app.historyBack() });
  const fwd = new Button(b, [bx + 41, y2, 12, 15], '▶', { cls: 'small', tip: 'Forward in the history (→)', onPress: () => app.historyForward() });
  const fav = new Button(b, [W - 4 - 24, y2, 24, 15], 'FAV', { cls: 'small', tip: 'Save this break to the favourites (S): recipe, seeds, mutations and sample settings. Inverted when it is one; press again to remove it. Favourites are in the Seeds menu.', onPress: () => app.toggleFavourite() });

  el('div', 'rule', b, [4, 49, W - 8]);
  const chopBtn = new Button(b, [4, 51, bw + 20, 13], 'CHOP OFF', {
    cls: 'small',
    tip: 'CHOP: the transformation. It re-arranges the GROOVE’s phrase (recalls, swaps, repeats, retriggers, drop-outs). Opens the CHOP tab.',
    onPress: () => win.setTab(TAB.chop),
  });
  const rollsBtn = new Button(b, [4 + bw + 23, 51, bw + 20, 13], 'ROLLS OFF', {
    cls: 'small',
    tip: 'ROLL GENERATION: off until you switch it on, and kept as you set it whatever the recipe. Toms do not need it (TOM ACTIVITY). Opens the ROLLS tab.',
    onPress: () => win.setTab(TAB.rolls),
  });
  const cymBtn = new Button(b, [4 + 2 * (bw + 23), 51, bw + 28, 13], 'HATS · RIDE', {
    cls: 'small',
    tip: 'HI-HAT and RIDE ACTIVITY, and how they share the time. Opens the CYMBALS tab.',
    onPress: () => win.setTab(TAB.cymbals),
  });
  const gx = 4 + 2 * (bw + 23) + bw + 31;
  const genNote = el('div', 'label tiny', b, [gx, 55, W - 4 - 76 - gx]);
  const useGroove = new Button(b, [W - 4 - 72, 51, 72, 13], 'USE GROOVE', {
    cls: 'small',
    tip: 'USE CURRENT GROOVE: this break was made by the first release’s generator (LEGACY) and plays exactly as it did. This re-bakes the same seed and controls with today’s GROOVE. One way; ⌘Z returns to the legacy break.',
    onPress: () => app.useCurrentGroove(),
  });
  useGroove.el.setAttribute('aria-label', 'Use current GROOVE');
  el('div', 'rule', b, [4, 66, W - 8]);

  // the eight controls in two columns, and TOM ACTIVITY (the toms are instruments, so they are part of the recipe)
  const ranges: RangeBar[] = [];
  const colW = Math.floor((W - 16) / 2);
  const rangeAt = (i: number, key: RecipeKey, text: string, o: Omit<ConstructorParameters<typeof RangeBar>[2], 'get' | 'set' | 'label'>) => {
    const col = Math.floor(i / 5);
    const x = 4 + col * (colW + 8);
    const y = 69 + (i % 5) * 15;
    label(b, x + 1, y + 3, text);
    ranges.push(
      new RangeBar(b, [x + 74, y, colW - 74, 14], {
        get: () => app.recipe[key],
        // baking is cheap (about a millisecond), so the break follows the drag
        set: (v) => app.setRecipe({ [key]: v }),
        label: text,
        ...o,
      }),
    );
  };
  CONTROLS.forEach((c, i) => rangeAt(i < 4 ? i : i + 1, c.key, c.label, { format: c.format ?? pct, parse: c.parse, tip: c.tip }));
  rangeAt(4, 'toms', 'TOM ACTIVITY', {
    format: pct,
    tip: 'TOM ACTIVITY: how prominent the high, mid and low toms are. 0 = no toms; 20% an occasional short phrase; 50% noticeable phrases; 100% a tom phrase in most bars. More means more phrases, longer ones and more voices: fills into the next bar (descending and rising runs, snare into toms, snare and toms in turn, linear fills, dotted-eighth groupings) and, inside the bar, answers to the backbeat and off-beat accents. The recipe shapes them. Independent of ROLLS; a kit with fewer than three toms plays its phrases on the toms it has. Turning it up changes nothing else in the break.',
  });
  const tomNote = el('div', 'label tiny', b, [4 + colW + 8 + 1, 69 + 4 * 15 + 4, colW - 2]);

  function update(): void {
    styleBtns.forEach((btn, i) => {
      btn.on = STYLES[i] === app.recipe.style;
    });
    const c = app.chop;
    chopBtn.on = app.chopped;
    chopBtn.text = c.on ? `CHOP ${Math.round(c.amount * 100)}% ${c.slice.toUpperCase()}` : 'CHOP OFF';
    rollsBtn.on = app.rollGeneration && !app.legacy;
    rollsBtn.text = app.legacy ? 'NO ROLLS' : app.rollGeneration ? 'ROLLS ON' : 'ROLLS OFF';
    useGroove.el.style.display = app.legacy ? '' : 'none';
    cymBtn.text = app.legacy ? 'LEGACY CYMBALS' : `HATS ${Math.round(hatActivity(app.recipe) * 100)}% RIDE ${Math.round(rideActivity(app.recipe) * 100)}%`;
    cymBtn.on = false;
    lock.on = app.tempoLock;
    tdice.disabled = app.tempoLock;
    setTip(tdice.el, app.tempoLock ? 'TEMPO DICE is off while TEMPO LOCK is on: unlock it to roll a new tempo (the BPM box still sets it).' : `TEMPO DICE: a new tempo from ${STYLE_DEFS[app.recipe.style].label}’s range (${tempoRange(app.recipe.style)}), for the same break. The pattern is not regenerated.`);
    genNote.textContent = app.legacy ? 'FIRST-RELEASE BREAK' : app.chopLocked && app.chopped ? 'CHOP APPLIED' : '';
    bpm.update();
    bars.update();
    seed.update();
    setTipBars();
    back.disabled = !app.history.canBack;
    fwd.disabled = !app.history.canForward;
    fav.on = app.isFavourite;
    dice.on = false;
    ranges.forEach((r) => r.update());
    const kit = app.ingredients.kit();
    const have = TOMS.filter((t) => kit[t].length);
    const tomHits = app.current.events.filter((e) => (TOMS as readonly string[]).includes(e.cat)).length;
    tomNote.textContent = app.legacy ? 'LEGACY BREAK: NO TOMS' : `${tomHits} TOM HIT${tomHits === 1 ? '' : 'S'} · SAMPLES ${have.length}/3`;
    setTip(tomNote, have.length === 3 ? 'High, mid and low tom samples are loaded (INGREDIENTS). Tom hits follow their MIXER channels and MIDI notes.' : `No sample for ${TOMS.filter((t) => !kit[t].length).map((t) => CATEGORY_LABEL[t]).join(', ')}: those hits are silent until one is loaded (INGREDIENTS), or the demo kit is added.`);
    if (win.tab === TAB.cymbals) cymbals.update();
    if (win.tab === TAB.persona) persona.update();
    if (win.tab === TAB.chop) chop.update();
    if (win.tab === TAB.rolls) rolls.update();
    if (win.tab === TAB.mutate) mut.update();
  }
  function setTipBars(): void {
    bars.el.dataset.tip = `Pattern length, 1–8 bars (now ${app.recipe.bars}: ${BAR_PLAN[app.recipe.bars]}). Click and type, or ↑ ↓.`;
  }
  update();
  return { update, win };
}
