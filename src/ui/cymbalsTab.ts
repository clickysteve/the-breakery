/**
 * CYMBALS (a tab of the RECIPE window): HI-HAT ACTIVITY (closed and open hats), RIDE ACTIVITY and
 * how the two share the time (RELATIONSHIP: ALTERNATE, LAYER, INDEPENDENT). The activities choose
 * the cymbal vocabulary, not only a density: low activity plays sparse accents or quarters, the
 * middle off-beats, broken eighths and 3+3+2, high activity sixteenths, skipping sixteenths and
 * (with ROLLS on) rapid figures. 0% means none of that family at all, whatever the personality or
 * the BREAK DNA. Below, what the generator chose for this break.
 */
import { MOTIF_LABEL, type MotifId } from '../engine/approaches';
import { hatActivity, rideActivity } from '../engine/cymbals';
import { CYMBAL_MODES, CYMBAL_MODE_LABEL, type CymbalMode } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const MODE_TIP: Record<CymbalMode, string> = {
  alternate: 'ALTERNATE (default): one of them keeps the time; the other rests, punctuates (a ride bell, a crash-like accent) or takes over for some bars. VARIATION decides how often it takes over.',
  layer: 'LAYER: both may play at once, the second voice sparser so the two interlock rather than double.',
  independent: 'INDEPENDENT: the hats and the ride each follow their own approach, from their own activity.',
};

export function cymbalsTab(b: HTMLElement, ui: UiContext, W: number) {
  const { app } = ui;
  const x0 = 112;

  label(b, 5, 6, 'HI-HAT ACTIVITY', 'head');
  const hats = new RangeBar(b, [x0, 3, W - 4 - x0, 14], {
    get: () => hatActivity(app.recipe),
    set: (v) => app.setRecipe({ hats: v }),
    format: pct,
    label: 'Hi-hat activity',
    tip: 'HI-HAT ACTIVITY: the closed and open hats. 0% = no hats at all (personalities, BREAK DNA and rolls add none). Low: sparse accents or quarters; middle: off-beats, broken eighths, 3+3+2; high: eighths, skipping sixteenths, sixteenths, and rapid figures with ROLLS on. The recipe decides which of these suit it.',
  });
  label(b, 5, 22, 'RIDE ACTIVITY', 'head');
  const ride = new RangeBar(b, [x0, 19, W - 4 - x0, 14], {
    get: () => rideActivity(app.recipe),
    set: (v) => app.setRecipe({ ride: v }),
    format: pct,
    label: 'Ride activity',
    tip: 'RIDE ACTIVITY: the ride cymbal. 0% = no ride at all. Low: a bell or accent now and then; middle: quarters or a broken ride; high: a jazz-style ride, eighths or sixteenths. JUNGLE and D&B lean on the ride; GARAGE and ELECTRO rarely.',
  });
  el('div', 'rule', b, [4, 37, W - 8]);

  label(b, 5, 44, 'RELATIONSHIP', 'head');
  const mw = Math.floor((W - 4 - x0 - 2 * 2) / 3);
  const modes = CYMBAL_MODES.map((m, i) =>
    new Button(b, [x0 + i * (mw + 2), 41, mw, 14], CYMBAL_MODE_LABEL[m], {
      cls: 'small',
      tip: MODE_TIP[m],
      onPress: () => app.setRecipe({ cymbals: m }),
    }),
  );
  const modeLine = el('div', 'label tiny', b, [5, 59, W - 10]);
  el('div', 'rule', b, [4, 70, W - 8]);

  label(b, 5, 77, 'THIS BREAK', 'head');
  const lines = [0, 1, 2, 3, 4].map((i) => el('div', 'label tiny', b, [5, 89 + i * 10, W - 10]));
  setTip(lines[0]!, 'The groove approach: how the kick and snare are built for this break. Each recipe has several; the BEAT seed chooses one.');
  setTip(lines[1]!, 'The phrase form, one letter per bar: A the groove, A2 its answer, B a contrasting bar, F a short fill, T the turnaround.');
  setTip(lines[2]!, 'The hats’ approach, chosen from HI-HAT ACTIVITY and the recipe.');
  setTip(lines[3]!, 'The ride’s approach, chosen from RIDE ACTIVITY and the recipe.');
  setTip(lines[4]!, 'How the timekeeping develops through the phrase. VARIATION 0 holds it.');

  function update(): void {
    hats.update();
    ride.update();
    const mode = app.recipe.cymbals ?? 'alternate';
    modes.forEach((m, i) => (m.on = CYMBAL_MODES[i] === mode));
    modeLine.textContent = MODE_TIP[mode].toUpperCase();
    const a = app.current.approach;
    if (!a) {
      lines[0]!.textContent = app.legacy ? 'LEGACY BREAK: THE FIRST RELEASE’S GENERATOR (NO RHYTHMIC VOCABULARY)' : 'THIS BREAK WAS BAKED BEFORE THE RHYTHMIC VOCABULARY (GROOVE REVISION 3)';
      for (const l of lines.slice(1)) l.textContent = '';
      return;
    }
    lines[0]!.textContent = `GROOVE: ${a.groove}`.toUpperCase();
    lines[1]!.textContent = `FORM: ${a.form}${a.motif ? ` · MOTIF ${MOTIF_LABEL[a.motif as MotifId] ?? a.motif}` : ''}`.toUpperCase();
    lines[2]!.textContent = `HATS: ${a.hats || 'NONE'}`.toUpperCase();
    lines[3]!.textContent = `RIDE: ${a.ride || 'NONE'}`.toUpperCase();
    lines[4]!.textContent = a.development ? `TIMEKEEPING ${a.development}`.toUpperCase() : '';
  }
  update();
  return { update };
}
