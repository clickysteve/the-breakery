/**
 * ROLLS (a tab of the RECIPE window): roll generation. ROLL GENERATION switches every new roll on
 * and off (the ROLLS layer, the fills' rolls, CHOP's retriggers). It is the user's preference: off
 * until switched on, and kept through recipe changes, new breaks and reloads; no recipe turns it
 * on. Off, new breaks get no rolls and the rolls already in the pattern are kept until CLEAR ROLLS
 * deletes them. Then how likely rolls are, how long and fast, their dynamics, where they go and
 * which drums roll: part of the recipe, every change re-bakes the same seeds.
 *
 * Two pages: SETTINGS (where rolls go and which drums roll) and EXPRESSION (how every roll moves:
 * a preset, or its pitch, velocity and timing contours, RATCHET and REVERSE by hand; DICE draws a
 * new expression from a new seed). EXPRESSION reshapes the rolls in the pattern, including the
 * fills' rolls; it never adds a roll, so ROLL GENERATION off stays off.
 */
import { toggleTarget } from '../engine/generate';
import { describeExpr, PITCH_CONTOUR_LABEL, PITCH_CONTOURS, RATCHETS, REVERSE_MODE_LABEL, REVERSE_MODES, ROLL_PRESET_LABEL, ROLL_PRESETS, TIMING_CONTOUR_LABEL, TIMING_CONTOURS, VEL_CONTOUR_LABEL, VEL_CONTOURS, type PitchContour, type ReverseMode, type TimingContour, type VelContour } from '../engine/rollExpr';
import { MAX_PITCH } from '../engine/types';
import { CATEGORY_LABEL, MAX_ROLL, MIN_ROLL, ROLL_DYNAMICS, ROLL_PLACES, ROLL_SPEED_LABEL, ROLL_SPEEDS, ROLL_TARGETS, TOMS, type RollDynamics, type RollPlace, type RollSpeed, type RollTarget } from '../engine/types';
import { el, label, setTip } from './dom';
import { GemSelect } from './gemSelect';
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
  // two pages under the header: SETTINGS and EXPRESSION
  const page = (): HTMLDivElement => {
    const p = el('div', '', b, [0, 0, W, 112]);
    p.style.position = 'absolute';
    return p;
  };
  const pg1 = page();
  const pg2 = page();
  let expr = false;
  let host: HTMLElement = pg1;
  const sel = (x: number, y: number, w: number, aria: string, options: readonly string[], text: (o: string) => string, set: (v: string) => void) => {
    return new GemSelect(host, [x, y, w, 14], { label: aria, fontSize: 8, options: options.map((o) => ({ value: o, label: text(o) })), onChange: set });
  };
  const on = () => app.rollGeneration;

  // ---- ROLL GENERATION: the master switch, and deleting rolls (a different thing)
  label(b, 5, 6, 'ROLL GENERATION', 'head');
  const enable = new Button(b, [90, 3, 58, 14], 'ENABLED', {
    cls: 'small',
    tip: 'ROLL GENERATION: off until you switch it on, and it stays as you set it (changing recipe, RANDOM RECIPE, BAKE, BATCH, seeds, MUTATE, CHOP and reloading never change it). On, the ROLLS settings add rolls to every break; off, new breaks get no rolls at all: fills play their rolls as plain fills, and CHOP makes no retrigger rolls. Toms do not need it (RECIPE ▸ TOM ACTIVITY). Turning it off does not delete the rolls already in this pattern: they are kept as hits, and CLEAR ROLLS deletes them. ⌘Z undoes either.',
    onPress: () => app.setRollsOn(!on()),
  });
  const pageBtns = (['SETTINGS', 'EXPRESSION'] as const).map((t, i) => new Button(b, [154 + i * 60, 3, i ? 66 : 56, 14], t, {
    cls: 'small',
    tip: i ? 'EXPRESSION: how every roll moves: presets, pitch, velocity and timing contours, RATCHET, REVERSE and DICE.' : 'SETTINGS: how likely rolls are, how long and fast, where they go and which drums roll.',
    onPress: () => {
      expr = i === 1;
      update();
    },
  }));
  const clear = new Button(b, [W - 4 - 72, 3, 72, 14], 'CLEAR ROLLS', {
    cls: 'small',
    tip: 'CLEAR ROLLS: delete every roll hit in this pattern (from ROLLS, from fills, or kept when generation was turned off). ROLL GENERATION is not changed. ⌘Z brings them back.',
    onPress: () => app.clearRolls(),
  });
  el('div', 'rule', b, [4, 21, W - 8]);

  // ---- the settings, in two columns
  const c2 = Math.floor(W / 2) + 4;
  label(pg1, 5, 29, 'PROBABILITY');
  const amount = new RangeBar(pg1, [72, 26, W - 76, 14], {
    get: () => app.recipe.rolls,
    set: (v) => app.setRecipe({ rolls: v }),
    format: pct,
    label: 'Roll probability',
    tip: 'PROBABILITY: how readily rolls come at the places PLACEMENT allows. 0 = no new rolls. The recipe has its own appetite for rolls (jungle, D&B and breakcore most); this setting scales it. Every roll is real hits, editable in the PATTERN.',
  });
  label(pg1, 5, 47, 'LENGTH');
  const length = new NumBox(pg1, [72, 44, 24, 14], {
    get: () => app.recipe.rollLength,
    set: (v) => app.setRecipe({ rollLength: v }),
    min: MIN_ROLL,
    max: MAX_ROLL,
    pxPerUnit: 6,
    label: 'Hits per roll',
    tip: `LENGTH: hits per roll, ${MIN_ROLL}–${MAX_ROLL}. A roll never runs past the bar line or over the hit it leads into (it is shortened). Click and type, or ↑ ↓.`,
  });
  label(pg1, 100, 47, 'HITS');
  label(pg1, c2, 47, 'SPEED');
  const speed = sel(c2 + 58, 44, W - 4 - c2 - 58, 'Roll speed', ROLL_SPEEDS, (o) => ROLL_SPEED_LABEL[o as RollSpeed], (v) => app.setRecipe({ rollSpeed: v as RollSpeed }));
  setTip(speed.el, 'SPEED: the subdivision of a roll’s strokes: sixteenths, sixteenth triplets, 32nds, 32nd triplets, 64ths. The strokes keep that spacing exactly (they are not put back on the sixteenth grid).');
  label(pg1, 5, 65, 'DYNAMICS');
  const dyn = sel(72, 62, c2 - 8 - 72, 'Roll dynamics', ROLL_DYNAMICS, (o) => DYN_LABEL[o as RollDynamics], (v) => app.setRecipe({ rollDynamics: v as RollDynamics }));
  label(pg1, c2, 65, 'PLACEMENT');
  const place = sel(c2 + 58, 62, W - 4 - c2 - 58, 'Where rolls go', ROLL_PLACES, (o) => PLACE_LABEL[o as RollPlace], (v) => app.setRecipe({ rollPlace: v as RollPlace }));

  label(pg1, 5, 85, 'TARGET TRACKS');
  const tw = Math.floor((W - 8 - 4 * 3) / 5);
  const targets = ROLL_TARGETS.map((t, i) => new Button(pg1, [4 + i * (tw + 3), 95, i === 4 ? W - 8 - 4 * (tw + 3) : tw, 14], TARGET_LABEL[t], { cls: 'small', tip: `${TARGET_TIP[t]}. Inverted: these may roll. The recipe weighs between the drums you allow.`, onPress: () => app.setRecipe({ rollTargets: toggleTarget(app.recipe.rollTargets, t) }) }));

  // ---- EXPRESSION
  host = pg2;
  const c2e = Math.floor(W / 2) + 4;
  label(pg2, 5, 29, 'PRESET');
  const preset = new GemSelect(pg2, [72, 26, c2e - 8 - 72, 14], {
    label: 'Roll expression preset',
    fontSize: 8,
    options: [...ROLL_PRESETS.map((p) => ({ value: p, label: ROLL_PRESET_LABEL[p] })), { value: 'custom', label: 'CUSTOM', disabled: true }],
    onChange: (v) => v !== 'custom' && app.rollPreset(v as (typeof ROLL_PRESETS)[number]),
  });
  setTip(preset.el, 'PRESET: CLASSIC (rolls as generated), PITCH DIVE, PITCH RISE, TUMBLE, STUTTER, ACCELERATE, DECELERATE, FADE AWAY, SWELL, PING-PONG, REVERSE BURST, CHAOS. Changing any setting below makes it CUSTOM.');
  const dice = new Button(pg2, [c2e, 26, 40, 14], 'DICE', { cls: 'small', tip: 'DICE: a new expression for the rolls, drawn from a new seed (the same seed always gives the same expression). Only the rolls change. ⌘Z undoes.', onPress: () => app.diceRolls() });
  const take = el('div', 'label tiny', pg2, [c2e + 46, 30, W - c2e - 50]);
  label(pg2, 5, 47, 'PITCH');
  const pitch = sel(72, 44, c2e - 8 - 72, 'Roll pitch contour', PITCH_CONTOURS, (o) => PITCH_CONTOUR_LABEL[o as PitchContour], (v) => app.setRollExpr({ pitch: v as PitchContour }));
  setTip(pitch.el, 'PITCH contour across each roll, between START and END (semitones, by playback rate): FLAT (all at START), RISE, FALL, UP-DOWN, DOWN-UP, STAIRCASE, PING-PONG, RANDOM (seeded: DICE takes another).');
  label(pg2, c2e, 47, 'START');
  const nb = (x: number, get: () => number, set: (v: number) => void, aria: string) => new NumBox(pg2, [x, 44, 28, 14], { get, set, min: -MAX_PITCH, max: MAX_PITCH, pxPerUnit: 3, format: (v) => `${v > 0 ? '+' : ''}${v}`, label: aria, tip: `${aria}: semitones, ±${MAX_PITCH}.` });
  const from = nb(c2e + 32, () => app.rollExpr.from, (v) => app.setRollExpr({ from: v }), 'Pitch START');
  label(pg2, c2e + 66, 47, 'END');
  const to = nb(c2e + 86, () => app.rollExpr.to, (v) => app.setRollExpr({ to: v }), 'Pitch END');
  label(pg2, c2e + 118, 47, 'ST');
  label(pg2, 5, 65, 'VELOCITY');
  const vel = sel(72, 62, c2e - 8 - 72, 'Roll velocity contour', VEL_CONTOURS, (o) => VEL_CONTOUR_LABEL[o as VelContour], (v) => app.setRollExpr({ vel: v as VelContour }));
  setTip(vel.el, 'VELOCITY contour: AS ROLLED (the SETTINGS page’s DYNAMICS), FLAT, FADE IN, FADE OUT, SWELL, ACCENT (the strokes on the sixteenths), RANDOM. Never louder than the roll’s own loudest stroke, so a ghost roll stays a ghost.');
  label(pg2, c2e, 65, 'TIMING');
  const timing = sel(c2e + 58, 62, W - 4 - c2e - 58, 'Roll timing contour', TIMING_CONTOURS, (o) => TIMING_CONTOUR_LABEL[o as TimingContour], (v) => app.setRollExpr({ timing: v as TimingContour }));
  setTip(timing.el, 'TIMING of the strokes inside the roll’s own span (never past the hit it leads into): EVEN, ACCELERATE, DECELERATE, SWING (long-short), CHAOTIC (a seeded repeating figure). Strokes stay on the grid ticks, the rest goes into their microtiming.');
  label(pg2, 5, 83, 'RATCHET');
  const ratchet = sel(72, 80, c2e - 8 - 72, 'Strokes per roll', RATCHETS.map(String), (o) => (o === '0' ? 'AS ROLLED' : `×${o}`), (v) => app.setRollExpr({ ratchet: Number(v) }));
  setTip(ratchet.el, 'RATCHET: strokes per roll (2, 3, 4, 5, 6, 8, 12, 16) over the same span: the roll ratchets faster or slower. AS ROLLED keeps its own count (SETTINGS ▸ LENGTH and SPEED).');
  label(pg2, c2e, 83, 'REVERSE');
  const reverse = sel(c2e + 58, 80, W - 4 - c2e - 58, 'Reversed strokes', REVERSE_MODES, (o) => REVERSE_MODE_LABEL[o as ReverseMode], (v) => app.setRollExpr({ reverse: v as ReverseMode }));
  setTip(reverse.el, 'REVERSE: every stroke forwards, all reversed, alternate strokes, or the last one reversed (a reverse swell into the hit). Single hits are reversed in the PATTERN (shift+click a hit, REV).');
  const exprLine = el('div', 'label tiny', pg2, [5, 101, W - 10]);
  host = b;

  el('div', 'rule', b, [4, 114, W - 8]);
  const count = el('div', 'label', b, [5, 119, W - 10]);
  const note = el('div', 'label tiny', b, [5, 132, W - 10]);
  const settings = [amount.el, length.el, speed.el, dyn.el, place.el, ...targets.map((t) => t.el)];

  function update(): void {
    const r = app.recipe;
    const e1 = app.legacy;
    pg1.style.display = expr ? 'none' : '';
    pg2.style.display = expr ? '' : 'none';
    pageBtns.forEach((p, i) => (p.on = (i === 1) === expr));
    const x = app.rollExpr;
    preset.value = x.preset;
    pitch.value = x.pitch;
    from.update();
    to.update();
    vel.value = x.vel;
    timing.value = x.timing;
    ratchet.value = String(x.ratchet);
    reverse.value = x.reverse;
    dice.disabled = e1;
    take.textContent = x.variant ? `TAKE ${x.variant}` : '';
    exprLine.textContent = describeExpr(r.rollExpr).toUpperCase();
    const live = on() && !e1;
    enable.text = on() ? 'ENABLED' : 'DISABLED';
    enable.on = on();
    amount.update();
    length.update();
    speed.value = r.rollSpeed;
    dyn.value = r.rollDynamics;
    place.value = r.rollPlace;
    setTip(dyn.el, `DYNAMICS: ${DYN_TIP[r.rollDynamics]}. Faster rolls are played softer, so they do not pile up into a roar.`);
    setTip(place.el, `PLACEMENT: ${PLACE_TIP[r.rollPlace]}`);
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
        ? 'GENERATION OFF: NO NEW ROLLS (YOUR SETTING, KEPT) · EXISTING ROLLS ARE KEPT'
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
