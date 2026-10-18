/**
 * ROLLS · TOMS: the controls for rolls (how many, how long, how fast, their dynamics, where they
 * go and which drums roll) and for the toms' part in fills. Both are part of the recipe: every
 * change re-bakes the same seeds, so you hear what the control does to this break.
 */
import { toggleTarget } from '../engine/generate';
import { CATEGORY_LABEL, MAX_ROLL, MIN_ROLL, ROLL_DYNAMICS, ROLL_PLACES, ROLL_SPEED_LABEL, ROLL_SPEEDS, ROLL_TARGETS, TOMS, type RollDynamics, type RollPlace, type RollSpeed, type RollTarget } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, MWindow, NumBox, RangeBar } from './widgets';
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
const TARGET_LABEL: Record<RollTarget, string> = { snare: 'SNR', hat: 'HAT', perc: 'PRC', tom: 'TOM', kick: 'KCK' };
const TARGET_TIP: Record<RollTarget, string> = {
  snare: 'SNARE rolls: anticipating the backbeat, bursts in jungle and D&B, the roll into the top',
  hat: 'HAT rolls (the timekeeper, hat or ride): a flurry that pushes the groove forward',
  perc: 'PERCUSSION rolls: short flurries on the percussion sound',
  tom: 'TOM rolls: rolls round the toms, descending at the end of a phrase',
  kick: 'KICK rolls: double and triple kicks into a strong beat (hardcore, breakcore)',
};

export function rollsWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'ROLLS · TOMS', ...rect });
  const b = win.body;
  const W = rect.w - 2;
  const sel = (x: number, y: number, w: number, aria: string, options: readonly string[], text: (o: string) => string, set: (v: string) => void) => {
    const s = el('select', 'mselect', b);
    Object.assign(s.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: '13px', fontSize: '8px' });
    s.setAttribute('aria-label', aria);
    for (const o of options) {
      const op = el('option', '', s, undefined, text(o));
      op.value = o;
    }
    s.addEventListener('pointerdown', (e) => e.stopPropagation());
    s.addEventListener('change', () => set(s.value));
    return s;
  };

  label(b, 5, 6, 'AMOUNT');
  const amount = new RangeBar(b, [44, 3, W - 48, 14], {
    get: () => app.recipe.rolls,
    set: (v) => app.setRecipe({ rolls: v }),
    format: pct,
    label: 'Roll amount',
    tip: 'ROLLS: how many rolls. 0 = none. Every roll is real hits: select, move, delete or change them in the PATTERN like any other. The recipe says how readily rolls come (jungle, D&B and breakcore most).',
  });
  label(b, 5, 24, 'LENGTH');
  const length = new NumBox(b, [44, 21, 22, 14], {
    get: () => app.recipe.rollLength,
    set: (v) => app.setRecipe({ rollLength: v }),
    min: MIN_ROLL,
    max: MAX_ROLL,
    pxPerUnit: 6,
    label: 'Hits per roll',
    tip: `LENGTH: hits per roll, ${MIN_ROLL}–${MAX_ROLL}. A roll never runs past the bar line or over the hit it leads into (it is shortened). Click and type, or ↑ ↓.`,
  });
  label(b, 70, 24, 'SPEED');
  const speed = sel(98, 22, W - 102, 'Roll speed', ROLL_SPEEDS, (o) => ROLL_SPEED_LABEL[o as RollSpeed], (v) => app.setRecipe({ rollSpeed: v as RollSpeed }));
  setTip(speed, 'SPEED: the subdivision of a roll’s strokes: sixteenths, sixteenth triplets, 32nds, 32nd triplets, 64ths. The strokes keep that spacing exactly (they are not put back on the sixteenth grid).');
  label(b, 5, 42, 'SHAPE');
  const dyn = sel(44, 40, W - 48, 'Roll dynamics', ROLL_DYNAMICS, (o) => DYN_LABEL[o as RollDynamics], (v) => app.setRecipe({ rollDynamics: v as RollDynamics }));
  label(b, 5, 60, 'PLACE');
  const place = sel(44, 58, W - 48, 'Where rolls go', ROLL_PLACES, (o) => PLACE_LABEL[o as RollPlace], (v) => app.setRecipe({ rollPlace: v as RollPlace }));
  const tw = Math.floor((W - 8 - 4 * 2) / 5);
  const targets = ROLL_TARGETS.map((t, i) => new Button(b, [4 + i * (tw + 2), 76, tw, 13], TARGET_LABEL[t], { cls: 'small', tip: `${TARGET_TIP[t]}. On: these may roll. The recipe weighs between the drums you allow.`, onPress: () => app.setRecipe({ rollTargets: toggleTarget(app.recipe.rollTargets, t) }) }));

  const sep = el('div', '', b, [4, 95, W - 8, 1]);
  sep.style.borderTop = '1px dotted var(--ink)';
  label(b, 5, 103, 'TOMS');
  const toms = new RangeBar(b, [44, 100, W - 48, 14], {
    get: () => app.recipe.toms,
    set: (v) => app.setRecipe({ toms: v }),
    format: pct,
    label: 'Tom activity',
    tip: 'TOMS: how much the toms take part, mostly in fills (descending and rising runs, snare/tom combinations, linear fills, answers to the backbeat). 0 = never. Needs FILLS for tom fills and VARIATION for toms in answer and development bars. Turning it up changes nothing else in the break.',
  });
  const note = el('div', 'label tiny', b, [5, 119, W - 10]);
  note.style.whiteSpace = 'normal';
  note.style.lineHeight = '8px';

  function update(): void {
    const r = app.recipe;
    const e1 = r.engine === 1;
    amount.update();
    toms.update();
    length.update();
    speed.value = r.rollSpeed;
    dyn.value = r.rollDynamics;
    place.value = r.rollPlace;
    setTip(dyn, `SHAPE: ${DYN_TIP[r.rollDynamics]}. Faster rolls are played softer, so they do not pile up into a roar.`);
    setTip(place, `PLACE: ${PLACE_TIP[r.rollPlace]}`);
    targets.forEach((t, i) => (t.on = r.rollTargets.includes(ROLL_TARGETS[i]!)));
    for (const c of [amount.el, toms.el, length.el, speed, dyn, place, ...targets.map((t) => t.el)]) c.style.opacity = e1 ? '0.4' : '1';
    const kit = app.ingredients.kit();
    const missing = TOMS.filter((t) => !kit[t].length);
    const tomHits = app.current.events.filter((e) => e.cat === 'htom' || e.cat === 'mtom' || e.cat === 'ltom').length;
    const rollHits = app.current.events.filter((e) => e.role === 'roll').length;
    note.textContent = e1
      ? 'ENGINE 1 HAS NO ROLLS OR TOMS: SWITCH TO ENGINE 2'
      : missing.length === 3 && (r.toms > 0 || r.rollTargets.includes('tom'))
        ? 'NO TOM SAMPLES: TOM HITS ARE SILENT · LOAD TOMS OR ADD THE DEMO KIT'
        : missing.length
          ? `NO SAMPLE FOR ${missing.map((t) => CATEGORY_LABEL[t]).join(', ')}: SILENT`
          : `THIS BREAK: ${rollHits} ROLL HIT${rollHits === 1 ? '' : 'S'} · ${tomHits} TOM HIT${tomHits === 1 ? '' : 'S'}`;
  }
  update();
  return { update, win };
}
