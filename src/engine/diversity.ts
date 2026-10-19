/**
 * Diversity measures over MANY breaks of one recipe (different seeds), for docs/diversity-report.md
 * and the tests. analysis.ts measures one break; these measure how different the breaks a recipe
 * can make are from each other, and how the parts of each relate.
 *
 * Every measure works on onsets in grid ticks (bar, sixteenth, sub-tick), so a 32nd or a triplet
 * is a different onset from the sixteenth beside it. Velocity is used only for accents. No single
 * number says a recipe is "diverse": exact duplicates, nearest-neighbour similarity, distinct
 * shapes, the timekeeping style (subdivision class), the phrase form and density spread are read
 * together.
 */
import { onsetArray, syncopation } from './meter';
import { STEPS, TPB, TPS, type BreakEvent, type Category } from './types';

export const CYMBALS: Category[] = ['hat', 'open', 'ride'];
const HATS: Category[] = ['hat', 'open'];
const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const isBackbeat = (e: BreakEvent) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');

/** The onset fingerprint of some categories (optionally one bar), as a sorted key. */
export function fingerprint(events: readonly BreakEvent[], cats: readonly Category[] | null, bar?: number): string {
  return events
    .filter((e) => (!cats || cats.includes(e.cat)) && (bar === undefined || e.bar === bar))
    .map((e) => `${cats && cats.length === 1 ? '' : e.cat[0]}${bar === undefined ? tickOf(e) : tickOf(e) - bar * TPB}`)
    .sort()
    .join(',');
}

function onsets(events: readonly BreakEvent[], cats: readonly Category[] | null): Set<string> {
  return new Set(events.filter((e) => !cats || cats.includes(e.cat)).map((e) => `${cats && cats.length === 1 ? '' : e.cat}|${tickOf(e)}`));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Timekeeping styles of one bar of cymbals (how the hats and ride keep time, or don't). */
export const TIME_CLASSES = ['none', 'sparse', 'quarters', 'offbeats', 'eighths', 'sixteenths', 'triplet', 'broken'] as const;
export type TimeClass = (typeof TIME_CLASSES)[number];

/** The timekeeping class of a bar's cymbal onsets. */
export function timeClass(events: readonly BreakEvent[], bar: number, cats: readonly Category[] = CYMBALS): TimeClass {
  const evs = events.filter((e) => e.bar === bar && cats.includes(e.cat) && e.role !== 'roll' && e.cat !== 'crash');
  if (!evs.length) return 'none';
  const ticks = [...new Set(evs.map((e) => e.step * TPS + e.sub))].sort((a, b) => a - b);
  if (ticks.some((t) => t % TPS === 4 || t % TPS === 8)) return 'triplet';
  if (ticks.length <= 3) return 'sparse';
  const steps = ticks.filter((t) => t % TPS === 0).map((t) => t / TPS);
  if (steps.every((s) => s % 4 === 0)) return 'quarters';
  if (steps.every((s) => s % 4 === 2)) return 'offbeats';
  const odd = steps.filter((s) => s % 2 === 1).length;
  if (odd === 0) return steps.length >= 6 ? 'eighths' : 'broken';
  if (steps.length >= 12) return 'sixteenths';
  return 'broken';
}

/** Bars of a phrase labelled by identity (A, B, …): the phrase form. */
export function phraseForm(events: readonly BreakEvent[], bars: number): string {
  const seen: string[] = [];
  let out = '';
  for (let b = 0; b < bars; b++) {
    const fp = fingerprint(events, null, b);
    let i = seen.indexOf(fp);
    if (i < 0) i = seen.push(fp) - 1;
    out += String.fromCharCode(65 + i);
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

/** Normalised Shannon entropy of a distribution of keys (0 = all the same, 1 = all different). */
export function entropy(keys: readonly string[]): number {
  if (keys.length < 2) return 0;
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  let h = 0;
  for (const c of m.values()) {
    const p = c / keys.length;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(keys.length);
}

export interface Diversity {
  n: number;
  /** distinct whole patterns / n */
  distinctPatterns: number;
  /** distinct first-bar hat (closed + open) patterns / n, and their entropy */
  distinctHats: number;
  hatEntropy: number;
  /** distinct first-bar ride patterns / n */
  distinctRide: number;
  /** distinct first-bar kick + snare skeletons (no ghosts) / n */
  distinctKickSnare: number;
  /** distinct first-bar cymbal accent shapes (the loudest strokes) / n */
  distinctAccents: number;
  /** mean pairwise Jaccard similarity across seeds (whole phrase): cymbals, kick + snare, everything */
  simCymbals: number;
  simKickSnare: number;
  simAll: number;
  /** mean similarity of each break's cymbals to its nearest other break (1 = an identical one exists) */
  nnCymbals: number;
  /** timekeeping classes of the first bar: share of each, how many classes appear, the commonest's share */
  timeClasses: Record<TimeClass, number>;
  classCount: number;
  topClass: number;
  /** bars with a different timekeeping class from bar 1, per break (cymbal development) */
  classChanges: number;
  /** how many phrase forms (which bars repeat which: AABC …) appear, and their entropy in bits */
  forms: number;
  formBits: number;
  /** hits per bar: mean and spread across seeds */
  density: number;
  densitySd: number;
  cymbalDensity: number;
  cymbalDensitySd: number;
  /** later bars' Jaccard similarity to bar 1: mean and spread across seeds */
  barSim: number;
  barSimSd: number;
  /** kick + snare syncopation per bar: mean and spread */
  sync: number;
  syncSd: number;
  /** share of onsets per subdivision: beat, eighth off-beat, sixteenth, 32nd and finer, triplet */
  subdivision: { beat: number; and: number; sixteenth: number; fine: number; triplet: number };
  /** cross-instrument: share of kicks under a cymbal, share of backbeats under a cymbal, share of fill-bar cymbal strokes inside the fill */
  kickUnderCymbal: number;
  backbeatUnderCymbal: number;
  /** share of breaks with both hats and ride keeping time in the same bar */
  layered: number;
  /** share of breaks with no cymbal hits at all */
  noCymbals: number;
}

/** Diversity of a set of breaks (one recipe, many seeds). */
export function diversity(breaks: readonly { events: readonly BreakEvent[]; bars: number }[]): Diversity {
  const n = breaks.length;
  const distinct = (keys: string[]) => new Set(keys).size / Math.max(1, n);
  const all = breaks.map((b) => fingerprint(b.events, null));
  const hats0 = breaks.map((b) => fingerprint(b.events, HATS, 0));
  const ride0 = breaks.map((b) => fingerprint(b.events, ['ride'], 0));
  const ks0 = breaks.map((b) => fingerprint(b.events.filter((e) => e.cat === 'kick' || (e.cat === 'snare' && e.role !== 'fill' && e.role !== 'roll')), ['kick', 'snare'], 0));
  const accents0 = breaks.map((b) => {
    const evs = b.events.filter((e) => e.bar === 0 && CYMBALS.includes(e.cat));
    if (!evs.length) return '';
    const top = Math.max(...evs.map((e) => e.vel));
    return evs.filter((e) => e.vel >= top - 8).map((e) => e.step * TPS + e.sub).sort((a, b) => a - b).join(',');
  });
  const cym = breaks.map((b) => onsets(b.events, CYMBALS));
  const ks = breaks.map((b) => onsets(b.events, ['kick', 'snare']));
  const every = breaks.map((b) => onsets(b.events, null));
  let sc = 0, sk = 0, sa = 0, pairs = 0;
  const nn = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const c = jaccard(cym[i]!, cym[j]!);
      sc += c;
      sk += jaccard(ks[i]!, ks[j]!);
      sa += jaccard(every[i]!, every[j]!);
      pairs++;
      nn[i] = Math.max(nn[i]!, c);
      nn[j] = Math.max(nn[j]!, c);
    }
  const classes = Object.fromEntries(TIME_CLASSES.map((c) => [c, 0])) as Record<TimeClass, number>;
  const changes: number[] = [];
  for (const b of breaks) {
    const c0 = timeClass(b.events, 0);
    classes[c0] += 1 / n;
    let ch = 0;
    for (let bar = 1; bar < b.bars; bar++) if (timeClass(b.events, bar) !== c0) ch++;
    changes.push(ch);
  }
  const dens = breaks.map((b) => b.events.length / b.bars);
  const cdens = breaks.map((b) => b.events.filter((e) => CYMBALS.includes(e.cat)).length / b.bars);
  const barSims = breaks.map((b) => {
    const first = new Set(b.events.filter((e) => e.bar === 0).map((e) => `${e.cat}|${e.step * TPS + e.sub}`));
    const s: number[] = [];
    for (let bar = 1; bar < b.bars; bar++) s.push(jaccard(first, new Set(b.events.filter((e) => e.bar === bar).map((e) => `${e.cat}|${e.step * TPS + e.sub}`))));
    return s.length ? mean(s) : 1;
  });
  const syncs = breaks.map((b) => {
    let t = 0;
    for (let bar = 0; bar < b.bars; bar++) t += syncopation(onsetArray(b.events.filter((e) => e.bar === bar && e.sub === 0 && (e.cat === 'kick' || isBackbeat(e) || (e.cat === 'snare' && e.vel >= 70))).map((e) => e.step)));
    return t / b.bars;
  });
  const sub = { beat: 0, and: 0, sixteenth: 0, fine: 0, triplet: 0 };
  let total = 0;
  let kicks = 0, kicksUnder = 0, bbs = 0, bbUnder = 0, layered = 0, none = 0;
  for (const b of breaks) {
    const cymAt = new Set(b.events.filter((e) => CYMBALS.includes(e.cat)).map(tickOf));
    let lay = false;
    for (let bar = 0; bar < b.bars; bar++) {
      const tk = (c: Category) => b.events.some((e) => e.bar === bar && e.cat === c && e.role === 'time');
      if ((tk('hat') || tk('open')) && tk('ride')) lay = true;
    }
    if (lay) layered++;
    if (!cymAt.size) none++;
    for (const e of b.events) {
      total++;
      const t = e.step * TPS + e.sub;
      if (t % TPS === 4 || t % TPS === 8) sub.triplet++;
      else if (e.sub) sub.fine++;
      else if (e.step % 4 === 0) sub.beat++;
      else if (e.step % 2 === 0) sub.and++;
      else sub.sixteenth++;
      if (e.cat === 'kick') {
        kicks++;
        if (cymAt.has(tickOf(e))) kicksUnder++;
      }
      if (isBackbeat(e)) {
        bbs++;
        if (cymAt.has(tickOf(e))) bbUnder++;
      }
    }
  }
  for (const k of Object.keys(sub) as (keyof typeof sub)[]) sub[k] /= Math.max(1, total);
  const shares = Object.values(classes);
  return {
    n,
    distinctPatterns: distinct(all),
    distinctHats: distinct(hats0),
    hatEntropy: entropy(hats0),
    distinctRide: distinct(ride0),
    distinctKickSnare: distinct(ks0),
    distinctAccents: distinct(accents0),
    simCymbals: sc / Math.max(1, pairs),
    simKickSnare: sk / Math.max(1, pairs),
    simAll: sa / Math.max(1, pairs),
    nnCymbals: mean(nn),
    timeClasses: classes,
    classCount: shares.filter((s) => s > 0).length,
    topClass: Math.max(...shares),
    classChanges: mean(changes),
    forms: new Set(breaks.map((b) => phraseForm(b.events, b.bars))).size,
    formBits: entropy(breaks.map((b) => phraseForm(b.events, b.bars))) * Math.log2(Math.max(2, n)),
    density: mean(dens),
    densitySd: sd(dens),
    cymbalDensity: mean(cdens),
    cymbalDensitySd: sd(cdens),
    barSim: mean(barSims),
    barSimSd: sd(barSims),
    sync: mean(syncs),
    syncSd: sd(syncs),
    subdivision: sub,
    kickUnderCymbal: kicks ? kicksUnder / kicks : 0,
    backbeatUnderCymbal: bbs ? bbUnder / bbs : 0,
    layered: layered / Math.max(1, n),
    noCymbals: none / Math.max(1, n),
  };
}

/** A one-line text drawing of a bar of one category (x = a hit on the step, ~ = off the sixteenth grid), for reports. */
export function lane(events: readonly BreakEvent[], cats: readonly Category[], bar: number): string {
  let s = '';
  for (let step = 0; step < STEPS; step++) {
    const here = events.filter((e) => e.bar === bar && cats.includes(e.cat) && e.step === step);
    s += !here.length ? (step % 4 === 0 ? '.' : ' ') : here.some((e) => e.sub) ? '~' : here.some((e) => e.cat === 'open') ? 'O' : here.some((e) => e.cat === 'ride') ? 'r' : 'x';
  }
  return s;
}
