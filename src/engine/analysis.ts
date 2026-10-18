/**
 * Measurements of a break, for the pattern view's summary line, the tests, and the evaluation
 * script that compares generated breaks with random patterns (docs/EVALUATION.md).
 */
import { onsetArray, syncopation } from './meter';
import type { Rng } from './rng';
import { CATEGORIES, STEPS, type BreakEvent, type Category } from './types';

export interface BreakStats {
  hits: number;
  perCat: Record<Category, number>;
  /** hits per bar */
  density: number;
  /** mean syncopation per bar of kick + accented snare */
  sync: number;
  /** fraction of bars with a snare accent on both 2 and 4 */
  backbeat24: number;
  /** fraction of ghost notes within a sixteenth of a snare accent */
  ghostsNearAccent: number;
  /** mean Jaccard similarity of each bar's onsets (on 16ths, all categories) to bar 1 */
  barSimilarity: number;
  /** kicks on the same step as a snare accent, per bar */
  kickSnareClashes: number;
  meanAbsOffsetMs: number;
}

const accent = (e: BreakEvent) => e.cat === 'snare' && e.vel >= 70;

function barOnsets(events: BreakEvent[], bar: number): Set<string> {
  return new Set(events.filter((e) => e.bar === bar).map((e) => `${e.cat}|${e.step}`));
}

export function analyse(events: BreakEvent[], bars: number): BreakStats {
  const perCat = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const e of events) perCat[e.cat]++;
  let sync = 0;
  let bb = 0;
  let clashes = 0;
  for (let b = 0; b < bars; b++) {
    const evs = events.filter((e) => e.bar === b && e.sub === 0);
    const k = evs.filter((e) => e.cat === 'kick').map((e) => e.step);
    const s = evs.filter(accent).map((e) => e.step);
    sync += syncopation(onsetArray([...k, ...s]));
    if (s.includes(4) && s.includes(12)) bb++;
    clashes += k.filter((x) => s.includes(x)).length;
  }
  const ghosts = events.filter((e) => e.cat === 'ghost');
  const near = ghosts.filter((g) => events.some((e) => accent(e) && e.bar === g.bar && Math.abs(e.step - g.step) <= 1)).length;
  const first = barOnsets(events, 0);
  let sim = 0;
  for (let b = 1; b < bars; b++) {
    const o = barOnsets(events, b);
    const inter = [...o].filter((x) => first.has(x)).length;
    const union = new Set([...o, ...first]).size;
    sim += union ? inter / union : 1;
  }
  return {
    hits: events.length,
    perCat,
    density: events.length / bars,
    sync: sync / bars,
    backbeat24: bb / bars,
    ghostsNearAccent: ghosts.length ? near / ghosts.length : 0,
    barSimilarity: bars > 1 ? sim / (bars - 1) : 1,
    kickSnareClashes: clashes / bars,
    meanAbsOffsetMs: events.length ? events.reduce((a, e) => a + Math.abs(e.offsetMs), 0) / events.length : 0,
  };
}

/**
 * A random baseline: the same number of hits per category and similar velocities, placed
 * uniformly at random on the sixteenth grid. Used to check the generator does better than chance.
 */
export function randomLike(events: BreakEvent[], bars: number, rng: Rng): BreakEvent[] {
  const out: BreakEvent[] = [];
  const used = new Set<string>();
  for (const e of events) {
    let bar = 0;
    let step = 0;
    for (let tries = 0; tries < 50; tries++) {
      bar = rng.int(bars);
      step = rng.int(STEPS);
      if (!used.has(`${e.cat}|${bar}|${step}`)) break;
    }
    used.add(`${e.cat}|${bar}|${step}`);
    out.push({ ...e, bar, step, sub: 0 });
  }
  return out;
}
