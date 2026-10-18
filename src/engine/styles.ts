/**
 * Recipes: the four starting styles. Each is a set of default control values plus the
 * tendencies the generator uses. They are generative strategies, not collections of patterns,
 * and the genre names are tendencies, not guarantees of authenticity.
 *
 * Every number here is a DESIGN HYPOTHESIS (docs/BREAKBEAT_RESEARCH.md §4), set by musical
 * judgement and by inspecting generated output, not fitted to data. The structure they encode
 * is from the research: backbeat as anchor, kick as the syncopating voice, ghosts around the
 * backbeat, a continuous timekeeper, variation late in the phrase.
 */
import type { Recipe, Style } from './types';

export type FillKind = 'run' | 'displace' | 'drop' | 'stutter';

export interface StyleDef {
  style: Style;
  label: string;
  /** min, max, default */
  bpm: [number, number, number];
  defaults: Omit<Recipe, 'style' | 'bpm' | 'bars'>;
  /** kick preference per sixteenth (step 0 is always taken; backbeat steps are excluded) */
  kickWeights: number[];
  /** kicks per bar at density 0 and 1 (including the downbeat) */
  kickCount: [number, number];
  /** foundation syncopation (per bar) at SYNCOPATION 0 and 1 */
  syncRange: [number, number];
  /** chance per bar that a backbeat moves (scaled by complexity) */
  displaceP: number;
  /** extra (non-backbeat) snares: chance scale and candidate steps with weights */
  extraSnare: { p: number; steps: Record<number, number> };
  /** ghost notes per bar at GHOSTS = 1 */
  ghostMax: number;
  /** nominal ghost level 0..1 */
  ghostLevel: number;
  /** 32nd-note drags into ghosts and backbeats (scaled by complexity) */
  dragP: number;
  /** density above which the timekeeper plays sixteenths */
  sixteenthsAbove: number;
  /** chance the timekeeper is the ride */
  rideP: number;
  /** open-hat lifts per bar at complexity 1 */
  openMax: number;
  /** chance percussion plays at all (scaled by density) */
  percP: number;
  /** longest fill in sixteenths at FILLS = 1 */
  fillMax: number;
  fillKinds: Record<FillKind, number>;
  /** snare lateness tendency in ms at HUMANISE = 1 (never early) */
  snareLag: number;
  /** overall timing deviation scale */
  timingScale: number;
  /** variation also allowed in the first half of answer bars */
  restless: boolean;
  crashP: number;
}

// prettier-ignore
export const STYLE_DEFS: Record<Style, StyleDef> = {
  funk: {
    style: 'funk',
    label: 'FUNK',
    bpm: [84, 118, 100],
    defaults: { density: 0.6, complexity: 0.45, syncopation: 0.55, ghosts: 0.65, swing: 0.12, humanise: 0.35, variation: 0.45, fills: 0.35 },
    //           1    e    &    a    2    e    &    a    3    e    &    a    4    e    &    a
    kickWeights: [0, 0.15, 0.9, 0.45, 0, 0.3, 0.55, 0.75, 0.55, 0.2, 0.95, 0.6, 0, 0.3, 0.55, 0.4],
    kickCount: [2, 6],
    syncRange: [1, 9],
    displaceP: 0.12,
    extraSnare: { p: 0.25, steps: { 7: 1, 9: 0.6, 15: 0.8, 10: 0.3 } },
    ghostMax: 6,
    ghostLevel: 0.24,
    dragP: 0.15,
    sixteenthsAbove: 0.45,
    rideP: 0.12,
    openMax: 2,
    percP: 0.35,
    fillMax: 6,
    fillKinds: { run: 0.4, displace: 0.3, drop: 0.15, stutter: 0.15 },
    snareLag: 7,
    timingScale: 1,
    restless: false,
    crashP: 0.35,
  },
  hiphop: {
    style: 'hiphop',
    label: 'HIP-HOP',
    bpm: [76, 100, 90],
    defaults: { density: 0.38, complexity: 0.3, syncopation: 0.45, ghosts: 0.3, swing: 0.4, humanise: 0.4, variation: 0.3, fills: 0.2 },
    kickWeights: [0, 0.05, 0.55, 0.25, 0, 0.1, 0.2, 0.55, 0.45, 0.2, 0.85, 0.35, 0, 0.1, 0.35, 0.35],
    kickCount: [2, 5],
    syncRange: [0, 7],
    displaceP: 0.05,
    extraSnare: { p: 0.1, steps: { 15: 1, 7: 0.5 } },
    ghostMax: 3,
    ghostLevel: 0.2,
    dragP: 0.04,
    sixteenthsAbove: 0.72,
    rideP: 0.05,
    openMax: 1,
    percP: 0.25,
    fillMax: 4,
    fillKinds: { run: 0.15, displace: 0.2, drop: 0.5, stutter: 0.15 },
    snareLag: 10,
    timingScale: 1,
    restless: false,
    crashP: 0.15,
  },
  jungle: {
    style: 'jungle',
    label: 'JUNGLE',
    bpm: [150, 180, 165],
    defaults: { density: 0.62, complexity: 0.7, syncopation: 0.65, ghosts: 0.7, swing: 0.06, humanise: 0.25, variation: 0.7, fills: 0.55 },
    kickWeights: [0, 0.1, 0.85, 0.3, 0, 0.25, 0.25, 0.35, 0.3, 0.2, 0.9, 0.85, 0, 0.2, 0.3, 0.35],
    kickCount: [2, 5],
    syncRange: [2, 11],
    displaceP: 0.3,
    extraSnare: { p: 0.7, steps: { 7: 1, 9: 0.9, 15: 0.7, 10: 0.4, 14: 0.4, 3: 0.2 } },
    ghostMax: 7,
    ghostLevel: 0.26,
    dragP: 0.45,
    sixteenthsAbove: 0.8,
    rideP: 0.5,
    openMax: 1,
    percP: 0.2,
    fillMax: 8,
    fillKinds: { run: 0.4, displace: 0.3, drop: 0.1, stutter: 0.2 },
    snareLag: 4,
    timingScale: 0.6,
    restless: true,
    crashP: 0.45,
  },
  broken: {
    style: 'broken',
    label: 'BROKEN',
    bpm: [110, 140, 126],
    defaults: { density: 0.5, complexity: 0.65, syncopation: 0.7, ghosts: 0.45, swing: 0.2, humanise: 0.3, variation: 0.55, fills: 0.3 },
    kickWeights: [0, 0.4, 0.55, 0.6, 0.2, 0.5, 0.6, 0.5, 0.45, 0.5, 0.55, 0.6, 0.2, 0.55, 0.5, 0.5],
    kickCount: [2, 6],
    syncRange: [3, 13],
    displaceP: 0.8,
    extraSnare: { p: 0.35, steps: { 3: 0.6, 7: 0.7, 10: 0.7, 13: 0.6, 15: 0.5 } },
    ghostMax: 5,
    ghostLevel: 0.23,
    dragP: 0.2,
    sixteenthsAbove: 0.35,
    rideP: 0.2,
    openMax: 2,
    percP: 0.5,
    fillMax: 5,
    fillKinds: { run: 0.25, displace: 0.35, drop: 0.2, stutter: 0.2 },
    snareLag: 5,
    timingScale: 0.9,
    restless: true,
    crashP: 0.2,
  },
};

/** A fresh recipe with the style's defaults. */
export function defaultRecipe(style: Style = 'funk', bars: Recipe['bars'] = 2): Recipe {
  const d = STYLE_DEFS[style];
  return { style, bpm: d.bpm[2], bars, ...d.defaults };
}
