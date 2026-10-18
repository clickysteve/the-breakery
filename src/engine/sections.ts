/**
 * MUTATE ▸ CREATE RELATED SECTION: another section of the same tune, made from the current break
 * by the ordinary MUTATE mechanism (one mutation, with a style, depth and range) and, for some
 * sections, a small change to the recipe. The seeds stay the same, so the new section keeps the
 * groove's kick and snare figure, its feel and its samples: it is related, not a new pattern.
 */
import { clamp, type MutationOptions, type MutationStyle, type Recipe } from './types';

export const SECTIONS = ['verse', 'chorus', 'breakdown', 'build', 'fill', 'alternate'] as const;
export type Section = (typeof SECTIONS)[number];

export interface SectionDef {
  label: string;
  tip: string;
  mutation: Required<Pick<MutationOptions, 'style' | 'depth' | 'range'>>;
  /** the recipe change (relative to the current recipe) */
  recipe: (r: Recipe) => Partial<Recipe>;
}

const up = (v: number, d: number) => clamp(v + d, 0, 1);
const m = (style: MutationStyle, depth: number, range: number) => ({ style, depth, range });

export const SECTION_DEFS: Record<Section, SectionDef> = {
  verse: { label: 'VERSE', tip: 'VERSE VARIATION: the same groove with small detail changes (ghosts, lifts) through the phrase', mutation: m('subtle', 0.4, 1), recipe: () => ({}) },
  chorus: { label: 'CHORUS', tip: 'CHORUS: a lift. Busier hats and ghosts and a little more density, on the same kick and snare figure', mutation: m('dense', 0.5, 1), recipe: (r) => ({ density: up(r.density, 0.12), ghosts: up(r.ghosts, 0.08) }) },
  breakdown: { label: 'BREAKDOWN', tip: 'BREAKDOWN: the groove stripped back. Decoration and extra kicks thinned out, fewer ghosts and fills', mutation: m('sparse', 0.8, 1), recipe: (r) => ({ density: up(r.density, -0.25), ghosts: up(r.ghosts, -0.2), fills: up(r.fills, -0.2) }) },
  build: { label: 'BUILD', tip: 'BUILD: the second half of the phrase gets busier, with longer fills and more rolls into the top', mutation: m('dense', 0.7, 0.5), recipe: (r) => ({ fills: up(r.fills, 0.25), rolls: up(r.rolls, 0.2), density: up(r.density, 0.08) }) },
  fill: { label: 'FILL', tip: 'FILL / TRANSITION: the fill bars rewritten more strongly, to lead into the next section', mutation: m('fills', 0.8, 1), recipe: (r) => ({ fills: up(r.fills, 0.3) }) },
  alternate: { label: 'ALTERNATE', tip: 'ALTERNATE SECTION: the kick pattern reworked (the backbeat may move), keeping the feel, the time and the sounds', mutation: m('rhythmic', 0.6, 1), recipe: (r) => ({ complexity: up(r.complexity, 0.1) }) },
};
