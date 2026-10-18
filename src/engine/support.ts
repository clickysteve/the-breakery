/**
 * Layer B (engine 2): supporting voices, placed in response to the foundation, not independently.
 *
 * - Timekeeper (hat or ride): eighths or sixteenths, with ONE accent cycle chosen per break and
 *   repeated every bar (docs/BREAKBEAT_RESEARCH.md §3.3, §3.4): accents on the beats, on the off-beats,
 *   on alternate sixteenths (the measured Porcaro hi-hat: every second sixteenth accented), with
 *   the backbeat (the loudest hats coincide with the snare), or a 3+3+2 grouping. Velocity changes
 *   therefore form a pattern, never independent noise. Open-hat lifts on the style's off-beats,
 *   closed by the next hat (choke group in the audio layer).
 * - Ghost snares are built from FIGURES around the true backbeats (not around every snare):
 *   anticipation (the sixteenth before), rebound (the sixteenth after), a two-stroke pickup that
 *   grows into the backbeat, "inner" strokes on the e/a of beats 1 and 3, and (jungle family)
 *   rolling pairs that lead from beat 3 into beat 4. Dynamics follow the figure: an anticipation
 *   is louder than a rebound, the second stroke of a pickup louder than the first. Rarely in
 *   unison with a kick, never three snare strokes in a row. Optional 32nd drags.
 * - Percussion: complements the composite rhythm (a Euclidean figure rotated into the gaps),
 *   reinforces the backbeat, or (GARAGE, ELECTRO) plays the off-beats.
 */
import { euclid, onBeat, posName } from './meter';
import type { Rng } from './rng';
import type { AccentCycle, GhostFigure, StyleDef } from './styles';
import { clamp, lerp, STEPS, type Hit, type Recipe } from './types';

export interface SupportPlan {
  timekeeper: 'hat' | 'ride';
  sixteenths: boolean;
  cycle: AccentCycle;
}

const CYCLES: AccentCycle[] = ['beats', 'offbeats', 'alternate', 'backbeat', 'tresillo'];

export function planSupport(def: StyleDef, recipe: Recipe, rng: Rng): SupportPlan {
  return {
    timekeeper: rng.chance(def.rideP) ? 'ride' : 'hat',
    sixteenths: recipe.density + rng.range(-0.1, 0.1) > def.sixteenthsAbove,
    cycle: CYCLES[Math.max(0, rng.weighted(CYCLES.map((c) => def.hatAccents[c])))]!,
  };
}

export const CYCLE_NAME: Record<AccentCycle, string> = {
  beats: 'accents on the beats',
  offbeats: 'accents on the off-beats',
  alternate: 'alternate sixteenths accented',
  backbeat: 'loudest with the backbeat',
  tresillo: 'accents grouped 3+3+2',
};

/** Nominal level of a timekeeper stroke under an accent cycle. */
export function timeLevel(step: number, sixteenths: boolean, cycle: AccentCycle = 'beats', backbeats: number[] = [4, 12]): number {
  const beat = onBeat(step);
  const and = step % 4 === 2;
  const odd = step % 2 === 1;
  switch (cycle) {
    case 'offbeats':
      return and ? 0.76 : beat ? 0.6 : 0.44;
    case 'alternate':
      return odd ? 0.44 : beat ? 0.72 : 0.68;
    case 'backbeat':
      return backbeats.includes(step) ? 0.8 : beat ? 0.7 : and ? 0.6 : 0.45;
    case 'tresillo': {
      const h = step % 8;
      return h === 0 || h === 3 || h === 6 ? 0.76 : beat || and ? 0.58 : 0.44;
    }
    default:
      if (beat) return 0.74;
      if (!odd) return sixteenths ? 0.6 : 0.62;
      return 0.46;
  }
}

/** Candidate weight of a ghost position for each figure (b = a backbeat). */
function figureWeight(s: number, b: number, fig: Record<GhostFigure, number>): { w: number; figure: GhostFigure | null } {
  let w = 0;
  let figure: GhostFigure | null = null;
  const take = (x: number, f: GhostFigure) => {
    if (x > w) {
      w = x;
      figure = f;
    }
  };
  if (s === b - 1) take(3 * fig.anticipate, 'anticipate');
  if (s === b + 1) take(2 * fig.rebound, 'rebound');
  if (s === b - 2) take(1.6 * fig.pickup, 'pickup');
  // rolling: the "e" of the beat before the second backbeat, joining a pickup (b-3, b-2, b-1)
  if (b >= 8 && s === b - 3) take(1.4 * fig.rolling, 'rolling');
  return { w, figure };
}

export function generateSupport(def: StyleDef, recipe: Recipe, plan: SupportPlan, foundation: Hit[], backbeats: number[], rng: Rng): Hit[] {
  const hits: Hit[] = [];
  const kicks = new Set(foundation.filter((h) => h.cat === 'kick').map((h) => h.step));
  const snares = new Set(foundation.filter((h) => h.cat === 'snare').map((h) => h.step));
  const tk = plan.timekeeper;

  // ---- timekeeper
  const timeSteps = new Set<number>();
  for (let s = 0; s < STEPS; s++) {
    if (s % 2 === 0) timeSteps.add(s);
    else if (plan.sixteenths && (def.style !== 'broken' || rng.chance(0.65))) timeSteps.add(s);
    else if (!plan.sixteenths && snares.has(s + 1) && rng.chance(0.25 * recipe.complexity)) timeSteps.add(s);
  }

  // ---- open-hat lifts
  const lifts: number[] = [];
  let nOpen = clamp(Math.round(def.openMax * recipe.complexity * rng.range(0.4, 1.2)), 0, def.openMax);
  if (tk === 'ride') nOpen = Math.floor(nOpen / 2);
  const openW = new Array<number>(STEPS).fill(0);
  for (const [k, v] of Object.entries(def.openSteps)) openW[Number(k)] = v;
  if (plan.sixteenths) {
    openW[7] = Math.max(openW[7]!, 0.2);
    openW[15] = Math.max(openW[15]!, 0.25);
  }
  for (let i = 0; i < nOpen; i++) {
    const s = rng.weighted(openW);
    if (s < 0) break;
    lifts.push(s);
    openW[s] = 0;
    if (s > 0) openW[s - 1] = 0;
    if (s < STEPS - 1) openW[s + 1] = 0;
  }
  for (const s of lifts) {
    if (tk === 'hat') timeSteps.delete(s);
    // let the lift ring for a sixteenth before the next hat closes it
    if (tk === 'hat' && s % 2 === 0) timeSteps.delete(s + 1);
    hits.push({ cat: 'open', step: s, sub: 0, level: 0.72, role: 'lift', why: `open hat on ${posName(s)}: a lift, closed by the next hat` });
  }
  for (const s of timeSteps) {
    hits.push({ cat: tk, step: s, sub: 0, level: timeLevel(s, plan.sixteenths, plan.cycle, backbeats), role: 'time', why: `${tk === 'ride' ? 'ride' : 'hat'} keeping ${plan.sixteenths ? 'sixteenths' : 'eighths'}, ${CYCLE_NAME[plan.cycle]}` });
  }

  // ---- ghost snares: figures around the true backbeats, conditioned on kicks
  const nGhost = clamp(Math.round(def.ghostMax * recipe.ghosts * rng.range(0.75, 1.15)), 0, 9);
  const gw = new Array<number>(STEPS).fill(0);
  const gfig = new Array<GhostFigure | null>(STEPS).fill(null);
  for (let s = 1; s < STEPS; s++) {
    if (snares.has(s)) continue;
    // background: weak sixteenths, then "and"s, rarely beats
    let w = (s % 2 === 1 ? 0.55 : s % 4 === 2 ? 0.3 : 0.08) * (0.4 + def.ghostFigures.inner);
    let fig: GhostFigure | null = s % 2 === 1 && (s < 4 || (s > 8 && s < 12)) ? 'inner' : null;
    for (const b of backbeats) {
      const f = figureWeight(s, b, def.ghostFigures);
      if (f.figure && f.w > 0) {
        w = Math.max(w, 1) * f.w;
        fig = f.figure;
      }
    }
    if (kicks.has(s)) w *= 0.45;
    gw[s] = w;
    gfig[s] = fig;
  }
  const strokes = new Set(snares);
  const ghosts: number[] = [];
  let guard = 0;
  while (ghosts.length < nGhost && guard++ < 40) {
    const s = rng.weighted(gw);
    if (s < 0) break;
    gw[s] = 0;
    // ghost, accent, ghost is fine; longer runs (and three ghosts in a row) belong in a fill
    let left = 0;
    while (strokes.has(s - left - 1)) left++;
    let right = 0;
    while (strokes.has(s + right + 1)) right++;
    if (left + right + 1 >= 4) continue;
    if (ghosts.includes(s - 1) && (ghosts.includes(s - 2) || ghosts.includes(s + 1))) continue;
    if (ghosts.includes(s + 1) && ghosts.includes(s + 2)) continue;
    ghosts.push(s);
    strokes.add(s);
    // a pickup's first stroke wants its second (b-2 then b-1): raise the partner's chance
    if (gfig[s] === 'pickup' && gw[s + 1]! > 0) gw[s + 1] = gw[s + 1]! * 2.5;
    if (gfig[s] === 'rolling' && gw[s + 2]! > 0) gw[s + 2] = gw[s + 2]! * 2;
  }
  ghosts.sort((a, b) => a - b);
  for (const s of ghosts) {
    const before = backbeats.find((b) => b === s + 1);
    const after = backbeats.find((b) => b === s - 1 || b === s - 2);
    const pickupInto = backbeats.find((b) => b === s + 2);
    const fig = gfig[s];
    let level = def.ghostLevel;
    let why: string;
    if (before !== undefined) {
      level += ghosts.includes(s - 1) ? 0.07 : 0.05; // the second stroke of a pickup grows into the backbeat
      why = `ghost on ${posName(s)}: anticipates the backbeat on ${posName(before)}`;
    } else if (pickupInto !== undefined) {
      level -= 0.02;
      why = `ghost on ${posName(s)}: starts a two-stroke pickup into ${posName(pickupInto)}`;
    } else if (after !== undefined) {
      level -= 0.03;
      why = `ghost on ${posName(s)}: rebounds from the backbeat on ${posName(after)}`;
    } else if (fig === 'rolling') {
      why = `ghost on ${posName(s)}: rolling sixteenths leading into the backbeat`;
    } else {
      level -= 0.02;
      why = `ghost on ${posName(s)}: fills the space between accents`;
    }
    hits.push({ cat: 'ghost', step: s, sub: 0, level, role: 'ghost', why });
  }

  // ---- 32nd-note drags into backbeats and ghosts (faster subdivisions)
  let drags = 0;
  const dragP = def.dragP * recipe.complexity;
  for (const s of [...backbeats, ...ghosts]) {
    if (drags >= 2 || s < 1 || !rng.chance(dragP)) continue;
    if (strokes.has(s - 1)) continue;
    hits.push({ cat: 'ghost', step: s - 1, sub: 6, level: def.ghostLevel - 0.05, role: 'drag', why: `32nd-note drag into ${posName(s)}` });
    drags++;
  }

  // ---- percussion
  if (rng.chance(def.percP * (0.5 + recipe.density))) {
    const mode = def.style === 'garage' || def.style === 'electro' ? rng.weighted([0.5, 0.2, 1]) : rng.weighted([0.65, 0.35, 0]);
    if (mode === 0) {
      const k = Math.round(lerp(3, 7, recipe.density));
      const occupied = new Set([...kicks, ...snares]);
      let bestRot = 0;
      let bestScore = Infinity;
      for (let r = 0; r < STEPS; r++) {
        const e = euclid(k, STEPS, r);
        let overlap = 0;
        e.forEach((on, s) => on && occupied.has(s) && overlap++);
        const score = overlap + rng.range(0, 0.9);
        if (score < bestScore) {
          bestScore = score;
          bestRot = r;
        }
      }
      euclid(k, STEPS, bestRot).forEach((on, s) => {
        if (on) hits.push({ cat: 'perc', step: s, sub: 0, level: onBeat(s) ? 0.5 : 0.42, role: 'perc', why: `percussion: ${k} hits spread evenly into the gaps (E(${k},16))` });
      });
    } else if (mode === 1) {
      for (const b of backbeats) hits.push({ cat: 'perc', step: b, sub: 0, level: 0.5, role: 'perc', why: `percussion doubling the backbeat on ${posName(b)}` });
      if (rng.chance(0.5)) hits.push({ cat: 'perc', step: 14, sub: 0, level: 0.38, role: 'perc', why: 'percussion on 4&: a push into the next bar' });
    } else {
      // off-beat rim / shaker figure: the "and"s, with one anticipation
      for (const s of [2, 6, 10, 14]) if (!snares.has(s)) hits.push({ cat: 'perc', step: s, sub: 0, level: 0.46, role: 'perc', why: `percussion on the off-beat ${posName(s)}` });
      const extra = [3, 7, 11, 15].filter((s) => !snares.has(s));
      if (extra.length && rng.chance(0.6)) {
        const s = rng.pick(extra);
        hits.push({ cat: 'perc', step: s, sub: 0, level: 0.36, role: 'perc', why: `percussion on ${posName(s)}: a skip ahead of the beat` });
      }
    }
  }
  return hits;
}
