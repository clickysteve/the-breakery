/**
 * JUNGLE phrase development (engine 2): a chopped, rearranged break rather than a dense drum part.
 *
 * Bars are still derived from the groove cell (phrase.ts), but JUNGLE develops them with whole
 * FRAGMENTS and a few controlled moves instead of independent per-voice variation:
 *
 *   A   the motif: the groove, exactly.
 *   A2  the motif again with ONE small change in the second half (repetition with variation).
 *   B   development, one of three moves: DISPLACE (the second backbeat early or late, with a short
 *       snare response and an unexpected secondary accent), FRAGMENT (a beat or a half bar of the
 *       groove played again, with everything on those steps moving together) or HALF-TIME (a
 *       spacious bar: one snare on beat 3 and thin time, so the next bar feels double-time).
 *   F   a short snare retrigger at the end of the bar (the half-way fill).
 *   T   the answer, usually with the second backbeat displaced or a fragment repeated, then a
 *       controlled snare retrigger burst (sixteenths, then a 32nd pair) into the top of the loop.
 *
 * Ghost notes are tied to the snares: they are re-placed from the groove's own ghost figure
 * around every main snare (so the figure repeats around a displaced snare too), and ghosts that
 * belong to no snare are dropped. Hit counts stay close to the groove's: most moves relocate hits.
 *
 * What this is, documented in docs/BREAKBEAT_RESEARCH.md §4: repeated, moved and retriggered
 * slices (Collins' phrase / block / repeat cutting; Hockman and Davies on resequencing), displaced
 * snares and end-of-phrase rolls. What is a DESIGN HYPOTHESIS: which moves go in which bar and
 * how often. What it cannot do: the tails, room and pitch of actually sliced audio, which need a
 * sample-slicing engine (the planned OVERBAKE). Whether it sounds convincing needs listening.
 */
import { posName } from './meter';
import type { Rng } from './rng';
import type { StyleDef } from './styles';
import { clamp, STEPS, type BarRole, type Hit, type Recipe } from './types';

/** The variation helpers of phrase.ts, passed in (phrase.ts imports this file). */
export interface JungleTools {
  varyBeat: (hits: Hit[], def: StyleDef, recipe: Recipe, n: number, rng: Rng, allowSnare: boolean, what?: string, fromAll?: number) => Hit[];
  varyDetail: (hits: Hit[], def: StyleDef, n: number, rng: Rng, timekeeper: 'hat' | 'ride', what?: string, fromAll?: number) => Hit[];
  tidy: (hits: Hit[]) => Hit[];
}

export interface JungleContext {
  def: StyleDef;
  recipe: Recipe;
  timekeeper: 'hat' | 'ride';
  sixteenths: boolean;
  beatRng: Rng;
  detailRng: Rng;
}

/** The longest retrigger burst, in sixteenths. */
export const MAX_BURST = 4;

const copy = (hs: Hit[]) => hs.map((h) => ({ ...h }));
const onStep = (hits: Hit[], cat: Hit['cat'], step: number) => hits.some((h) => h.cat === cat && h.step === step && h.sub === 0);
const isMain = (h: Hit) => h.cat === 'snare' && (h.role === 'backbeat' || h.role === 'displaced backbeat');
const mains = (hits: Hit[]) => hits.filter(isMain).sort((a, b) => a.step - b.step);

/** Offsets (in sixteenths) of the groove's ghosts around its main snare that has the most of them: the ghost figure. */
export function ghostMotif(cell: Hit[]): number[] {
  let best: number[] = [];
  for (const m of mains(cell)) {
    const offs = cell
      .filter((h) => h.cat === 'ghost' && h.sub === 0 && h.step - m.step >= -3 && h.step - m.step <= 2 && h.step !== m.step)
      .map((h) => h.step - m.step)
      .sort((a, b) => a - b);
    if (offs.length >= best.length) best = offs;
  }
  return best;
}

/**
 * Tie the ghosts to the snares: drop those that belong to no main snare, then play the groove's
 * ghost figure around every main snare. Never more ghosts than `cap` (the farthest go first).
 */
export function relinkGhosts(bar: Hit[], motif: number[], def: StyleDef, cap: number): Hit[] {
  const ms = mains(bar);
  if (!ms.length) return bar;
  const near = (s: number) => Math.min(...ms.map((m) => (s >= m.step ? s - m.step + 0.5 : m.step - s)));
  const reach = (s: number) => ms.some((m) => s - m.step >= -3 && s - m.step <= 2) || bar.some((h) => h.cat === 'snare' && h.role === 'extra snare' && Math.abs(h.step - s) === 1);
  let out = bar.filter((h) => h.cat !== 'ghost' || h.sub !== 0 || reach(h.step));
  for (const m of ms) {
    for (const off of motif) {
      const s = m.step + off;
      if (s < 0 || s >= STEPS || out.some((h) => (h.cat === 'snare' || h.cat === 'ghost') && h.step === s && h.sub === 0)) continue;
      out.push({ cat: 'ghost', step: s, sub: 0, level: def.ghostLevel + (off === -1 ? 0.05 : off > 0 ? -0.03 : 0), role: 'ghost', why: `ghost on ${posName(s)}: the groove's ghost figure around the ${posName(m.step)} snare` });
    }
  }
  const ghosts = out.filter((h) => h.cat === 'ghost' && h.sub === 0);
  if (ghosts.length > cap) {
    const drop = new Set(ghosts.sort((a, b) => near(b.step) - near(a.step) || b.step - a.step).slice(0, ghosts.length - cap));
    out = out.filter((h) => !drop.has(h));
  }
  return out;
}

/** Play steps [from, from+len) again at `to`: everything on them moves together. */
export function copyFragment(bar: Hit[], from: number, len: number, to: number): Hit[] {
  const out = bar.filter((h) => !(h.step >= to && h.step < to + len) || h.cat === 'crash');
  for (const h of bar) {
    if (h.step < from || h.step >= from + len || h.cat === 'crash') continue;
    const step = h.step - from + to;
    const backbeat = h.role === 'backbeat' && (step === 4 || step === 12);
    out.push({ ...h, step, role: backbeat ? 'backbeat' : 'chop', why: `chop: the ${posName(from)}–${posName(from + len - 1)} slice of the bar, played again at ${posName(to)} (was ${h.role})` });
  }
  return out;
}

/** The second main snare moved to `to` (early or late), with a kick on the vacated step and a short snare response. */
export function displaceLast(bar: Hit[], to: number, rng: Rng): Hit[] {
  const last = mains(bar).filter((h) => h.step >= 8).pop();
  if (!last || to === last.step || to < 9 || to > 14) return bar;
  let out = bar.filter((h) => h !== last && !(h.cat === 'ghost' && Math.abs(h.step - last.step) <= 1) && !(h.cat === 'snare' && h.step === to));
  out.push({ ...last, step: to, sub: 0, level: 0.94, role: 'displaced backbeat', why: `backbeat ${to < last.step ? 'early' : 'late'}: moved from ${posName(last.step)} to ${posName(to)}, the groove still readable around it` });
  if (!onStep(out, 'kick', last.step) && rng.chance(0.55)) out.push({ cat: 'kick', step: last.step, sub: 0, level: 0.82, role: 'kick', why: `kick takes the vacated ${posName(last.step)}` });
  // a short snare response after the displaced snare
  const r = to + 1;
  if (r < STEPS && !onStep(out, 'snare', r) && !onStep(out, 'kick', r) && rng.chance(0.7)) out.push({ cat: 'snare', step: r, sub: 0, level: 0.42, role: 'ghost', why: `short snare response after the ${posName(to)} snare` });
  return out;
}

/** An unexpected secondary snare accent, where the style allows extra snares and no main snare is next to it. */
export function secondaryAccent(bar: Hit[], def: StyleDef, rng: Rng): Hit[] {
  const ms = mains(bar);
  const cands = Object.entries(def.extraSnare.steps)
    .map(([s, w]) => [Number(s), w] as const)
    .filter(([s]) => !onStep(bar, 'snare', s) && ms.every((m) => Math.abs(m.step - s) >= 2));
  if (!cands.length) return bar;
  const s = cands[rng.weighted(cands.map(([, w]) => w))]![0];
  const out = bar.filter((h) => !(h.cat === 'ghost' && h.step === s && h.sub === 0));
  out.push({ cat: 'snare', step: s, sub: 0, level: 0.74, role: 'extra snare', why: `unexpected snare accent on ${posName(s)}` });
  return out;
}

/** A bar thinned and slowed: one snare on beat 3 and eighth-note time, so the bar after it feels double-time. */
export function halfTime(bar: Hit[]): Hit[] {
  const out = bar.filter((h) => !isMain(h) && !(h.cat === 'snare' && h.role === 'extra snare') && !(h.cat === 'kick' && h.step === 8) && !((h.cat === 'hat' || h.cat === 'ride') && h.step % 2 === 1) && !(h.cat === 'ghost'));
  out.push({ cat: 'snare', step: 8, sub: 0, level: 0.94, role: 'backbeat', why: 'half-time feel: the backbeat on beat 3, the bar left spacious' });
  return out;
}

/**
 * A snare retrigger burst in the last `len` sixteenths (at most MAX_BURST): sixteenths, and a 32nd
 * pair on the last step (also on the one before it in a four-step burst). A main snare inside the region stays; the rest of the region keeps
 * only its first kick and the crash. Every hit is a 'roll' snare on a step or the 32nd after it.
 */
export function burst(bar: Hit[], len: number, fast: boolean, why: string): Hit[] {
  const L = clamp(Math.round(len), 1, MAX_BURST);
  const start = STEPS - L;
  const keep = (h: Hit) => h.step < start || h.cat === 'crash' || (h.cat === 'kick' && h.step === start) || (isMain(h) && h.sub === 0);
  const out = bar.filter(keep);
  for (let s = start; s < STEPS; s++) {
    if (onStep(out, 'snare', s)) continue;
    const f = (s - start + 1) / L;
    out.push({ cat: 'snare', step: s, sub: 0, level: 0.46 + 0.46 * f, role: 'roll', why });
    if (fast && L >= 2 && (s === STEPS - 1 || (s === STEPS - 2 && L >= MAX_BURST))) out.push({ cat: 'snare', step: s, sub: 6, level: 0.42 + 0.5 * f, role: 'roll', why: `${why} (32nd retrigger)` });
  }
  return out;
}

type BVariant = 'displace' | 'fragment' | 'halftime';

/** All bars of a JUNGLE phrase, derived from the groove cell. */
export function developJungle(cell: Hit[], roles: BarRole[], ctx: JungleContext, tools: JungleTools): Hit[][] {
  const { def, recipe, beatRng: rng, detailRng } = ctx;
  const { varyBeat, varyDetail, tidy } = tools;
  const motif = ghostMotif(cell);
  const cap = cell.filter((h) => h.cat === 'ghost').length + 1;
  const link = (b: Hit[]) => tidy(relinkGhosts(b, motif, def, cap));

  // the answer: the motif again with one small change in the second half, ghosts kept tied to the snares
  const nBeat = Math.round(recipe.variation * 1.5 * rng.range(0.6, 1.2));
  const nDetail = Math.round(recipe.variation * 1.5 * detailRng.range(0.6, 1.2));
  const answer = link(varyDetail(varyBeat(cell, def, recipe, nBeat, rng, false, 'a small change in the second half', 8), def, nDetail, detailRng, ctx.timekeeper, 'a small change in the second half', 8));

  // the burst that closes the phrase (T) and its shorter echo at the half-way point (F)
  const fullBurst = recipe.fills > 0.05 ? clamp(Math.round(def.fillMax * recipe.fills * 0.5 * rng.range(0.7, 1.15)), 2, MAX_BURST) : 0;
  const hasB = roles.includes('B');
  let bCount = 0;

  const bars: Hit[][] = [];
  for (const role of roles) {
    if (role === 'A') bars.push(tidy(copy(cell)));
    else if (role === 'A2') bars.push(copy(answer));
    else if (role === 'B') {
      const variants: BVariant[] = ['displace', 'fragment', 'halftime'];
      const first = variants[rng.weighted([0.6, 0.5, 0.25 + 0.3 * recipe.complexity])]!;
      // a second development bar in a phrase takes a different move from the first
      const v = bCount++ === 0 ? first : variants[(variants.indexOf(first) + 1) % 3]!;
      let b = copy(answer);
      if (v === 'displace') {
        b = displaceLast(b, rng.chance(0.25) ? 11 : rng.chance(0.6) ? 13 : 14, rng);
        if (rng.chance(0.5 + 0.3 * recipe.complexity)) b = secondaryAccent(b, def, rng);
      } else if (v === 'fragment') {
        const plan = rng.weighted([1, 0.8, 0.8]);
        b = plan === 0 ? copyFragment(b, 0, 8, 8) : plan === 1 ? copyFragment(b, 4, 4, 12) : copyFragment(b, 8, 2, 10);
        if (rng.chance(0.4 + 0.3 * recipe.complexity)) b = secondaryAccent(b, def, rng);
        if (!ctx.sixteenths && ctx.timekeeper === 'hat' && detailRng.chance(0.3 + 0.4 * recipe.complexity)) {
          // double-time: the hats move to sixteenths for the second half
          for (let s = 9; s < STEPS; s += 2) if (!onStep(b, 'hat', s) && !onStep(b, 'open', s - 1) && !onStep(b, 'snare', s)) b.push({ cat: 'hat', step: s, sub: 0, level: 0.44, role: 'time', why: 'hats double to sixteenths: the development bar builds' });
        }
      } else b = halfTime(b);
      bars.push(link(b));
    } else if (role === 'F') {
      // the half-way fill: a short retrigger, sixteenths only, so the final burst is the stronger version
      bars.push(tidy(fullBurst ? burst(copy(answer), clamp(Math.round(fullBurst / 2), 1, 2), false, 'short snare retrigger at the half-way point') : copy(answer)));
    } else {
      // turnaround: without a development bar before it, the displaced backbeat comes here
      let t = copy(answer);
      if (rng.chance(hasB ? 0.3 : 0.8)) t = displaceLast(t, rng.chance(0.3) ? 11 : rng.chance(0.6) ? 13 : 14, rng);
      else if (rng.chance(0.5)) t = copyFragment(t, 0, 4, 4);
      t = link(t);
      if (fullBurst) t = burst(t, fullBurst, true, 'snare retrigger burst into the top of the loop');
      bars.push(tidy(t));
    }
  }
  // a 1-bar loop with strong FILLS: a pickup at the end of the bar, so the loop turns over
  if (roles.length === 1 && recipe.fills > 0.6) {
    const b = bars[0]!;
    if (!onStep(b, 'snare', 15) && !onStep(b, 'snare', 14)) {
      b.push({ cat: 'snare', step: 15, sub: 0, level: 0.62, role: 'fill', why: `pickup on ${posName(15)}: a one-bar loop turning over` });
      bars[0] = tidy(b);
    }
  }
  return bars;
}
