/**
 * Layer B: supporting voices, placed in response to the foundation, not independently.
 *
 * - Timekeeper (hat or ride): eighths or sixteenths; open-hat lifts on off-beats, with the next
 *   hat closing them (choke group in the audio layer).
 * - Ghost snares: on weak sixteenths, mostly anticipating or answering a backbeat, rarely in
 *   unison with a kick, never three snare strokes in a row; optional 32nd drags.
 * - Percussion: complements the composite rhythm (a Euclidean figure rotated into the gaps) or
 *   reinforces the backbeat.
 */
import { euclid, onBeat, posName } from './meter';
import type { Rng } from './rng';
import type { StyleDef } from './styles';
import { clamp, lerp, STEPS, type Hit, type Recipe } from './types';

export interface SupportPlan {
  timekeeper: 'hat' | 'ride';
  sixteenths: boolean;
}

export function planSupport(def: StyleDef, recipe: Recipe, rng: Rng): SupportPlan {
  return {
    timekeeper: rng.chance(def.rideP) ? 'ride' : 'hat',
    sixteenths: recipe.density + rng.range(-0.1, 0.1) > def.sixteenthsAbove,
  };
}

/** Nominal level of a timekeeper stroke: accents on beats, alternate sixteenths softer. */
export function timeLevel(step: number, sixteenths: boolean): number {
  if (onBeat(step)) return 0.74;
  if (step % 2 === 0) return sixteenths ? 0.6 : 0.62;
  return 0.46;
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
  openW[14] = 1;
  openW[6] = 0.8;
  openW[10] = 0.55;
  openW[2] = 0.35;
  if (plan.sixteenths) {
    openW[7] = 0.2;
    openW[15] = 0.25;
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
    hits.push({ cat: tk, step: s, sub: 0, level: timeLevel(s, plan.sixteenths), role: 'time', why: `${tk === 'ride' ? 'ride' : 'hat'} keeping ${plan.sixteenths ? 'sixteenths' : 'eighths'}` });
  }

  // ---- ghost snares, conditioned on backbeats and kicks
  const nGhost = clamp(Math.round(def.ghostMax * recipe.ghosts * rng.range(0.75, 1.15)), 0, 9);
  const gw = new Array<number>(STEPS).fill(0);
  for (let s = 1; s < STEPS; s++) {
    if (snares.has(s)) continue;
    let w = s % 2 === 1 ? 0.55 : s % 4 === 2 ? 0.3 : 0.08;
    for (const b of backbeats) {
      if (s === b - 1) w = Math.max(w, 1) * 3;
      else if (s === b + 1) w = Math.max(w, 1) * 2;
      else if (s === b - 2) w *= 1.6;
      else if (s === b + 2) w *= 1.4;
    }
    if (kicks.has(s)) w *= 0.45;
    gw[s] = w;
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
  }
  for (const s of ghosts.sort((a, b) => a - b)) {
    const before = backbeats.find((b) => b === s + 1);
    const after = backbeats.find((b) => b === s - 1 || b === s - 2);
    const why = before !== undefined ? `ghost on ${posName(s)}: anticipates the backbeat on ${posName(before)}` : after !== undefined ? `ghost on ${posName(s)}: answers the backbeat on ${posName(after)}` : `ghost on ${posName(s)}: fills the space between accents`;
    hits.push({ cat: 'ghost', step: s, sub: 0, level: def.ghostLevel + (before !== undefined ? 0.05 : 0) - (after !== undefined ? 0.03 : 0), role: 'ghost', why });
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
    if (rng.chance(0.65)) {
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
    } else {
      for (const b of backbeats) hits.push({ cat: 'perc', step: b, sub: 0, level: 0.5, role: 'perc', why: `percussion doubling the backbeat on ${posName(b)}` });
      if (rng.chance(0.5)) hits.push({ cat: 'perc', step: 14, sub: 0, level: 0.38, role: 'perc', why: 'percussion on 4&: a push into the next bar' });
    }
  }
  return hits;
}
