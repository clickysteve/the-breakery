/**
 * REGEN TRACK: regenerate one track (or a few) of the break and nothing else. Every other track
 * stays exactly as it was, hit for hit; the selected tracks are generated again and fitted to the
 * rest of the pattern.
 *
 * How: a regeneration step is stored in the seeds as a lineage entry (the tracks and a number),
 * so it is deterministic and survives reloads, history, favourites and undo like any seed. Baking
 * a step draws CANDIDATES: the whole GROOVE (and its transformations) baked again from seeds
 * derived from the break's BEAT seed, the tracks and the step's number (`regenSeeds`: a hash, no
 * Math.random), with the break's FEEL and KIT seeds so the playing and the sounds stay the
 * break's. From each candidate only the selected tracks are taken, and scored against the tracks
 * that stay (regenScore): a kick that leaves the backbeats to the snare and keeps the downbeats,
 * a snare that keeps the backbeat and does not sit on the kicks, ghosts near the backbeats and off
 * the kicks, a timekeeper that rests during a tom fill and does not double another timekeeper, toms in fill places and off the backbeats,
 * about as many hits as the track had, and never the same track again. The best candidate's
 * tracks replace the selected ones, after a repair (a ghost under a snare, a closed hat under an
 * open one, a hit on a crash's other limb, are dropped).
 *
 * A later step on the same tracks (or more) replaces the earlier ones, so the lineage stays short.
 * REGEN TRACK is an explicit request for a track, so it applies whatever FREEZE says (FREEZE
 * RHYTHM keeps the layers for BAKE; it does not stop the user regenerating a track by hand).
 */
import { hashString } from './rng';
import { CATEGORIES, TPB, TPS, type BarRole, type BreakEvent, type Category, type Seeds } from './types';

export interface Regen {
  cats: Category[];
  n: number;
}

/** Candidates drawn per step. */
export const REGEN_CANDIDATES = 6;

/** The lineage with a new step for these tracks (earlier steps for some of the same tracks only are dropped). */
export function regenStep(lineage: readonly Regen[] | undefined, cats: readonly Category[]): Regen[] {
  const set = CATEGORIES.filter((c) => cats.includes(c));
  const prev = lineage ?? [];
  const n = prev.reduce((m, r) => Math.max(m, r.n), 0) + 1;
  return [...prev.filter((r) => !r.cats.every((c) => set.includes(c))).map((r) => ({ cats: [...r.cats], n: r.n })), { cats: set, n }];
}

export function sanitiseRegen(v: unknown): Regen[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((r): r is Regen => !!r && typeof r === 'object' && Array.isArray((r as Regen).cats))
    .map((r) => ({ cats: CATEGORIES.filter((c) => r.cats.includes(c)), n: Math.max(1, Math.floor(Number(r.n) || 1)) }))
    .filter((r) => r.cats.length);
  return out.length ? out : undefined;
}

/** The seeds of candidate `k` for a step: from the beat seed, the tracks and the number. */
export function regenSeeds(base: Seeds, step: Regen, k: number): Seeds {
  const id = `${base.beat}|${step.cats.join(',')}|${step.n}|${k}`;
  return { beat: hashString(`regen|beat|${id}`), detail: hashString(`regen|detail|${id}`), feel: base.feel, kit: base.kit };
}

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const isBackbeat = (e: BreakEvent) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');
const isTomCat = (c: Category) => c === 'htom' || c === 'mtom' || c === 'ltom';
const HATS: Category[] = ['hat', 'open', 'ride'];

/** How well a candidate track fits the tracks that stay (higher is better). */
export function regenScore(track: readonly BreakEvent[], context: readonly BreakEvent[], original: readonly BreakEvent[], cats: readonly Category[], plan: readonly BarRole[]): number {
  const key = (e: BreakEvent) => `${e.cat}|${tickOf(e)}`;
  const origKeys = new Set(original.map(key));
  const same = track.length === original.length && track.every((e) => origKeys.has(key(e)));
  if (same && original.length) return -1000; // REGEN must change the track (an empty track may stay empty: its time is kept elsewhere)
  const at = (cat: Category | ((e: BreakEvent) => boolean)) => new Set(context.filter((e) => (typeof cat === 'function' ? cat(e) : e.cat === cat)).map(tickOf));
  const kicks = at('kick');
  const snares = at('snare');
  const backbeats = at(isBackbeat);
  const crashes = at('crash');
  const keeping = at((e) => HATS.includes(e.cat) && e.role === 'time');
  const tomTicks = context.filter((e) => isTomCat(e.cat) && e.role === 'fill').map(tickOf);
  const inTomFill = (t: number) => tomTicks.some((x) => Math.abs(x - t) <= TPS);
  const bars = plan.length;
  let s = 0;
  for (const c of cats) {
    const mine = track.filter((e) => e.cat === c);
    const was = original.filter((e) => e.cat === c).length;
    // about as present as the track was (a regenerated track is a new take, not a new density)
    s -= (3 * Math.abs(mine.length - was)) / Math.max(2, was);
    for (const e of mine) {
      const t = tickOf(e);
      if (c === 'kick') {
        if (backbeats.has(t)) s -= 1.5;
        if (e.step === 0 && e.sub === 0) s += 1;
        if (e.step % 2 === 1) s += 0.15; // a little syncopation is welcome
      } else if (c === 'snare') {
        if (isBackbeat(e)) s += 1.2;
        if (kicks.has(t) && !isBackbeat(e)) s -= 0.8;
      } else if (c === 'ghost') {
        if (kicks.has(t) || snares.has(t)) s -= 1;
        if ([...backbeats].some((b) => Math.abs(b - t) <= TPS && b !== t)) s += 0.4;
      } else if (HATS.includes(c)) {
        if (inTomFill(t)) s -= 0.6;
        if (crashes.has(t)) s -= 0.5;
        // one timekeeper: a hat over a ride (or a ride over hats) that keeps time doubles it
        if (keeping.has(t)) s -= 0.8;
      } else if (isTomCat(c)) {
        if (backbeats.has(t)) s -= 2;
        if (kicks.has(t)) s -= 0.3;
        const role = plan[e.bar];
        if (role === 'T' || role === 'F' || e.bar === bars - 1) s += 0.3;
        if (e.step >= 12) s += 0.2;
      }
    }
    // the downbeat kick of the loop is the groove's anchor
    if (c === 'kick' && !mine.some((e) => e.bar === 0 && e.step === 0 && e.sub === 0)) s -= 3;
    if (c === 'snare' && original.some(isBackbeat) && !mine.some(isBackbeat)) s -= 4;
  }
  return s;
}

/** A candidate track fitted to the tracks that stay: no hit where another limb already plays it. */
export function repairTrack(track: readonly BreakEvent[], context: readonly BreakEvent[]): BreakEvent[] {
  const ctxAt = new Set(context.map((e) => `${e.cat}|${tickOf(e)}`));
  return track.filter((e) => {
    const t = tickOf(e);
    if (e.cat === 'ghost' && ctxAt.has(`snare|${t}`)) return false;
    if (e.cat === 'hat' && ctxAt.has(`open|${t}`)) return false;
    if (e.cat === 'open' && ctxAt.has(`hat|${t}`)) return false;
    if ((e.cat === 'hat' || e.cat === 'ride') && ctxAt.has(`crash|${t}`)) return false;
    return true;
  });
}

export interface RegenReport {
  /** the tracks regenerated by the last step, and its candidate */
  cats: Category[];
  candidate: number;
  score: number;
}

/**
 * Apply the lineage: each step's tracks from the best of its candidates. `build` bakes the
 * candidate's events (the GROOVE and its transformations) from seeds.
 */
export function applyRegen(events: BreakEvent[], seeds: Seeds, plan: BarRole[], build: (s: Seeds) => BreakEvent[]): { events: BreakEvent[]; report?: RegenReport } {
  const lineage = seeds.regen;
  if (!lineage?.length) return { events };
  let out = events;
  let report: RegenReport | undefined;
  for (const step of lineage) {
    const cats = new Set(step.cats);
    const context = out.filter((e) => !cats.has(e.cat));
    const original = out.filter((e) => cats.has(e.cat));
    let best: BreakEvent[] | null = null;
    let bestScore = -Infinity;
    let bestK = 0;
    for (let k = 0; k < REGEN_CANDIDATES; k++) {
      const cand = build(regenSeeds(seeds, step, k)).filter((e) => cats.has(e.cat));
      const fitted = repairTrack(cand, context);
      const sc = regenScore(fitted, context, original, step.cats, plan);
      if (sc > bestScore) {
        bestScore = sc;
        best = fitted;
        bestK = k;
      }
    }
    if (!best) continue;
    const why = `REGEN TRACK ${step.n}`;
    out = [...context, ...best.map((e) => ({ ...e, why: `${e.why} (${why})` }))].sort((a, b) => tickOf(a) - tickOf(b) || a.cat.localeCompare(b.cat));
    report = { cats: [...step.cats], candidate: bestK, score: Math.round(bestScore * 100) / 100 };
  }
  return { events: out, report };
}
