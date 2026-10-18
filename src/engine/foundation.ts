/**
 * Layer A (engine 2): the rhythmic foundation of the groove cell (one bar of kick and snare).
 *
 * 1. Backbeat: snares on 2 and 4 (or one on 3 for HALF-TIME), possibly displaced (rarely in FUNK
 *    and HIP-HOP, usually in BROKEN), joined by extra snares as complexity rises.
 * 2. Kicks: the downbeat and the style's fixed kicks (D&B's "and" of 3), then candidates drawn from
 *    the style's metrical preferences and their relation to the snares (never on a backbeat;
 *    pickups just before one are welcome; answering just after one is welcome).
 * 3. Generate-and-test: many candidate kick patterns are scored against target density and target
 *    syncopation (an inverted U is what grooves, so the target is a chosen amount, not a maximum)
 *    and against musical constraints; the best is kept. Engine 2 adds a preference for kick PAIRS
 *    (doubles, as in the documented "double kick" of the Amen and the paired kicks of Funky
 *    Drummer), scaled per style.
 * 4. HARDCORE may layer a four-on-the-floor kick under the break ("looped breakbeats to funk up
 *    house's four-to-the-floor", Reynolds, via docs/BREAKBEAT_RESEARCH.md §1.6). Those kicks may
 *    sit under a backbeat: it is a layer, not the break's own kick.
 */
import { onsetArray, posName, syncopation } from './meter';
import type { Rng } from './rng';
import type { StyleDef } from './styles';
import { clamp, lerp, STEPS, type Hit, type Recipe } from './types';

export interface Foundation {
  hits: Hit[];
  /** the backbeat positions in this bar (after any displacement) */
  backbeats: number[];
  /** syncopation of the kick+snare onsets */
  sync: number;
  target: number;
  /** a four-on-the-floor kick is layered under the break */
  floor: boolean;
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

/** Backbeat positions: 2 and 4 (or 3), or a displaced version of them. */
export function chooseBackbeats(def: StyleDef, recipe: Recipe, rng: Rng): { steps: number[]; displaced: number[] } {
  const p = def.displaceP * (0.35 + 0.65 * recipe.complexity);
  if (def.backbeat === 'three') {
    if (!rng.chance(p)) return { steps: [8], displaced: [] };
    const to = [9, 10, 7][rng.weighted([1, 0.7, 0.3])]!;
    return { steps: [to], displaced: [to] };
  }
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

/** Kick pairs: two kicks an eighth or a sixteenth apart (a "double kick"). */
export function kickPairs(kicks: number[]): number {
  let n = 0;
  for (let i = 1; i < kicks.length; i++) if (kicks[i]! - kicks[i - 1]! <= 2) n++;
  return n;
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
      why: displaced ? `backbeat moved to ${posName(s)}: a displaced accent` : def.backbeat === 'three' ? `backbeat on ${posName(s)} only: the half-time anchor` : `backbeat on ${posName(s)}: the anchor of the groove`,
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
  const fixed = def.fixedKicks.filter((s) => s > 0 && !snareSteps.has(s));
  const oddBoost = lerp(0.35, 1.4, recipe.complexity);
  const kw = def.kickWeights.map((w, s) => {
    if (s === 0 || snareSteps.has(s) || fixed.includes(s)) return 0;
    let x = w;
    if (s % 2 === 1) x *= oddBoost;
    if (snareSteps.has(s + 1)) x *= 0.7; // a pickup into a snare: fine, but not too often
    if (snareSteps.has(s - 1)) x *= 1.1; // answering the snare
    return x;
  });
  const target = lerp(def.syncRange[0], def.syncRange[1], recipe.syncopation);
  const count = clamp(Math.round(lerp(def.kickCount[0], def.kickCount[1], recipe.density) + rng.range(-0.6, 0.6)), 1 + fixed.length, 8);
  const allowedOdd = Math.round(0.5 + 2.5 * recipe.complexity);

  let best: { kicks: number[]; score: number; sync: number } | null = null;
  for (let c = 0; c < 40; c++) {
    const kicks = [0, ...fixed, ...weightedPickSteps(rng, kw, count - 1 - fixed.length)].sort((a, b) => a - b);
    const onsets = onsetArray([...kicks, ...bb.steps]);
    const sync = syncopation(onsets);
    let score = Math.abs(sync - target);
    // three kicks in a row sound like a mistake rather than a groove
    for (let i = 0; i < kicks.length - 2; i++) if (kicks[i + 2]! - kicks[i]! === 2) score += 1.5;
    // something should push into the middle of the bar or answer the first backbeat
    if (def.style !== 'broken' && def.backbeat === 'two-four' && !kicks.some((s) => s >= 6 && s <= 11)) score += 1;
    // half-time: the back half of the bar needs a kick to answer the backbeat on 3
    if (def.backbeat === 'three' && !kicks.some((s) => s >= 10)) score += 0.8;
    const odd = kicks.filter((s) => s % 2 === 1).length;
    score += 0.7 * Math.max(0, odd - allowedOdd);
    // doubles: one pair is idiomatic for most styles, two can be, more is clutter
    const pairs = kickPairs(kicks);
    score -= def.kickPairs * 0.5 * Math.min(pairs, 1);
    score += 0.4 * Math.max(0, pairs - 2);
    score += rng.range(0, 0.6); // tie-breaker so equal candidates vary
    if (!best || score < best.score) best = { kicks, score, sync };
  }

  for (const s of best!.kicks) {
    const pickup = snareSteps.has(s + 1);
    const isFixed = fixed.includes(s);
    const role = s === 0 ? 'downbeat' : s % 2 === 1 ? (pickup ? 'pickup kick' : 'syncopated kick') : pickup ? 'pickup kick' : 'kick';
    const why =
      s === 0
        ? 'downbeat: the top of the bar'
        : isFixed
          ? `kick on ${posName(s)}: part of the ${def.label} skeleton`
          : role === 'pickup kick'
            ? `kick on ${posName(s)} leading into the snare`
            : role === 'syncopated kick'
              ? `kick on ${posName(s)}, off the beat: syncopation`
              : best!.kicks.some((o) => o !== s && Math.abs(o - s) <= 2)
                ? `kick on ${posName(s)}: one of a pair (a double kick)`
                : `kick on ${posName(s)}`;
    hits.push({ cat: 'kick', step: s, sub: 0, level: s === 0 ? 0.95 : s === 8 ? 0.86 : isFixed ? 0.88 : s % 2 === 1 ? 0.74 : 0.8, role, why });
  }

  const floor = def.floor > 0 && rng.chance(def.floor);
  if (floor) {
    for (const s of [4, 8, 12]) {
      if (best!.kicks.includes(s)) continue;
      hits.push({ cat: 'kick', step: s, sub: 0, level: 0.84, role: 'floor kick', why: `four-on-the-floor kick on ${posName(s)}, layered under the break` });
    }
  }
  return { hits, backbeats: bb.steps, sync: best!.sync, target, floor };
}
