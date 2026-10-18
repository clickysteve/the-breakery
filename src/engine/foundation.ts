/**
 * Layer A: the rhythmic foundation of the groove cell (one bar of kick and snare).
 *
 * 1. Backbeat snares on 2 and 4, possibly displaced (rarely in FUNK / HIP-HOP, usually in
 *    BROKEN) and joined by extra snares as complexity rises (JUNGLE most).
 * 2. Kicks: the downbeat, then candidates drawn from the style's metrical preferences and their
 *    relation to the snares (never on a backbeat; pickups just before one are welcome).
 * 3. Generate-and-test: many candidate kick patterns are scored against the target density and
 *    target syncopation (an inverted U is what grooves, so the target is a chosen amount, not a
 *    maximum) and against musical constraints; the best is kept.
 */
import { onsetArray, posName, syncopation } from './meter';
import type { Rng } from './rng';
import type { StyleDef } from './styles';
import { clamp, lerp, STEPS, type Hit, type Recipe } from './types';

export interface Foundation {
  hits: Hit[];
  /** the two backbeat positions in this bar (after any displacement) */
  backbeats: number[];
  /** syncopation of the kick+snare onsets */
  sync: number;
  target: number;
}

function weightedPickSteps(rng: Rng, weights: number[], count: number): number[] {
  const w = weights.slice();
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const k = rng.weighted(w);
    if (k < 0) break;
    out.push(k);
    w[k] = 0;
  }
  return out.sort((a, b) => a - b);
}

/** Backbeat positions: 2 and 4, or a displaced version of them. */
export function chooseBackbeats(def: StyleDef, recipe: Recipe, rng: Rng): { steps: number[]; displaced: number[] } {
  const p = def.displaceP * (0.35 + 0.65 * recipe.complexity);
  if (!rng.chance(p)) return { steps: [4, 12], displaced: [] };
  if (rng.chance(0.7)) {
    const opts = [11, 13, 14, 10];
    const to = opts[rng.weighted([1, 0.6, 0.8, 0.4])]!;
    return { steps: [4, to], displaced: [to] };
  }
  const opts = [6, 3, 5];
  const to = opts[rng.weighted([0.8, 0.5, 0.3])]!;
  return { steps: [to, 12], displaced: [to] };
}

export function generateFoundation(def: StyleDef, recipe: Recipe, rng: Rng): Foundation {
  const hits: Hit[] = [];
  const bb = chooseBackbeats(def, recipe, rng);
  for (const s of bb.steps) {
    const displaced = bb.displaced.includes(s);
    hits.push({
      cat: 'snare',
      step: s,
      sub: 0,
      level: displaced ? 0.92 : 1,
      role: displaced ? 'displaced backbeat' : 'backbeat',
      why: displaced ? `backbeat moved to ${posName(s)}: a displaced accent` : `backbeat on ${posName(s)}: the anchor of the groove`,
    });
  }

  // extra snares: more with complexity, never next to a backbeat
  const snareSteps = new Set(bb.steps);
  const nExtra = Math.round(def.extraSnare.p * recipe.complexity * 2.2 + rng.range(-0.4, 0.4));
  const extraW = new Array<number>(STEPS).fill(0);
  for (const [k, v] of Object.entries(def.extraSnare.steps)) {
    const s = Number(k);
    if (!snareSteps.has(s) && !snareSteps.has(s - 1) && !snareSteps.has(s + 1)) extraW[s] = v;
  }
  for (const s of weightedPickSteps(rng, extraW, clamp(nExtra, 0, 2))) {
    snareSteps.add(s);
    hits.push({ cat: 'snare', step: s, sub: 0, level: 0.82, role: 'extra snare', why: `extra snare on ${posName(s)}: busier snare part (complexity)` });
  }

  // kick candidate weights, conditioned on the snares
  const oddBoost = lerp(0.35, 1.4, recipe.complexity);
  const kw = def.kickWeights.map((w, s) => {
    if (s === 0 || snareSteps.has(s)) return 0;
    let x = w;
    if (s % 2 === 1) x *= oddBoost;
    if (snareSteps.has(s + 1)) x *= 0.7; // a pickup into a snare: fine, but not too often
    if (snareSteps.has(s - 1)) x *= 1.1; // answering the snare
    return x;
  });
  const target = lerp(def.syncRange[0], def.syncRange[1], recipe.syncopation);
  const count = clamp(Math.round(lerp(def.kickCount[0], def.kickCount[1], recipe.density) + rng.range(-0.6, 0.6)), 1, 8);
  const allowedOdd = Math.round(0.5 + 2.5 * recipe.complexity);

  let best: { kicks: number[]; score: number; sync: number } | null = null;
  for (let c = 0; c < 40; c++) {
    const kicks = [0, ...weightedPickSteps(rng, kw, count - 1)];
    const onsets = onsetArray([...kicks, ...bb.steps]);
    const sync = syncopation(onsets);
    let score = Math.abs(sync - target);
    // three kicks in a row sound like a mistake rather than a groove
    for (let i = 0; i < kicks.length - 2; i++) if (kicks[i + 2]! - kicks[i]! === 2) score += 1.5;
    // something should push into beat 3 or answer the first backbeat
    if (def.style !== 'broken' && !kicks.some((s) => s >= 6 && s <= 11)) score += 1;
    const odd = kicks.filter((s) => s % 2 === 1).length;
    score += 0.7 * Math.max(0, odd - allowedOdd);
    score += rng.range(0, 0.6); // tie-breaker so equal candidates vary
    if (!best || score < best.score) best = { kicks, score, sync };
  }

  for (const s of best!.kicks) {
    const pickup = snareSteps.has(s + 1);
    const role = s === 0 ? 'downbeat' : s % 2 === 1 ? (pickup ? 'pickup kick' : 'syncopated kick') : pickup ? 'pickup kick' : 'kick';
    const why =
      s === 0
        ? 'downbeat: the top of the bar'
        : role === 'pickup kick'
          ? `kick on ${posName(s)} leading into the snare`
          : role === 'syncopated kick'
            ? `kick on ${posName(s)}, off the beat: syncopation`
            : `kick on ${posName(s)}`;
    hits.push({ cat: 'kick', step: s, sub: 0, level: s === 0 ? 0.95 : s === 8 ? 0.86 : s % 2 === 1 ? 0.74 : 0.8, role, why });
  }
  return { hits, backbeats: bb.steps, sync: best!.sync, target };
}
