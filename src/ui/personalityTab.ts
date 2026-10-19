/**
 * PERSONALITY (a tab of the RECIPE window): who plays the break, and BREAK DNA: what it is built
 * from (a GEM selector of recordings and traditions, INFLUENCE and DICE; dna.ts, dnaGrammar.ts). They are separate on purpose (a rule between them): a personality changes how the phrase
 * is played and a little of what is played; a DNA is a construction vocabulary. Both are part of
 * the recipe (saved, in the history and favourites, undoable) and both are heard on the same
 * seeds at once. INTENSITY 0 or NEUTRAL, and DNA NONE, are the recipe exactly.
 */
import { describeDna, DNA_GROUPS, DNA_LABEL, dnaBlurb, dnaSource, type DnaId } from '../engine/dna';
import { dillaStrategy, DILLA_STRATEGY_LABEL } from '../engine/dilla';
import { PERSONALITIES, PERSONALITY_BLURB, PERSONALITY_DIMS, PERSONALITY_LABEL, type PersonalityId } from '../engine/personality';
import { el, label, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import { GemSelect } from './gemSelect';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sgn = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x)}`;

export function personalityTab(b: HTMLElement, ui: UiContext, W: number) {
  const { app } = ui;

  label(b, 5, 6, 'PERSONALITY', 'head');
  label(b, W - 4 - 200 - 52, 6, 'INTENSITY');
  const intensity = new RangeBar(b, [W - 4 - 200, 3, 200, 14], {
    get: () => app.personality.amount,
    set: (v) => app.setPersonality({ amount: v }),
    format: pct,
    label: 'Personality intensity',
    tip: 'INTENSITY: how strongly the personality plays. 0% is NEUTRAL (the recipe exactly); 100% its full character. Explicit settings keep their meaning at any intensity: TOM ACTIVITY 0 stays without toms, ROLLS off stays off, a sparse DENSITY stays sparse.',
  });

  const perRow = 6;
  const bw = Math.floor((W - 8 - (perRow - 1) * 2) / perRow);
  const btns = PERSONALITIES.map((id, i) =>
    new Button(b, [4 + (i % perRow) * (bw + 2), 21 + Math.floor(i / perRow) * 14, bw, 13], PERSONALITY_LABEL[id], {
      cls: 'small',
      tip: `${PERSONALITY_LABEL[id]}: ${PERSONALITY_BLURB[id]}`,
      onPress: () => app.setPersonality({ id }),
    }),
  );
  const blurb = el('div', 'label', b, [5, 66, W - 10]);
  const dims = el('div', 'label tiny', b, [5, 77, W - 10]);
  const feedback = el('div', 'label tiny', b, [5, 86, W - 10]);
  el('div', 'rule', b, [4, 96, W - 8]);

  // ---- BREAK DNA: a GEM selector (recordings, traditions), INFLUENCE and DICE
  label(b, 5, 103, 'BREAK DNA', 'head');
  const dnaSel = new GemSelect(b, [64, 100, 112, 14], {
    label: 'Break DNA',
    options: [{ value: 'none', label: 'NONE' }, ...DNA_GROUPS.flatMap((g) => g.ids.map((id) => ({ value: id, label: DNA_LABEL[id], group: g.label })))],
    value: app.dna?.id ?? 'none',
    onChange: (v) => app.setDna(v === 'none' ? null : { id: v as DnaId }),
    tip: 'BREAK DNA: the construction vocabulary the break is built from (a famous recording or a tradition), blended into this recipe. Not a copy of any recording; no audio from it. Research and sources: docs/break-dna-research.md. ↑ ↓ or click to choose.',
  });
  label(b, 182, 103, 'INFLUENCE');
  const influence = new RangeBar(b, [232, 100, W - 4 - 232 - 32, 14], {
    get: () => app.dna?.amount ?? 0.6,
    set: (v) => app.setDna({ amount: v }),
    format: pct,
    label: 'Break DNA influence',
    tip: 'INFLUENCE: how much of the DNA’s vocabulary the break is built from. 0% = the recipe’s own phrase, exactly. More INFLUENCE keeps the same DNA figures and adds more (it never changes the tempo, the kit or the mixer). It never adds toms or rolls, never moves HALFTIME’s backbeat, and leans the cymbals without setting how many there are (CYMBALS tab).',
  });
  const dnaDice = new Button(b, [W - 4 - 30, 100, 30, 14], 'DICE', {
    cls: 'small',
    tip: 'DNA DICE: a different BREAK DNA at random, heard at once on the same seeds and INFLUENCE. ⌘Z returns to the previous one.',
    onPress: () => app.diceDna(),
  });
  dnaDice.el.setAttribute('aria-label', 'Roll a different Break DNA');
  const dnaLine = el('div', 'label tiny', b, [5, 119, W - 10]);
  const note = el('div', 'label tiny', b, [5, 130, W - 10], 'PERSONALITY = WHO PLAYS IT · BREAK DNA = WHAT IT IS BUILT FROM · BOTH ARE PART OF THE RECIPE');

  function update(): void {
    const p = app.personality;
    btns.forEach((x, i) => (x.on = PERSONALITIES[i] === p.id));
    intensity.update();
    intensity.el.classList.toggle('inactive', p.id === 'neutral');
    blurb.textContent = `${PERSONALITY_LABEL[p.id]}: ${PERSONALITY_BLURB[p.id]}`.toUpperCase();
    const d = PERSONALITY_DIMS[p.id as PersonalityId];
    const a = p.amount;
    dims.textContent = p.id === 'neutral'
      ? 'TIMING · DYNAMICS · ENERGY · DISCIPLINE · EXPRESSION · PHRASING: AS THE RECIPE HAS THEM'
      : p.id === 'dilla'
        ? `TIMING ${DILLA_STRATEGY_LABEL[dillaStrategy(app.seeds.feel)]} (FROM THE FEEL SEED) · UP TO ${Math.round(Math.max(4, 30 * a))} MS · DISCIPLINE ${sgn(d.discipline * 100)} · REPEATS EVERY 2 BARS`
        : `TIMING K${sgn(d.lean.kick * a)} S${sgn(d.lean.snare * a)} H${sgn(d.lean.hats * a)} MS · DYNAMICS ${sgn(d.level * a * 100)}% · ENERGY ${sgn(d.energy * 100)} · DISCIPLINE ${sgn(d.discipline * 100)} · EXPRESSION ${sgn(d.expression * 100)} · ${d.phrasing.toUpperCase()}`;
    setTip(dims, 'The six dimensions at this intensity. They interact: DISCIPLINE decides whether deviations repeat bar after bar; ENERGY makes the time rush (or drag) and dense bars harder; a laid-back snare is played louder. Details: docs/EXPRESSIVE_RESEARCH.md.');
    feedback.textContent = (app.legacy ? 'LEGACY BREAK: PERSONALITY PLAYS ITS PERFORMANCE ONLY' : app.personaFeedback).toUpperCase();
    setTip(feedback, 'This break against the same seeds played by NEUTRAL: hits, mean velocity and the mean timing change per drum.');
    const dna = app.dna;
    dnaSel.value = dna?.id ?? 'none';
    influence.update();
    influence.el.classList.toggle('inactive', !dna);
    dnaLine.textContent = describeDna(app.recipe.dna).toUpperCase();
    setTip(dnaLine, dna ? `${DNA_LABEL[dna.id]}: informed by ${dnaSource(dna.id)}. ${dnaBlurb(dna.id)} With CHOP on it leans the cuts too. A generative vocabulary, not a transcription.` : 'NONE: the recipe builds its own phrase.');
    void note;
  }
  update();
  return { update };
}
