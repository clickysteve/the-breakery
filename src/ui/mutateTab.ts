/**
 * MUTATE (a tab of the RECIPE window): MUTATE PATTERN (U) makes a related variation of the
 * current break with the existing mutation mechanism (a mutation seed varying the groove cell),
 * shaped here by STYLE, DEPTH, RANGE and which tracks it may touch. CREATE RELATED SECTION makes
 * another section of the same tune from it. Each is a new break in the seed history (◀ returns)
 * and one undo step; frozen layers stay frozen.
 */
import { SECTION_DEFS, SECTIONS } from '../engine/sections';
import { CATEGORY_LABEL, MUTATION_STYLES, type Category, type MutationStyle } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const STYLE_TIP: Record<MutationStyle, string> = {
  musical: 'MUSICAL: a few balanced changes to kick and detail (a kick moved or doubled, a ghost, a lift): the classic MUTATE',
  subtle: 'SUBTLE: only the detail in the second half of the bar (ghosts, open hats); the kick and snare stay',
  rhythmic: 'RHYTHMIC: the kick pattern reworked (moved, added, doubled, dropped); at higher depth the backbeat may move too',
  fills: 'FILLS: the fill bars (turnaround, half-way fill) rewritten more strongly; the groove bars stay as they are',
  sparse: 'SPARSE: decoration thinned out (ghosts, percussion, off-beat time, extra kicks); never the downbeat or a backbeat',
  dense: 'DENSE: ghosts into the backbeats, time on the off-sixteenths and pickup kicks where there is room',
  wild: 'WILD: many changes everywhere, the backbeat included, then thinned or thickened: far from the original but from it',
};

/** Track groups for SELECTED TRACKS. */
const GROUPS: { label: string; cats: Category[] }[] = [
  { label: 'KICK', cats: ['kick'] },
  { label: 'SNARE', cats: ['snare'] },
  { label: 'GHOST', cats: ['ghost'] },
  { label: 'TOMS', cats: ['htom', 'mtom', 'ltom'] },
  { label: 'HATS', cats: ['hat', 'open'] },
  { label: 'CYM', cats: ['ride', 'crash'] },
  { label: 'PERC', cats: ['perc'] },
];

export function mutateTab(b: HTMLElement, ui: UiContext, W: number) {
  const { app } = ui;
  const go = new Button(b, [4, 3, 116, 18], 'MUTATE PATTERN', {
    tip: 'MUTATE PATTERN (U): a related variation of this break with the settings below. The groove cell itself changes, so every bar derived from it follows. A new break in the history: ◀ (←) returns to the original; ⌘Z undoes it. Frozen layers are kept.',
    onPress: () => app.mutate(),
  });
  const lineage = el('div', 'label tiny', b, [126, 5, W - 130]);
  const back = el('div', 'label tiny', b, [126, 14, W - 130], '◀ (←) RETURNS TO THE PATTERN BEFORE IT');

  const gap = 2;
  const sw = Math.floor((W - 8 - gap * (MUTATION_STYLES.length - 1)) / MUTATION_STYLES.length);
  label(b, 5, 28, 'STYLE', 'head');
  const styles = MUTATION_STYLES.map((m, i) => new Button(b, [4 + i * (sw + gap), 37, i === MUTATION_STYLES.length - 1 ? W - 4 - (4 + i * (sw + gap)) : sw, 14], m.toUpperCase(), { cls: 'small', tip: STYLE_TIP[m], onPress: () => app.setMutation({ style: m }) }));

  const half = Math.floor((W - 8) / 2);
  label(b, 5, 59, 'DEPTH');
  const depth = new RangeBar(b, [44, 56, half - 48, 14], {
    get: () => app.mutation.depth,
    set: (v) => app.setMutation({ depth: v }),
    format: pct,
    label: 'Mutation depth',
    tip: 'DEPTH: how radically the pattern changes: how many variation operations a mutation makes (and, for SPARSE and DENSE, how much it thins or fills).',
  });
  label(b, 4 + half + 4, 59, 'RANGE');
  const range = new RangeBar(b, [4 + half + 44, 56, W - 4 - (4 + half + 44), 14], {
    get: () => app.mutation.range,
    set: (v) => app.setMutation({ range: v }),
    format: (v) => (v >= 1 ? 'ALL BARS' : `LAST ${pct(v)}`),
    label: 'Mutation range',
    tip: 'RANGE: how much of the phrase may change, counted back from its end: 100% every bar, 50% the second half, low values the last bar only. The bars before it keep the original groove. (FILLS style: the fill bars.)',
  });

  // ALL TRACKS, or SELECTED TRACKS: choosing a track selects it (and SELECTED)
  label(b, 5, 78, 'TRACKS');
  const all = new Button(b, [44, 75, 30, 14], 'ALL', { cls: 'small', tip: 'ALL TRACKS: the mutation may change any track. Choose tracks beside it to mutate only those (SELECTED TRACKS).', onPress: () => app.setMutation({ target: 'all' }) });
  const gx = 44 + 30 + 4;
  const gw = Math.floor((W - 4 - gx - gap * (GROUPS.length - 1)) / GROUPS.length);
  const groups = GROUPS.map((g, i) =>
    new Button(b, [gx + i * (gw + gap), 75, i === GROUPS.length - 1 ? W - 4 - (gx + i * (gw + gap)) : gw, 14], g.label, {
      cls: 'small',
      tip: `SELECTED TRACKS: ${g.cats.map((c) => CATEGORY_LABEL[c]).join(', ')}. Inverted: the mutation may change it; every track not chosen stays exactly as it was.`,
      onPress: () => {
        const cur = app.mutation.cats;
        const has = g.cats.every((c) => cur.includes(c));
        app.setMutation({ target: 'selected', cats: has ? cur.filter((c) => !g.cats.includes(c)) : [...cur, ...g.cats] });
      },
    }),
  );

  el('div', 'rule', b, [4, 96, W - 8]);
  label(b, 5, 102, 'CREATE RELATED SECTION', 'head');
  const xw = Math.floor((W - 8 - gap * (SECTIONS.length - 1)) / SECTIONS.length);
  const sections = SECTIONS.map((k, i) =>
    new Button(b, [4 + i * (xw + gap), 112, i === SECTIONS.length - 1 ? W - 4 - (4 + i * (xw + gap)) : xw, 15], SECTION_DEFS[k].label, {
      cls: 'small',
      tip: `${SECTION_DEFS[k].tip}. Made from this pattern (same seeds, feel and sounds), as a new break in the history: ◀ returns to this one.`,
      onPress: () => app.createSection(k),
    }),
  );
  const note = el('div', 'label tiny', b, [5, 132, W - 10]);

  function update(): void {
    const m = app.mutation;
    const e1 = app.recipe.engine === 1;
    const frozen = app.frozen.beat && app.frozen.detail;
    styles.forEach((s, i) => (s.on = MUTATION_STYLES[i] === m.style));
    depth.update();
    range.update();
    all.on = m.target === 'all';
    groups.forEach((g, i) => {
      g.on = m.target === 'selected' && GROUPS[i]!.cats.every((c) => m.cats.includes(c));
      g.el.classList.toggle('inactive', m.target === 'all');
    });
    range.el.classList.toggle('inactive', m.style === 'fills');
    go.disabled = e1 || frozen || (m.target === 'selected' && !m.cats.length);
    sections.forEach((s) => (s.disabled = e1 || frozen));
    const n = app.seeds.mut?.length ?? 0;
    lineage.textContent = n ? `THIS PATTERN: ${n} MUTATION${n === 1 ? '' : 'S'} FROM SEED ${app.seedText}` : `THIS PATTERN: SEED ${app.seedText}, NOT MUTATED`;
    back.style.display = app.history.canBack ? '' : 'none';
    note.textContent = e1
      ? 'MUTATE NEEDS ENGINE 2 (RECIPE ▸ ENGINE)'
      : frozen
        ? 'BEAT AND DETAIL ARE BOTH FROZEN (BAKE): NOTHING TO MUTATE'
        : m.target === 'selected' && !m.cats.length
          ? 'CHOOSE AT LEAST ONE TRACK, OR ALL'
          : 'A NEW BREAK IN THE HISTORY · ⌘Z UNDOES · FROZEN LAYERS STAY';
    setTip(lineage, 'The mutation lineage of this break. Seeds ▸ history lists every break, the originals included.');
  }
  update();
  return { update };
}
