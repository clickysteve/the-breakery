/**
 * CHOP (a tab of the RECIPE window): the first transformation. The GROOVE baked from the recipe is
 * the source; CHOP re-arranges its phrase (fragments recalled, swapped, repeated, doubled,
 * retriggered, dropped out) and the result is the pattern. Non-destructive: every change is
 * recalculated from the GROOVE with the same seeds, so AMOUNT 0 or ENABLED off is the GROOVE again.
 * Fixed (APPLIED) while the pattern has hand edits, which were made on the chopped result.
 *
 * DESTROY, under CHOP: stutters, reverses, pitch dives and rises, gates, skips, freezes and tape
 * stops after the chop (destroy.ts), with its own AMOUNT, STYLE and DICE. Fixed with CHOP.
 */
import { CHOP_STYLE, describeChop } from '../engine/chopper';
import { describeDestroy, DESTROY_STYLE_LABEL, DESTROY_STYLES } from '../engine/destroy';
import { STYLE_DEFS } from '../engine/styles';
import { SLICE_SIZES, SLICE_STEPS, type SliceSize, type Style } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const SLICE_TIP: Record<SliceSize, string> = {
  large: 'LARGE: half-bar fragments (often joined into whole bars): phrases moved and repeated, the groove kept whole',
  medium: 'MEDIUM: beat-sized fragments: swaps, repeats and short answers',
  small: 'SMALL: eighth-note fragments: syncopated repeats and snare-led edits',
  micro: 'MICRO: sixteenth fragments: stutters and fast re-edits, still on the grid',
};

/** What each recipe does with CHOP (the weights in CHOP_STYLE, in words). */
const STYLE_CHOP: Record<Style, string> = {
  funk: 'LONG FRAGMENTS, PHRASES REPEATED, THE BACKBEAT HELD',
  hiphop: 'MOTIFS REPEATED, SHORT VARIATIONS, DELIBERATE GAPS',
  jungle: 'SNARE-LED CUTS, SYNCOPATED REPEATS, FAST RETRIGGERS',
  broken: 'DISPLACED FRAGMENTS AND SWAPS, THE BACKBEAT LOOSENED',
  boombap: 'MOTIFS REPEATED, DROP-OUTS, THE BACKBEAT HELD',
  hardcore: 'SNARE CUTS, REPEATS AND RETRIGGERS INTO THE TOP',
  dnb: 'DRIVE KEPT, CONTROLLED EDITS, CUTS AT THE TURNAROUND',
  halftime: 'SPACE AND GAPS, TRIPLET RETRIGGERS, THE BACKBEAT HELD',
  garage: 'SHUFFLED FRAGMENTS, REPEATS, TRIPLET RETRIGGERS',
  electro: 'MACHINE REPEATS AND DOUBLES, THE BACKBEAT HELD',
  breakcore: 'TINY FRAGMENTS, AGGRESSIVE REPEATS, MANY RETRIGGERS',
};

export function chopTab(b: HTMLElement, ui: UiContext, W: number) {
  const { app } = ui;

  // ---- CHOP: on and off, and another chop of the same settings
  label(b, 5, 6, 'CHOP', 'head');
  const enable = new Button(b, [40, 3, 58, 14], 'ENABLED', {
    cls: 'small',
    tip: 'CHOP: on, the pattern is the GROOVE re-arranged (fragments of the phrase recalled, swapped, repeated, retriggered, dropped out); off, the pattern is the GROOVE. The settings are kept either way. Hits are moved as events, not audio slices, so every one stays editable and exports as MIDI. ⌘Z undoes.',
    onPress: () => app.setChop({ on: !app.chop.on }),
  });
  const again = new Button(b, [102, 3, 52, 14], 'RE-CHOP', {
    cls: 'small',
    tip: 'RE-CHOP: another chop of the same GROOVE with the same settings. The GROOVE is not re-baked: BAKE does that. ⌘Z returns to the previous chop.',
    onPress: () => app.reChop(),
  });
  const state = el('div', 'label', b, [160, 6, W - 164]);
  state.style.textAlign = 'right';
  el('div', 'rule', b, [4, 21, W - 8]);

  // ---- the settings
  label(b, 5, 29, 'AMOUNT');
  const amount = new RangeBar(b, [72, 26, W - 76, 14], {
    get: () => app.chop.amount,
    set: (v) => app.setChop({ amount: v }),
    format: pct,
    label: 'Chop amount',
    tip: 'AMOUNT: how much of the phrase is re-arranged. 0 = the GROOVE exactly. Low amounts keep the groove recognisable (a few fragments recalled or repeated, the first slice and most backbeats in place); high amounts fragment it, still built from its own hits and on its grid. A higher AMOUNT edits the same slices and more.',
  });
  label(b, 5, 47, 'SLICE SIZE');
  const sw = Math.floor((W - 76 - 3 * 3) / 4);
  const slices = SLICE_SIZES.map(
    (s, i) =>
      new Button(b, [72 + i * (sw + 3), 44, i === 3 ? W - 4 - (72 + 3 * (sw + 3)) : sw, 14], s.toUpperCase(), {
        cls: 'small',
        tip: `${SLICE_TIP[s]} (${SLICE_STEPS[s]} sixteenth${SLICE_STEPS[s] > 1 ? 's' : ''}). The recipe joins or splits slices around it, and a roll or a tom fill is never cut.`,
        onPress: () => app.setChop({ slice: s }),
      }),
  );
  label(b, 5, 65, 'RETRIGGER');
  const retrig = new RangeBar(b, [72, 62, W - 76, 14], {
    get: () => app.chop.retrigger,
    set: (v) => app.setChop({ retrigger: v }),
    format: pct,
    label: 'Chop retrigger',
    tip: 'RETRIGGER: how often a fragment is doubled or retriggered (a drum restruck in a fast burst, as a roll: the ROLLS tab and the PATTERN show and edit it). 0 = no new retriggers (rolls already in the GROOVE are kept). With ROLL GENERATION off (ROLLS tab) CHOP makes no new rolls: fragments are still doubled. Faster strokes are played softer; the recipe chooses the speeds.',
  });
  el('div', 'rule', b, [4, 80, W - 8]);

  // ---- DESTROY
  label(b, 5, 87, 'DESTROY', 'head');
  const dEnable = new Button(b, [56, 83, 58, 14], 'DISABLED', {
    cls: 'small',
    tip: 'DESTROY: after CHOP, some beats are wrecked on purpose: stutters, reversed beats, pitch dives and rises, gates, skips, frozen beats, tape stops. All event edits (no audio processing: GATE and TAPE STOP are approximations, each hit says so). AMOUNT 0 changes nothing; ROLL GENERATION off means its stutters are sixteenth repeats, not rolls. ⌘Z undoes.',
    onPress: () => app.setDestroy({ on: !app.destroySettings.on }),
  });
  const dsw = 44;
  const dStyles = DESTROY_STYLES.map((st, i) => new Button(b, [118 + i * (dsw + 2), 83, dsw, 14], DESTROY_STYLE_LABEL[st], {
    cls: 'small',
    tip: `STYLE ${DESTROY_STYLE_LABEL[st]}: ${{ stutter: 'stutters, frozen beats and skips', pitch: 'pitch dives, rises and tape stops', reverse: 'reversed beats (mirrored at high AMOUNT)', gate: 'gated beats and skips', chaos: 'every operation' }[st]}.`,
    onPress: () => app.setDestroy({ style: st }),
  }));
  const dDice = new Button(b, [118 + 5 * (dsw + 2) + 2, 83, 36, 14], 'DICE', { cls: 'small', tip: 'DICE: another take of the destruction (a new seed): other beats, other operations. ⌘Z returns to the previous one.', onPress: () => app.diceDestroy() });
  label(b, 5, 102, 'AMOUNT');
  const dAmount = new RangeBar(b, [72, 99, W - 76, 13], {
    get: () => app.destroySettings.amount,
    set: (v) => app.setDestroy({ amount: v }),
    format: pct,
    label: 'Destroy amount',
    tip: 'DESTROY AMOUNT: how many beats are destroyed (0 = none). A higher AMOUNT destroys the same beats and more; the loop’s first beat and the crashes are never touched.',
  });
  el('div', 'rule', b, [4, 114, W - 8]);
  const report = el('div', 'label', b, [5, 118, W - 10]);
  const style = el('div', 'label tiny', b, [5, 129, W - 10]);
  const note = el('div', 'label tiny', b, [5, 137, W - 10]);
  const settings = [amount.el, retrig.el, again.el, ...slices.map((s) => s.el)];
  const dSettings = [dAmount.el, dDice.el, ...dStyles.map((x) => x.el)];

  function update(): void {
    const c = app.chop;
    const locked = app.chopLocked;
    enable.text = c.on ? 'ENABLED' : 'DISABLED';
    enable.on = c.on;
    amount.update();
    retrig.update();
    slices.forEach((s, i) => (s.on = SLICE_SIZES[i] === c.slice));
    for (const s of settings) s.classList.toggle('inactive', !c.on || locked);
    enable.disabled = locked;
    again.disabled = locked || !c.on;
    state.textContent = !app.chopped ? 'PATTERN = GROOVE' : locked ? 'APPLIED' : 'PREVIEW';
    const d = app.destroySettings;
    dEnable.text = d.on ? 'ENABLED' : 'DISABLED';
    dEnable.on = d.on;
    dEnable.disabled = locked;
    dAmount.update();
    dStyles.forEach((x, i) => (x.on = DESTROY_STYLES[i] === d.style));
    for (const x of dSettings) x.classList.toggle('inactive', !d.on || locked);
    dDice.disabled = locked || !d.on;
    setTip(state, locked ? 'APPLIED: this pattern has hand edits on the chopped result, so CHOP is fixed (a new chop would move hits under them). ⌘Z the edits, or Edit ▸ Clear All Hand Edits, to change CHOP again.' : 'PREVIEW: every CHOP change is recalculated from the GROOVE. The first hand edit in the PATTERN applies it.');
    report.textContent = (c.on && !app.chopped ? 'CHOP: AMOUNT 0, the pattern is the GROOVE.' : describeChop(app.current.chop)).toUpperCase();
    setTip(report, `${describeChop(app.current.chop)} ${describeDestroy(app.current.destroy, d)} RECIPE ▸ GROOVE ▸ CHOP ▸ EXPRESSION ▸ DESTROY ▸ PATTERN: CHOP and DESTROY never compound on their own result; turning them off gives the GROOVE back.`);
    const def = STYLE_DEFS[app.recipe.style];
    const cs = CHOP_STYLE[app.recipe.style];
    style.textContent = d.on ? describeDestroy(app.current.destroy, d).toUpperCase() : `${def.label}: ${STYLE_CHOP[app.recipe.style]} · SUGGESTED SLICE ${cs.slice.toUpperCase()}${app.dna ? ' · AMEN DNA LEANS THE CUTS' : ''}`;
    setTip(style, `How ${def.label} chops: the recipe weighs the same operations (recall, swap, repeat, double, retrigger, drop-out) differently, and chooses how fragments are joined or split around the SLICE SIZE. The seed is the BEAT seed: FREEZE BEAT keeps the chop, BAKE makes a new one.`);
    note.textContent = locked
      ? 'APPLIED: HAND EDITS ARE ON THE CHOPPED RESULT · ⌘Z THEM TO CHANGE CHOP'
      : app.legacy
        ? 'LEGACY BREAK: CHOP WORKS ON IT AS IT IS · RECIPE ▸ USE GROOVE TO RE-BAKE'
        : c.on && !app.rollGeneration
          ? 'PREVIEW · ROLL GENERATION OFF: RETRIGGER MAKES NO NEW ROLLS'
        : c.on
          ? 'PREVIEW: EVERY CHANGE IS RECALCULATED FROM THE GROOVE · ⌘Z UNDOES'
          : 'OFF: THE SETTINGS ARE KEPT · SWITCH ON TO CHOP THIS GROOVE';
  }
  update();
  return { update };
}
