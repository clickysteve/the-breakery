/**
 * TEMPO PROFILES (Phase 13): each recipe's tempo range and the tempo it centres on, from
 * docs/rhythmic-research.md. Choosing a recipe (with TEMPO LOCK off), RANDOM RECIPE, WILDCARD and
 * the tempo DICE draw a tempo from the recipe's profile instead of always its default: a seeded,
 * weighted choice that favours the centre (a triangular distribution between the limits, peaked
 * at the centre) but reaches the whole range. The sources give ranges and typical tempos, not
 * distributions; the shape is a design choice.
 *
 * BAKE never changes the tempo; TEMPO LOCK keeps it through everything else; the BPM box always
 * sets it by hand.
 */
import { hashString, stream, type Rng } from './rng';
import { clamp, type Style } from './types';

export interface TempoProfile {
  min: number;
  max: number;
  /** the weighted centre: the most likely tempo */
  centre: number;
}

// prettier-ignore
export const TEMPO_PROFILES: Record<Style, TempoProfile> = {
  funk:      { min: 86, max: 124, centre: 100 },
  hiphop:    { min: 74, max: 110, centre: 90 },
  jungle:    { min: 155, max: 176, centre: 165 },
  broken:    { min: 110, max: 138, centre: 126 },
  boombap:   { min: 80, max: 104, centre: 92 },
  hardcore:  { min: 132, max: 168, centre: 145 },
  dnb:       { min: 160, max: 182, centre: 174 },
  halftime:  { min: 140, max: 176, centre: 170 },
  garage:    { min: 126, max: 140, centre: 132 },
  electro:   { min: 108, max: 135, centre: 120 },
  breakcore: { min: 150, max: 220, centre: 190 },
};

/** A tempo from a recipe's profile (triangular between min and max, peaked at the centre), in whole BPM. */
export function pickTempo(style: Style, rng: Rng): number {
  const { min, max, centre } = TEMPO_PROFILES[style];
  const u = rng.next();
  const c = (centre - min) / (max - min);
  const x = u < c ? Math.sqrt(u * c) : 1 - Math.sqrt((1 - u) * (1 - c));
  return clamp(Math.round(min + x * (max - min)), min, max);
}

/** The tempo a recipe gets with a seed (the same recipe and seed always give the same tempo). */
export const tempoFor = (style: Style, seed: number): number => pickTempo(style, stream(hashString(`tempo:${style}`), `${seed >>> 0}`));

export const tempoRange = (style: Style): string => {
  const p = TEMPO_PROFILES[style];
  return `${p.min}–${p.max} BPM, usually about ${p.centre}`;
};
