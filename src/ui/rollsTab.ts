/**
 * ROLLS (a tab of the RECIPE window): roll generation. ROLL GENERATION switches the ROLLS layer
 * on and off (off: new breaks get no rolls; the rolls already in the pattern are kept until CLEAR
 * ROLLS deletes them), then how likely rolls are, how long and fast, their dynamics, where they go
 * and which drums roll. Part of the recipe: every change re-bakes the same seeds.
 */
import { toggleTarget } from '../engine/generate';
import { CATEGORY_LABEL, MAX_ROLL, MIN_ROLL, ROLL_DYNAMICS, ROLL_PLACES, ROLL_SPEED_LABEL, ROLL_SPEEDS, ROLL_TARGETS, TOMS, type RollDynamics, type RollPlace, type RollSpeed, type RollTarget } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, NumBox, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const DYN_LABEL: Record<RollDynamics, string> = { even: 'EVEN', crescendo: 'CRESCENDO', decrescendo: 'DECRESCENDO', alternating: 'ALTERNATING', human: 'HUMAN' };
const DYN_TIP: Record<RollDynamics, string> = {
  even: 'EVEN: every stroke at the same level, like a machine',
  crescendo: 'CRESCENDO: growing into the hit it leads to',
  decrescendo: 'DECRESCENDO: a burst that dies away',
  alternating: 'ALTERNATING: strong and weak strokes in turn (two hands)',
  human: 'HUMAN: a player’s roll: growing, uneven, the strokes a touch loose in time',
};
const PLACE_LABEL: Record<RollPlace, string> = { accent: 'BEFORE ACCENT', phrase: 'PHRASE END', fills: 'FILLS', anywhere: 'ANYWHERE' };
const PLACE_TIP: Record<RollPlace, string> = {
  accent: 'BEFORE ACCENT: a roll leads into a strong hit (a backbeat, the downbeat), ending just before it',
  phrase: 'PHRASE END: rolls at the end of the phrase (and of its four-bar sections), into the top of the loop',
  fills: 'FILLS: rolls inside the fill bars (the turnaround and the half-way fill)',
  anywhere: 'ANYWHERE: any of these, in any bar but the very first groove bar',
};
export const TARGET_LABEL: Record<RollTarget, string> = { snare: 'SNARE', hat: 'HATS', perc: 'PERC', tom: 'TOMS', kick: 'KICK' };
const TARGET_TIP: Record<RollTarget, string> = {
  snare: 'SNARE rolls: anticipating the backbeat, bursts in jungle and D&B, the roll into the top',
  hat: 'HATS rolls (the timekeeper: closed hat or ride): a flurry that pushes the groove forward',
  perc: 'PERC rolls: short flurries on the percussion sound',
  tom: 'TOMS rolls: round the high, mid and low toms, descending at the end of a phrase',
  kick: 'KICK rolls: double and triple kicks into a strong beat (hardcore, breakcore)',
};

export function rollsTab(b: HTMLElement, ui: UiContext, W: number) {
  const { app } = ui;
  const sel = (x: number, y: number, w: number, aria: string, options: readonly string[], text: (o: string) => string, set: (v: string) => void) => {
    const s = el('select', 'mselect', b);
    Object.assign(s.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: '14px', fontSize: '8px' });
    s.setAttribute('aria-label', aria);
    for (const o of options) {
      const op = el('option', '', s, undefined, text(o));
      op.value = o;
    }
    s.addEventListener('pointerdown', (e) => e.stopPropagation());
    s.addEventListener('change', () => set(s.value));
    return s;
  };
  const on = () => app.recipe.rollsOn !== false;

  // ---- ROLL GENERATION: the master switch, and deleting rolls (a different thing)
  label(b, 5, 6, 'ROLL GENERATION', 'head');
  const enable = new Button(b, [90, 3, 58, 14], 'ENABLED', {
    cls: 'small',
    tip: 'ROLL GENERATION: on, the ROLLS settings add rolls to every break; off, new breaks (BAKE, BATCH, a seed, MUTATE) get no rolls. Turning it off does not delete the rolls already in this pattern: they are kept as hits, and CLEAR ROLLS deletes them. ⌘Z undoes either.',
    onPress: () => app.setRollsOn(!on()),
  });
  const clear = new Button(b, [W - 4 - 72, 3, 72, 14], 'CLEAR ROLLS', {
    cls: 'small',
    tip: 'CLEAR ROLLS: delete every roll hit in this pattern (from ROLLS, from fills, or kept when generation was turned off). ROLL GENERATION is not changed. ⌘Z brings them back.',
    onPress: () => app.clearRolls(),
  });
  el('div', 'rule', b, [4, 21, W - 8]);

  // ---- the settings, in two columns
  const c2 = Math.floor(W / 2) + 4;
  label(b, 5, 29, 'PROBABILITY');
  const amount = new RangeBar(b, [72, 26, W - 76, 14], {
    get: () => app.recipe.rolls,
    set: (v) => app.setRecipe({ rolls: v }),
    format: pct,
    label: 'Roll probability',
    tip: 'PROBABILITY: how readily rolls come at the places PLACEMENT allows. 0 = no new rolls. The recipe has its own appetite for rolls (jungle, D&B and breakcore most); this setting scales it. Every roll is real hits, editable in the PATTERN.',
  });
  label(b, 5, 47, 'LENGTH');
  const length = new NumBox(b, [72, 44, 24, 14], {
    get: () => app.recipe.rollLength,
    set: (v) => app.setRecipe({ rollLength: v }),
    min: MIN_ROLL,
    max: MAX_ROLL,
    pxPerUnit: 6,
    label: 'Hits per roll',
    tip: `LENGTH: hits per roll, ${MIN_ROLL}–${MAX_ROLL}. A roll never runs past the bar line or over the hit it leads into (it is shortened). Click and type, or ↑ ↓.`,
  });
  label(b, 100, 47, 'HITS');
  label(b, c2, 47, 'SPEED');
  const speed = sel(c2 + 58, 44, W - 4 - c2 - 58, 'Roll speed', ROLL_SPEEDS, (o) => ROLL_SPEED_LABEL[o as RollSpeed], (v) => app.setRecipe({ rollSpeed: v as RollSpeed }));
  setTip(speed, 'SPEED: the subdivision of a roll’s strokes: sixteenths, sixteenth triplets, 32nds, 32nd triplets, 64ths. The strokes keep that spacing exactly (they are not put back on the sixteenth grid).');
  label(b, 5, 65, 'DYNAMICS');
  const dyn = sel(72, 62, c2 - 8 - 72, 'Roll dynamics', ROLL_DYNAMICS, (o) => DYN_LABEL[o as RollDynamics], (v) => app.setRecipe({ rollDynamics: v as RollDynamics }));
  label(b, c2, 65, 'PLACEMENT');
  const place = sel(c2 + 58, 62, W - 4 - c2 - 58, 'Where rolls go', ROLL_PLACES, (o) => PLACE_LABEL[o as RollPlace], (v) => app.setRecipe({ rollPlace: v as RollPlace }));

  label(b, 5, 85, 'TARGET TRACKS');
  const tw = Math.floor((W - 8 - 4 * 3) / 5);
  const targets = ROLL_TARGETS.map((t, i) => new Button(b, [4 + i * (tw + 3), 95, i === 4 ? W - 8 - 4 * (tw + 3) : tw, 14], TARGET_LABEL[t], { cls: 'small', tip: `${TARGET_TIP[t]}. Inverted: these may roll. The recipe weighs between the drums you allow.`, onPress: () => app.setRecipe({ rollTargets: toggleTarget(app.recipe.rollTargets, t) }) }));

  el('div', 'rule', b, [4, 114, W - 8]);
  const count = el('div', 'label', b, [5, 119, W - 10]);
  const note = el('div', 'label tiny', b, [5, 132, W - 10]);
  const settings = [amount.el, length.el, speed, dyn, place, ...targets.map((t) => t.el)];

  function update(): void {
    const r = app.recipe;
    const e1 = app.legacy;
    const live = on() && !e1;
    enable.text = on() ? 'ENABLED' : 'DISABLED';
    enable.on = on();
    amount.update();
    length.update();
    speed.value = r.rollSpeed;
    dyn.value = r.rollDynamics;
    place.value = r.rollPlace;
    setTip(dyn, `DYNAMICS: ${DYN_TIP[r.rollDynamics]}. Faster rolls are played softer, so they do not pile up into a roar.`);
    setTip(place, `PLACEMENT: ${PLACE_TIP[r.rollPlace]}`);
    targets.forEach((t, i) => (t.on = r.rollTargets.includes(ROLL_TARGETS[i]!)));
    // settings of a switched-off generator look inactive (they still work, and are kept)
    for (const c of settings) c.classList.toggle('inactive', !live);
    enable.disabled = e1;
    const n = app.rollCount;
    clear.disabled = !n.hits;
    count.textContent = n.rolls ? `ROLLS IN CURRENT PATTERN: ${n.rolls} (${n.hits} HIT${n.hits === 1 ? '' : 'S'})` : 'NO ROLLS IN CURRENT PATTERN';
    setTip(count, 'Rolls in this pattern, from ROLLS, from fills (stutters and fill rolls), or kept by hand. A roll round the toms counts once. Tom hits that are not rolls are not counted (RECIPE ▸ TOM ACTIVITY).');
    const kit = app.ingredients.kit();
    const missing = TOMS.filter((t) => !kit[t].length);
    note.textContent = e1
      ? 'LEGACY BREAK: NO ROLLS · RECIPE ▸ USE GROOVE'
      : !on()
        ? 'GENERATION OFF: NEW BREAKS GET NO ROLLS · EXISTING ROLLS ARE KEPT'
        : r.rolls <= 0
          ? 'PROBABILITY 0: NO NEW ROLLS'
          : !r.rollTargets.length
            ? 'NO TARGET TRACKS: NO NEW ROLLS'
            : r.rollTargets.includes('tom') && missing.length
              ? `NO SAMPLE FOR ${missing.map((t) => CATEGORY_LABEL[t]).join(', ')}: SILENT`
              : 'EVERY ROLL HIT IS EDITABLE IN THE PATTERN';
  }
  update();
  return { update };
}
