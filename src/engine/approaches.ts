/**
 * The rhythmic vocabulary (GROOVE revision 3, Phase 13): what a seed chooses inside a recipe
 * before any note is placed. Research and reasoning: docs/rhythmic-research.md.
 *
 * Before revision 3 every seed of a recipe used the same strategy (one table of kick weights,
 * snares on 2 and 4, one timekeeper plan), so a new seed moved a few kicks and little else:
 * docs/diversity-baseline.md measured 4% distinct HIP-HOP hat patterns over 200 seeds. Now a
 * break is composed in this order:
 *
 *   1. the recipe (styles.ts)
 *   2. a GROOVE APPROACH within it (this file, from the BEAT seed): a kick and snare strategy
 *      (sparse, pushed, lopsided, half-time, break-derived, two-step, rolling, linear,
 *      ghost-led, syncopated, four-to-the-floor, skip, fragments, shuffle …). Each recipe
 *      weighs only the approaches that belong to it; the controls lean the weights (a low
 *      DENSITY favours sparse approaches, a high COMPLEXITY the syncopated ones) but never
 *      decide alone, so every setting of the controls still reaches several approaches.
 *   3. the rhythmic identity: the approach shapes the recipe's foundation strategy (a variant of
 *      its StyleDef), which foundation.ts uses exactly as before (generate and test)
 *   4. the PHRASE FORM (chooseForm, BEAT seed) and the MOTIF DEVELOPMENT (MOTIFS, BEAT seed):
 *      how the bars relate (A A2 A T, A A A2 T, A A2 B T, A B A T …) and how an answer bar
 *      develops the motif (echo, displace, truncate, extend, vary)
 *   5. the CYMBAL APPROACH (cymbals.ts, from the DETAIL seed), generated per bar against the
 *      bar's kicks, snares and fills
 *   6. PERSONALITY, BREAK DNA, CHOP and the rest, unchanged
 *
 * Approaches are strategies, not patterns: the same approach with another seed gives another
 * pattern, and each is used through the generate-and-test foundation, so the recipe's own
 * constraints (no kick on a backbeat, no three kicks in a row, the target syncopation) apply.
 */
import type { Rng } from './rng';
import { VOCAB, type StyleDef } from './styles';
import { clamp, type BarRole, type Recipe } from './types';

export const GROOVES = ['backbeat', 'sparse', 'minimal', 'pushed', 'lopsided', 'halftime', 'break', 'twostep', 'rolling', 'linear', 'ghostled', 'syncopated', 'floor', 'skip', 'fragment', 'shuffle'] as const;
export type GrooveId = (typeof GROOVES)[number];

export const CYMBAL_APPROACHES = ['none', 'punctuate', 'quarters', 'offbeats', 'broken', 'tresillo', 'eighths', 'spang', 'linear', 'triplet', 'gallop', 'sixteenths', 'rapid'] as const;
export type CymbalId = (typeof CYMBAL_APPROACHES)[number];

export const MOTIFS = ['vary', 'echo', 'displace', 'truncate', 'extend'] as const;
export type MotifId = (typeof MOTIFS)[number];

export interface GrooveApproach {
  label: string;
  blurb: string;
  /** the recipe's foundation strategy as this approach plays it */
  shape: (def: StyleDef, rng: Rng) => { def: StyleDef; note?: string };
  /** how well it suits the controls (a weight multiplier) */
  fit: (r: Recipe) => number;
  /** cymbal approaches it leans towards (multipliers) */
  cymbals?: Partial<Record<CymbalId, number>>;
  /** motif developments it leans towards (multipliers) */
  motif?: Partial<Record<MotifId, number>>;
  /** off-beat kicks and ghosts move to the triplet grid (a shuffle) */
  triplet?: boolean;
}

const scaleW = (w: readonly number[], m: Record<number, number>) => w.map((x, s) => x * (m[s] ?? 1));
const setW = (m: Record<number, number>, base = 0.03) => Array.from({ length: 16 }, (_, s) => (s === 0 ? 0 : (m[s] ?? base)));
const merge = <T extends Record<string, number>>(a: T, b: Partial<T>, k = 1): T => {
  const out = { ...a };
  for (const [key, v] of Object.entries(b)) (out as Record<string, number>)[key] = Math.max((a as Record<string, number>)[key] ?? 0, (v as number) * k);
  return out;
};

/** Asymmetric groupings of the sixteen sixteenths (Butler's uneven patterns, tracker-style grouping): the onsets are the group starts. */
export const GROUPINGS: number[][] = [
  [3, 3, 2, 3, 3, 2],
  [3, 3, 3, 3, 4],
  [3, 3, 2, 2, 3, 3],
  [5, 5, 6],
  [3, 5, 3, 5],
  [2, 3, 3, 2, 3, 3],
  [4, 3, 3, 3, 3],
];

export const GROOVE_DEFS: Record<GrooveId, GrooveApproach> = {
  backbeat: {
    label: 'BACKBEAT',
    blurb: 'the recipe’s own backbeat groove',
    shape: (def) => ({ def }),
    fit: () => 1,
  },
  sparse: {
    label: 'SPARSE',
    blurb: 'few kicks, the snare on its own, room left open',
    shape: (def) => ({
      def: {
        ...def,
        kickCount: [Math.max(1, def.kickCount[0] - 1), Math.max(2, Math.round(def.kickCount[1] * 0.6))],
        ghostMax: Math.round(def.ghostMax * 0.5),
        extraSnare: { ...def.extraSnare, p: def.extraSnare.p * 0.3 },
        percP: def.percP * 0.5,
        kickPairs: def.kickPairs * 0.6,
        syncRange: [def.syncRange[0] * 0.8, def.syncRange[1] * 0.8],
      },
    }),
    fit: (r) => 1.5 - r.density,
    cymbals: { none: 1.8, punctuate: 1.8, quarters: 1.4, broken: 1.2 },
    motif: { truncate: 1.6, echo: 1.2 },
  },
  minimal: {
    label: 'MINIMAL',
    blurb: 'the downbeat, the backbeat and almost nothing else',
    shape: (def) => ({ def: { ...def, kickCount: [1, 2], ghostMax: Math.round(def.ghostMax * 0.25), extraSnare: { ...def.extraSnare, p: 0 }, percP: def.percP * 0.3, dragP: 0, kickPairs: 0.2 } }),
    fit: (r) => clamp(1.6 - 1.5 * r.density, 0.1, 1.6),
    cymbals: { none: 1.5, punctuate: 1.6, quarters: 1.3, offbeats: 1.2 },
    motif: { truncate: 1.5, vary: 0.6 },
  },
  pushed: {
    label: 'PUSHED',
    blurb: 'kicks and snares anticipating the beat (on the “a” before it)',
    shape: (def) => ({
      def: {
        ...def,
        kickWeights: scaleW(def.kickWeights, { 3: 2, 7: 2.2, 11: 1.8, 15: 2.2, 1: 0.5, 5: 0.5, 9: 0.5, 13: 0.5 }),
        syncRange: [def.syncRange[0] + 1, def.syncRange[1] + 2],
        extraSnare: { p: Math.max(0.15, def.extraSnare.p * 1.4), steps: { ...def.extraSnare.steps, 15: 1, 7: 0.8 } },
      },
    }),
    fit: (r) => 0.6 + r.syncopation,
    cymbals: { broken: 1.3, offbeats: 1.2 },
    motif: { extend: 1.4, displace: 1.2 },
  },
  lopsided: {
    label: 'LOPSIDED',
    blurb: 'kicks on the “e”s and doubled a sixteenth apart, a late snare now and then (displacement, after Dilla)',
    shape: (def) => ({
      def: {
        ...def,
        kickWeights: scaleW(def.kickWeights.map((w) => Math.max(w, 0.15)), { 1: 2.6, 3: 1.6, 9: 2.4, 13: 1.6, 6: 0.5, 10: 0.6 }),
        kickPairs: Math.max(def.kickPairs, 0.6) * 1.3,
        extraSnare: { p: Math.max(0.15, def.extraSnare.p), steps: { 13: 0.6, 3: 0.3, 15: 0.6 } },
        displaceP: Math.max(def.displaceP, 0.18),
      },
    }),
    fit: (r) => 0.5 + r.complexity,
    cymbals: { eighths: 1.3, triplet: 1.3, broken: 1.2 },
    motif: { displace: 1.6 },
  },
  halftime: {
    label: 'HALF-TIME',
    blurb: 'one backbeat on 3: the same tempo, half the pulse',
    shape: (def) => ({
      def:
        def.backbeat === 'three'
          ? def
          : {
              ...def,
              backbeat: 'three',
              fixedKicks: [],
              kickWeights: setW({ 2: 0.6, 3: 0.5, 4: 0.3, 6: 0.55, 7: 0.6, 10: 0.6, 11: 0.55, 12: 0.3, 14: 0.55, 15: 0.45 }, 0.1),
              kickCount: [1, Math.max(2, def.kickCount[1] - 1)],
              extraSnare: { p: def.extraSnare.p, steps: { 15: 1, 14: 0.5, 6: 0.3 } },
              syncRange: [Math.max(0, def.syncRange[0] - 1), def.syncRange[1]],
            },
    }),
    fit: () => 1,
    cymbals: { sixteenths: 1.3, rapid: 1.4, triplet: 1.3, eighths: 1.1 },
  },
  break: {
    label: 'BREAK-DERIVED',
    blurb: 'a funk break’s figure: snares on 2 and 4 with the extra snares around 3, paired kicks (Amen, Think)',
    shape: (def) => ({
      def: {
        ...def,
        extraSnare: { p: Math.max(def.extraSnare.p, 0.45), steps: { 7: 1, 9: 0.9, 15: 0.6, 14: 0.4 } },
        kickWeights: scaleW(def.kickWeights.map((w) => Math.max(w, 0.1)), { 2: 1.8, 10: 1.8, 11: 1.6 }),
        kickPairs: Math.max(def.kickPairs, 0.8),
        ghostFigures: merge(def.ghostFigures, { rolling: 0.6, pickup: 0.8 }),
        fixedKicks: [],
      },
    }),
    fit: (r) => 0.6 + 0.6 * r.complexity,
    cymbals: { eighths: 1.3, sixteenths: 1.1, broken: 1.1 },
    motif: { vary: 1.2, echo: 1.1 },
  },
  twostep: {
    label: 'TWO-STEP',
    blurb: 'two kicks: the 1 and the “and” of 3, snares on 2 and 4',
    shape: (def) => ({ def: { ...def, fixedKicks: [10], kickWeights: setW({ 2: 0.3, 7: 0.25, 11: 0.25, 15: 0.2 }, 0.02), kickCount: [2, 3], extraSnare: { ...def.extraSnare, p: def.extraSnare.p * 0.5 }, floor: 0 } }),
    fit: () => 1,
    cymbals: { offbeats: 1.3, eighths: 1.1, gallop: 1.1 },
    motif: { truncate: 1.2, extend: 1.2 },
  },
  rolling: {
    label: 'ROLLING',
    blurb: 'the two-step with rolling ghost snares and a skipping second kick',
    shape: (def) => ({
      def: {
        ...def,
        fixedKicks: [10],
        kickWeights: setW({ 2: 0.5, 3: 0.3, 7: 0.3, 11: 0.6, 15: 0.4 }, 0.03),
        kickCount: [2, 4],
        ghostMax: Math.min(8, Math.round(Math.max(def.ghostMax, 3) * 1.5)),
        ghostFigures: merge(def.ghostFigures, { rolling: 1, pickup: 1, anticipate: 1 }),
        dragP: def.dragP * 1.3,
        floor: 0,
      },
    }),
    fit: (r) => 0.5 + r.ghosts,
    cymbals: { gallop: 1.3, sixteenths: 1.2, offbeats: 1.1 },
  },
  linear: {
    label: 'LINEAR',
    blurb: 'one limb at a time: the hats fill the places the kick and snare leave',
    shape: (def) => ({ def: { ...def, kickPairs: def.kickPairs * 0.5, ghostMax: Math.round(def.ghostMax * 0.8) } }),
    fit: (r) => 0.4 + r.complexity,
    cymbals: { linear: 5 },
    motif: { displace: 1.2 },
  },
  ghostled: {
    label: 'GHOST-LED',
    blurb: 'soft ghost strokes carry the motion between few kicks',
    shape: (def) => ({
      def: {
        ...def,
        ghostMax: Math.min(9, Math.round(Math.max(def.ghostMax, 2) * 1.6)),
        ghostFigures: merge(def.ghostFigures, { inner: 1, pickup: 1, rebound: 0.9 }),
        kickCount: [def.kickCount[0], Math.max(2, Math.round(def.kickCount[1] * 0.8))],
      },
    }),
    fit: (r) => 0.3 + r.ghosts * 1.2,
    cymbals: { eighths: 1.3, quarters: 1.2, punctuate: 1.1 },
  },
  syncopated: {
    label: 'SYNCOPATED',
    blurb: 'kicks off the beat, a moved backbeat now and then',
    shape: (def) => ({
      def: {
        ...def,
        syncRange: [def.syncRange[0] + 2, def.syncRange[1] + 3],
        kickWeights: def.kickWeights.map((w, s) => (s % 2 ? Math.max(w, 0.2) * 1.4 : w)),
        displaceP: Math.min(0.9, Math.max(def.displaceP, 0.08) * 1.5),
      },
    }),
    fit: (r) => 0.3 + r.syncopation + 0.5 * r.complexity,
    cymbals: { tresillo: 1.3, broken: 1.3 },
    motif: { displace: 1.3 },
  },
  floor: {
    label: 'FOUR-TO-THE-FLOOR',
    blurb: 'a kick on every beat under the break',
    shape: (def) => ({ def: { ...def, floor: 1, kickCount: [2, Math.max(3, def.kickCount[1] - 1)] } }),
    fit: () => 1,
    cymbals: { offbeats: 1.6, sixteenths: 1.1 },
  },
  skip: {
    label: 'TWO-STEP SKIP',
    blurb: 'kicks that skip the beats: the 1, then late in beats 2 and 3',
    shape: (def) => ({ def: { ...def, kickWeights: setW({ 2: 0.15, 3: 0.7, 6: 0.25, 7: 0.6, 8: 0.05, 9: 0.25, 10: 1, 11: 0.8, 14: 0.3, 15: 0.45 }, 0.02), kickCount: [2, 3], floor: 0 } }),
    fit: () => 1,
    cymbals: { gallop: 1.4, offbeats: 1.2, triplet: 1.2 },
  },
  fragment: {
    label: 'FRAGMENTS',
    blurb: 'kicks and snares on an uneven grouping of the bar (3+3+2, 5+5+6 …)',
    shape: (def, rng) => {
      const g = GROUPINGS[rng.int(GROUPINGS.length)]!;
      const starts: number[] = [];
      let at = 0;
      for (const n of g) {
        starts.push(at);
        at += n;
      }
      const kw: Record<number, number> = {};
      const sw: Record<number, number> = {};
      starts.forEach((s, i) => {
        if (s === 0) return;
        if (i % 2 === 1) kw[s] = 1.6;
        else sw[s] = 0.9;
        kw[s] = kw[s] ?? 0.5;
      });
      return {
        def: { ...def, kickWeights: setW(kw, 0.05), extraSnare: { p: Math.max(def.extraSnare.p, 0.4), steps: sw }, syncRange: [def.syncRange[0] + 2, def.syncRange[1] + 3], displaceP: Math.min(0.9, def.displaceP * 1.5), kickPairs: def.kickPairs * 0.5, floor: 0, fixedKicks: [] },
        note: g.join('+'),
      };
    },
    fit: (r) => 0.5 + r.complexity,
    cymbals: { tresillo: 1.5, broken: 1.3, linear: 1.2 },
    motif: { displace: 1.3, truncate: 1.2 },
  },
  shuffle: {
    label: 'SHUFFLE',
    blurb: 'off-beat kicks and ghosts on the triplet grid',
    shape: (def) => ({ def: { ...def, ghostFigures: merge(def.ghostFigures, { inner: 0.8, rebound: 0.9 }) } }),
    fit: (r) => 0.6 + r.swing,
    cymbals: { triplet: 4, spang: 2 },
    triplet: true,
  },
};

/** Weighted choice from a record of weights (keys in a fixed order, so the draw is deterministic). */
export function pickWeighted<K extends string>(rng: Rng, order: readonly K[], w: Partial<Record<K, number>>): K {
  const keys = order.filter((k) => (w[k] ?? 0) > 0);
  if (!keys.length) return order[0]!;
  const i = rng.weighted(keys.map((k) => w[k]!));
  return keys[Math.max(0, i)]!;
}

/** The groove approach of a break: from the recipe's vocabulary, leaned by the controls. */
export function chooseGroove(def: StyleDef, recipe: Recipe, rng: Rng): GrooveId {
  const w: Partial<Record<GrooveId, number>> = {};
  for (const g of GROOVES) {
    const base = VOCAB[def.style].grooves[g] ?? 0;
    if (base > 0) w[g] = base * clamp(GROOVE_DEFS[g].fit(recipe), 0.05, 3);
  }
  return pickWeighted(rng, GROOVES, w);
}

/** A phrase form: the role of each bar (A groove, A2 answer, B development, F short fill, T turnaround), always ending in T when longer than a bar. */
type Form = BarRole[];
const F = (s: string): Form => s.split(' ') as Form;

/** The phrase forms of 1–4 bars, with their weights from VARIATION (v), FILLS (f) and the recipe. */
function forms(n: number, def: StyleDef, r: Recipe): [Form, number][] {
  const v = r.variation;
  // the chop recipes develop (resequence) a bar before the turnaround
  const chop = def.chop >= 0.4 ? 2.5 : 0;
  const loop = def.loop ? 1 : 0;
  switch (n) {
    case 1:
      return [[F('A'), 1]];
    case 2:
      // two bars: the groove and its turnaround (the turnaround is always the last bar)
      return [[F('A T'), 1]];
    case 3:
      return [[F('A A2 T'), 1], [F('A A T'), 0.3 + 0.7 * (1 - v) + loop], [F('A B T'), 0.6 * v + chop]];
    default:
      return [
        [F('A A2 A T'), 1],
        [F('A A A2 T'), 0.5],
        [F('A A2 B T'), 0.8 * v + chop],
        [F('A A A T'), 0.6 * (1 - v) + 0.6 * loop],
        [F('A B A T'), 0.5 * v],
        [F('A A2 A2 T'), 0.3],
      ];
  }
}

/**
 * The phrase form of a break (revision 3). Short phrases choose among several forms; 5–8 bars
 * are built from four-bar units: the first ends in a short fill (F), the second is a form of the
 * remaining bars. VARIATION leans the choice (low: repetition, high: contrast); every seed can
 * still reach several forms.
 */
export function chooseForm(bars: number, def: StyleDef, recipe: Recipe, rng: Rng): BarRole[] {
  const pick = (n: number): Form => {
    const fs = forms(n, def, recipe);
    const i = rng.weighted(fs.map((x) => Math.max(0, x[1])));
    return fs[Math.max(0, i)]![0].slice();
  };
  const n = clamp(Math.round(bars), 1, 8);
  if (n <= 4) return pick(n);
  if (n === 5) {
    const opts: [Form, number][] = [[F('A A2 A B T'), 1], [F('A A A2 B T'), 0.5], [F('A A2 A A2 T'), 0.3 + 0.5 * (1 - recipe.variation)], [F('A B A B T'), 0.2 + 0.5 * recipe.variation]];
    return opts[Math.max(0, rng.weighted(opts.map((x) => x[1])))]![0].slice();
  }
  const first = pick(4);
  first[3] = recipe.fills > 0.05 ? 'F' : first[3] === 'T' ? 'A2' : first[3]!;
  return [...first, ...pick(n - 4)];
}

/** The motif development of a break's answer bars (revision 3). */
export function chooseMotif(def: StyleDef, groove: GrooveId, rng: Rng): MotifId {
  const base: Record<MotifId, number> = def.loop
    ? { vary: 0.5, echo: 0.8, displace: 0.2, truncate: 0.7, extend: 0.4 }
    : def.restless
      ? { vary: 1, echo: 0.4, displace: 0.8, truncate: 0.4, extend: 0.5 }
      : { vary: 1, echo: 0.6, displace: 0.5, truncate: 0.45, extend: 0.55 };
  const lean = GROOVE_DEFS[groove].motif ?? {};
  const w: Partial<Record<MotifId, number>> = {};
  for (const m of MOTIFS) w[m] = base[m] * (lean[m] ?? 1);
  return pickWeighted(rng, MOTIFS, w);
}

export const MOTIF_LABEL: Record<MotifId, string> = {
  vary: 'varied',
  echo: 'echoed (the second half answers the first)',
  displace: 'displaced by a sixteenth',
  truncate: 'cut short (space at the end)',
  extend: 'extended into the next bar',
};

export const CYMBAL_LABEL: Record<CymbalId, string> = {
  none: 'NONE',
  punctuate: 'SPARSE ACCENTS',
  quarters: 'QUARTERS',
  offbeats: 'OFF-BEATS',
  broken: 'BROKEN EIGHTHS',
  tresillo: '3+3+2',
  eighths: 'EIGHTHS',
  spang: 'JAZZ RIDE',
  linear: 'LINEAR',
  triplet: 'TRIPLETS',
  gallop: 'SKIPPING 16THS',
  sixteenths: 'SIXTEENTHS',
  rapid: 'RAPID',
};
