/**
 * Layer D (engine 2): phrase development. Bars are derived from the groove cell, never
 * regenerated, and longer phrases are built hierarchically from two- and four-bar units:
 *
 *   1  A                       5  A A2 A B T
 *   2  A T                     6  A A2 A F | A T
 *   3  A A2 T                  7  A A2 A F | A B T
 *   4  A A2 A T                8  A A2 A F | A A2 B T
 *
 * A   groove: the motif, exactly.
 * A2  answer: the groove with a few variation operations, mostly in its second half (where the
 *     classic breaks put their variations). Computed ONCE: every A2 in a phrase is the same bar,
 *     so call and response repeat (repetition with variation, not new material every bar).
 * B   development: the answer developed further (more operations, the hats may double to
 *     sixteenths, and in the UK breakbeat recipes a CHOP: the groove resequenced, see chop.ts).
 * F   half-way fill: the answer plus a SHORT fill of the same kind as the final turnaround's, so
 *     the two fills relate (the second is the longer, stronger version); in 6–8 bars it closes the
 *     first four-bar section, and the next bar returns to the groove.
 * T   turnaround: the answer plus the main fill, pushing back into the top of the loop.
 *
 * JUNGLE, HARDCORE and BREAKCORE (chop ≥ 0.4) play A A2 B T in four bars: the third bar is
 * chopped rather than a return to the groove.
 *
 * How far later bars move from the groove follows VARIATION and the recipe: programmed loops
 * (BOOM BAP, GARAGE, ELECTRO) repeat exactly until the turnaround unless VARIATION is high.
 */
import { MOTIF_LABEL, type MotifId } from './approaches';
import { chopBar, roll } from './chop';
import type { FillMark } from './cymbals';
import { developJungle } from './jungle';
import { posName } from './meter';
import type { Rng } from './rng';
import type { FillKind, StyleDef } from './styles';
import { clamp, STEPS, type BarRole, type Hit, type MutationOptions, type MutationStyle, type Recipe } from './types';

const PLANS: Record<number, BarRole[]> = {
  1: ['A'],
  2: ['A', 'T'],
  3: ['A', 'A2', 'T'],
  4: ['A', 'A2', 'A', 'T'],
  5: ['A', 'A2', 'A', 'B', 'T'],
  6: ['A', 'A2', 'A', 'F', 'A', 'T'],
  7: ['A', 'A2', 'A', 'F', 'A', 'B', 'T'],
  8: ['A', 'A2', 'A', 'F', 'A', 'A2', 'B', 'T'],
};

export function planBars(bars: number, def?: StyleDef): BarRole[] {
  const plan = PLANS[clamp(Math.round(bars), 1, 8)]!.slice();
  // the chop recipes develop (resequence) the third bar of a four-bar phrase instead of returning
  if (def && def.chop >= 0.4 && plan.length === 4) plan[2] = 'B';
  return plan;
}

const key = (h: Pick<Hit, 'cat' | 'step' | 'sub'>) => `${h.cat}|${h.step}|${h.sub}`;

/** Remove duplicates (same category and position), keeping the louder. Sorted by position. */
export function tidy(hits: Hit[]): Hit[] {
  const m = new Map<string, Hit>();
  for (const h of hits) {
    const k = key(h);
    const o = m.get(k);
    if (!o || h.level > o.level) m.set(k, h);
  }
  // a ghost under a snare stroke, or a closed hat under an open one, is not played twice
  const out = [...m.values()].filter(
    (h) => !(h.cat === 'ghost' && m.has(`snare|${h.step}|${h.sub}`)) && !(h.cat === 'hat' && m.has(`open|${h.step}|${h.sub}`)),
  );
  return out.sort((a, b) => a.step * 12 + a.sub - (b.step * 12 + b.sub));
}

const has = (hits: Hit[], cat: Hit['cat'], step: number) => hits.some((h) => h.cat === cat && h.step === step && h.sub === 0);

type BeatOp = 'kickShift' | 'kickAdd' | 'kickDrop' | 'snareDelay' | 'kickDouble';
type DetailOp = 'ghostAdd' | 'ghostDrop' | 'openAdd';

function regionStart(def: StyleDef, rng: Rng): number {
  return def.restless && rng.chance(0.4) ? 4 : 8;
}

/** Variation operations on kick and snare (beat stream). `from` overrides the region. */
export function varyBeat(hits: Hit[], def: StyleDef, recipe: Recipe, n: number, rng: Rng, allowSnare: boolean, what = 'a variation on the first bar', fromAll?: number): Hit[] {
  let out = hits.slice();
  for (let i = 0; i < n; i++) {
    const from = fromAll ?? regionStart(def, rng);
    const ops: BeatOp[] = ['kickShift', 'kickAdd', 'kickDrop', 'snareDelay', 'kickDouble'];
    const op = ops[rng.weighted([1.2, 1, 0.6, allowSnare && def.backbeat === 'two-four' ? 0.5 * recipe.complexity + 0.1 : 0, 0.6 * def.kickPairs])]!;
    const kicks = out.filter((h) => h.cat === 'kick' && h.role !== 'floor kick' && h.step >= from && h.step !== 0 && h.sub === 0 && !def.fixedKicks.includes(h.step));
    if (op === 'kickShift' && kicks.length) {
      const k = rng.pick(kicks);
      const to = k.step + (rng.chance(0.6) ? -1 : 1);
      if (to > 0 && to < STEPS && !has(out, 'kick', to) && !has(out, 'snare', to)) {
        out = out.filter((h) => h !== k);
        out.push({ ...k, step: to, role: to % 2 ? 'syncopated kick' : 'kick', level: to % 2 ? 0.74 : 0.8, why: `kick moved from ${posName(k.step)} to ${posName(to)}: ${what}` });
      }
    } else if (op === 'kickAdd') {
      const w = def.kickWeights.map((x, s) => (s < from || has(out, 'kick', s) || has(out, 'snare', s) ? 0 : x));
      const s = rng.weighted(w);
      if (s > 0) out.push({ cat: 'kick', step: s, sub: 0, level: 0.76, role: s % 2 ? 'syncopated kick' : 'kick', why: `extra kick on ${posName(s)}: ${what}` });
    } else if (op === 'kickDrop' && kicks.length > 0 && out.filter((h) => h.cat === 'kick').length > 2) {
      const k = rng.pick(kicks);
      out = out.filter((h) => h !== k);
    } else if (op === 'kickDouble' && kicks.length) {
      // a double kick: a second stroke an eighth or a sixteenth after an existing kick
      const k = rng.pick(kicks);
      const to = k.step + (rng.chance(0.6) ? 2 : 1);
      if (to < STEPS && !has(out, 'kick', to) && !has(out, 'snare', to) && !has(out, 'kick', to + 1)) out.push({ cat: 'kick', step: to, sub: 0, level: 0.72, role: to % 2 ? 'syncopated kick' : 'kick', why: `double kick on ${posName(to)}, after ${posName(k.step)}: ${what}` });
    } else if (op === 'snareDelay') {
      const bb = out.find((h) => h.cat === 'snare' && h.step === 12 && h.sub === 0);
      const to = rng.chance(0.6) ? 13 : 14;
      if (bb && !has(out, 'snare', to)) {
        out = out.filter((h) => h !== bb && !(h.cat === 'ghost' && (h.step === to || h.step === to - 1)));
        out.push({ ...bb, step: to, level: 0.94, role: 'displaced backbeat', why: `backbeat delayed from ${posName(12)} to ${posName(to)}: pushes into the next bar` });
      }
    }
  }
  return out;
}

/** Variation operations on ghosts and lifts (detail stream). */
export function varyDetail(hits: Hit[], def: StyleDef, n: number, rng: Rng, timekeeper: 'hat' | 'ride', what = 'a variation on the first bar', fromAll?: number, open = true): Hit[] {
  let out = hits.slice();
  for (let i = 0; i < n; i++) {
    const from = fromAll ?? regionStart(def, rng);
    const ops: DetailOp[] = ['ghostAdd', 'ghostDrop', 'openAdd'];
    // revision 3: the cymbals are generated per bar afterwards (cymbals.ts), so no open hats here
    const op = ops[rng.weighted([def.ghostMax > 0 ? 1 : 0, 0.7, !open ? 0 : timekeeper === 'hat' ? 0.5 : 0.1])]!;
    if (op === 'ghostAdd') {
      const cands: number[] = [];
      for (let s = from; s < STEPS; s++) if (s % 2 === 1 && !has(out, 'snare', s) && !has(out, 'ghost', s) && !has(out, 'ghost', s - 1) && !has(out, 'ghost', s + 1)) cands.push(s);
      if (cands.length) {
        // prefer anticipating a backbeat
        const s = cands[rng.weighted(cands.map((c) => (has(out, 'snare', c + 1) ? 3 : 1)))]!;
        out.push({ cat: 'ghost', step: s, sub: 0, level: def.ghostLevel + (has(out, 'snare', s + 1) ? 0.05 : 0), role: 'ghost', why: `ghost on ${posName(s)}: ${what}` });
      }
    } else if (op === 'ghostDrop') {
      const g = out.filter((h) => h.cat === 'ghost' && h.step >= from);
      if (g.length) {
        const x = rng.pick(g);
        out = out.filter((h) => h !== x);
      }
    } else {
      const s = rng.chance(0.6) ? 14 : 10;
      if (!has(out, 'open', s) && s >= from) {
        out = out.filter((h) => !(h.cat === 'hat' && (h.step === s || (h.step === s + 1 && h.sub === 0))));
        out.push({ cat: 'open', step: s, sub: 0, level: 0.72, role: 'lift', why: `open hat on ${posName(s)}: a lift (${what})` });
      }
    }
  }
  return out;
}

/** The fill at the end of a bar (turnaround, or a short half-way fill). */
function addFill(hits: Hit[], kind: FillKind, def: StyleDef, recipe: Recipe, length: number, rng: Rng, crashAtTop: boolean, sources: Hit[][]): Hit[] {
  const L = clamp(length, 1, 8);
  const start = STEPS - L;
  let out = hits.slice();
  const inFill = (h: Hit) => h.step >= start;

  if (kind === 'run') {
    // hands move to the snare: timekeeping, ghosts and percussion stop for the fill
    out = out.filter((h) => !(inFill(h) && (h.cat === 'hat' || h.cat === 'ride' || h.cat === 'open' || h.cat === 'ghost' || h.cat === 'perc' || (h.cat === 'snare' && h.role !== 'backbeat'))));
    out = out.filter((h) => !(inFill(h) && h.cat === 'kick' && h.step % 2 === 1));
    const every = recipe.fills > 0.6 || L <= 3 ? 1 : 2;
    for (let s = start; s < STEPS; s += every) {
      const t = (s - start + 1) / L;
      out.push({ cat: 'snare', step: s, sub: 0, level: 0.5 + 0.48 * t, role: 'fill', why: `snare fill, building into the top of the loop` });
      if (s >= STEPS - 2 && rng.chance(def.dragP * recipe.complexity * 1.5)) out.push({ cat: 'snare', step: s, sub: 6, level: 0.45 + 0.4 * t, role: 'fill', why: '32nd-note roll at the end of the fill' });
    }
  } else if (kind === 'displace') {
    const bb = out.find((h) => h.cat === 'snare' && h.step === 12 && h.sub === 0);
    if (bb && start <= 12) {
      const to = rng.chance(0.5) ? 13 : 14;
      out = out.filter((h) => h !== bb && !(h.cat === 'ghost' && h.step >= 12));
      out.push({ ...bb, step: to, level: 0.96, role: 'displaced backbeat', why: `backbeat delayed to ${posName(to)}: the turnaround pushes against the beat` });
      if (!has(out, 'kick', 12) && rng.chance(0.6)) out.push({ cat: 'kick', step: 12, sub: 0, level: 0.82, role: 'kick', why: 'kick takes the empty backbeat position' });
    }
    for (let s = Math.max(start, 9); s < STEPS; s++) {
      if (s % 2 === 1 && !has(out, 'snare', s) && !has(out, 'snare', s - 1) && !has(out, 'snare', s + 1) && rng.chance(0.45)) {
        out = out.filter((h) => !(h.cat === 'ghost' && h.step === s));
        out.push({ cat: 'snare', step: s, sub: 0, level: 0.86, role: 'fill', why: `syncopated snare on ${posName(s)} in the turnaround` });
      }
    }
    const wantCrash = rng.chance(0.5);
    const s = rng.chance(0.5) ? 14 : 15;
    if (!crashAtTop && wantCrash) {
      out = out.filter((h) => !((h.cat === 'hat' || h.cat === 'ride' || h.cat === 'open') && h.step >= s));
      out.push({ cat: 'crash', step: s, sub: 0, level: 0.85, role: 'crash', why: `early crash on ${posName(s)}, ahead of the loop point` });
      if (!has(out, 'kick', s)) out.push({ cat: 'kick', step: s, sub: 0, level: 0.82, role: 'syncopated kick', why: 'kick with the early crash' });
    }
  } else if (kind === 'drop') {
    // space: the groove drops out, then one pickup leads back in
    out = out.filter((h) => !(inFill(h) && h.role !== 'backbeat' && h.role !== 'displaced backbeat'));
    const pick = rng.chance(0.6) ? 'snare' : 'kick';
    out.push({ cat: pick, step: 15, sub: 0, level: 0.78, role: 'fill', why: `the groove drops out; a ${pick} pickup on ${posName(15)} leads back in` });
  } else if (kind === 'stutter') {
    // stutter: kick and snare alternate in sixteenths (a linear fill), the last snare doubled
    out = out.filter((h) => !(inFill(h) && (h.cat === 'kick' || h.cat === 'ghost' || h.cat === 'hat' || h.cat === 'open' || h.cat === 'perc' || (h.cat === 'snare' && h.role !== 'backbeat'))));
    for (let s = start; s < STEPS; s++) {
      const cat = (s - start) % 2 === 0 ? 'kick' : 'snare';
      out.push({ cat, step: s, sub: 0, level: cat === 'kick' ? 0.8 : 0.7 + (0.25 * (s - start)) / L, role: 'fill', why: 'stuttered kick/snare fill' });
    }
    out.push({ cat: 'snare', step: 15, sub: 6, level: 0.75, role: 'fill', why: 'retriggered snare on the last 32nd' });
  } else if (kind === 'chop') {
    // the end of the bar resequenced from the groove, then (often) a roll
    out = chopBar(out, [{ hits: out, name: 'this bar' }, { hits: sources[0] ?? out, name: 'groove' }], rng, { amount: 1, from: start, roll: L >= 3 && rng.chance(0.6), warp: def.warp });
  } else {
    // roll: the hands go to the snare; sixteenths, then 32nds, crescendo
    out = out.filter((h) => !(inFill(h) && h.cat !== 'kick' && h.cat !== 'crash'));
    out = out.filter((h) => !(inFill(h) && h.cat === 'kick' && h.step !== start));
    out.push(...roll(start, STEPS, rng, def.warp > 0, 'snare roll, sixteenths into 32nds, into the top of the loop'));
  }
  return out;
}

export interface DevelopContext {
  def: StyleDef;
  recipe: Recipe;
  timekeeper: 'hat' | 'ride';
  sixteenths: boolean;
  beatRng: Rng;
  detailRng: Rng;
  crashAtTop: boolean;
  /** revision 3: the motif development of the answer bars, and where each bar's fill starts (filled in) */
  vocab?: { motif: MotifId; marks: (FillMark | null)[] };
}

const isBackbeatHit = (h: Hit) => h.cat === 'snare' && (h.role === 'backbeat' || h.role === 'displaced backbeat');

/**
 * Revision 3: the answer bar develops the motif by a technique chosen per break (approaches.ts
 * MOTIFS), then takes a few of the usual variation operations: ECHO (the second half answers the
 * first: its kicks, ghosts and percussion repeat four beats later), DISPLACE (the second half's
 * kicks and ghosts move a sixteenth), TRUNCATE (the motif stops short: space before the next bar),
 * EXTEND (the last kick figure carries on towards the bar line) or VARY (the operations only).
 * The backbeats, the downbeat and the recipe's fixed kicks never move.
 */
function developMotif(cell: Hit[], motif: MotifId, def: StyleDef, recipe: Recipe, nBeat: number, nDetail: number, rng: Rng, detailRng: Rng, timekeeper: 'hat' | 'ride'): Hit[] {
  const what = `the answer: the motif ${MOTIF_LABEL[motif]}`;
  const fixed = (h: Hit) => isBackbeatHit(h) || (h.cat === 'kick' && (h.step === 0 || h.role === 'floor kick' || def.fixedKicks.includes(h.step)));
  const movable = (h: Hit) => !fixed(h) && h.sub === 0 && (h.cat === 'kick' || h.cat === 'ghost' || h.cat === 'perc' || (h.cat === 'snare' && h.role === 'extra snare'));
  const free = (hs: Hit[], cat: Hit['cat'], s: number) => s > 0 && s < STEPS && !has(hs, cat, s) && !has(hs, 'snare', s) && (cat !== 'kick' || !def.fixedKicks.includes(s));
  let out = cell.map((h) => ({ ...h }));
  if (motif === 'echo') {
    const first = out.filter((h) => h.step < 8 && h.sub === 0 && (movable(h) || (h.cat === 'kick' && h.step === 0)));
    out = out.filter((h) => !(movable(h) && h.step >= 8));
    for (const h of first) if (free(out, h.cat, h.step + 8)) out.push({ ...h, step: h.step + 8, role: h.cat === 'kick' ? ((h.step + 8) % 2 ? 'syncopated kick' : 'kick') : h.role, why: `${h.cat === 'kick' ? 'kick' : h.cat} on ${posName(h.step + 8)}: ${what}` });
  } else if (motif === 'displace') {
    const d = rng.chance(0.65) ? 1 : -1;
    const moving = out.filter((h) => movable(h) && h.step >= 8 && h.cat !== 'snare');
    out = out.filter((h) => !moving.includes(h));
    for (const h of moving) {
      const to = h.step + d;
      if (to < STEPS && free(out, h.cat, to)) out.push({ ...h, step: to, role: h.cat === 'kick' ? (to % 2 ? 'syncopated kick' : 'kick') : h.role, why: `${h.cat === 'kick' ? 'kick' : h.cat} moved from ${posName(h.step)} to ${posName(to)}: ${what}` });
      else out.push(h);
    }
  } else if (motif === 'truncate') {
    const cut = rng.pick([10, 12, 12, 13, 14]);
    out = out.filter((h) => !(movable(h) && h.step >= cut));
    if (rng.chance(0.4) && free(out, 'kick', 15)) out.push({ cat: 'kick', step: 15, sub: 0, level: 0.72, role: 'pickup kick', why: `pickup kick on ${posName(15)}: ${what}` });
  } else if (motif === 'extend') {
    const kicks = out.filter((h) => h.cat === 'kick' && h.step >= 6 && h.step < 13).map((h) => h.step);
    const last = kicks.length ? Math.max(...kicks) : 10;
    for (const s of [last + 2, last + 3]) if (s < STEPS && free(out, 'kick', s) && !has(out, 'kick', s - 1) && rng.chance(0.7)) {
      out.push({ cat: 'kick', step: s, sub: 0, level: 0.74, role: s % 2 ? 'syncopated kick' : 'kick', why: `kick on ${posName(s)}: ${what}` });
      break;
    }
    if (def.ghostMax > 0 && free(out, 'ghost', 15) && rng.chance(0.5)) out.push({ cat: 'ghost', step: 15, sub: 0, level: def.ghostLevel, role: 'ghost', why: `ghost on ${posName(15)}: ${what}` });
  }
  const k = motif === 'vary' ? 1 : 0.4;
  out = varyBeat(out, def, recipe, Math.round(nBeat * k), rng, def.restless, what);
  return tidy(varyDetail(out, def, Math.round(nDetail * k), detailRng, timekeeper, what, undefined, false));
}

/** All bars of the phrase, derived from the groove cell. */
export function developPhrase(cell: Hit[], roles: BarRole[], ctx: DevelopContext): Hit[][] {
  const { def, recipe, beatRng, detailRng } = ctx;
  // JUNGLE (recipes made since Phase 7; older ones keep the development below) develops fragments and displaced snares as a phrase (jungle.ts); every other recipe is below
  if (def.style === 'jungle' && recipe.jungleCuts) {
    if (!ctx.vocab) return developJungle(cell, roles, ctx, { varyBeat, varyDetail, tidy });
    const bars = developJungle(cell, roles, ctx, { varyBeat, varyDetail: (h, d, n, r, tk, what, from) => varyDetail(h, d, n, r, tk, what, from, false), tidy });
    bars.forEach((b, i) => {
      const burst = b.filter((h) => h.role === 'roll' && h.cat === 'snare').map((h) => h.step);
      if (burst.length && (roles[i] === 'T' || roles[i] === 'F')) ctx.vocab!.marks[i] = { from: Math.min(...burst), kind: 'burst' };
    });
    return bars;
  }
  const v3 = ctx.vocab;
  const open = !v3;
  const copy = (hs: Hit[]) => hs.map((h) => ({ ...h }));
  const loopy = def.loop && recipe.variation < 0.5;

  // the answer (shared by every A2, and the base of B, F and T)
  const nBeat = loopy ? 0 : Math.round(recipe.variation * 3 * beatRng.range(0.6, 1.3));
  const nDetail = loopy ? 0 : Math.round(recipe.variation * 2.5 * detailRng.range(0.6, 1.3));
  let answer: Hit[];
  // the motif develops with VARIATION: at 0 the answer is the groove again
  if (v3 && !loopy && beatRng.chance(clamp(2.5 * recipe.variation, 0, 1))) answer = developMotif(cell, v3.motif, def, recipe, nBeat, nDetail, beatRng, detailRng, ctx.timekeeper);
  else {
    answer = varyBeat(cell, def, recipe, nBeat, beatRng, def.restless);
    answer = tidy(varyDetail(answer, def, nDetail, detailRng, ctx.timekeeper, undefined, undefined, open));
  }

  // the fill vocabulary of this phrase: one kind, shared by F (short) and T (long)
  const kinds: FillKind[] = ['run', 'displace', 'drop', 'stutter', 'chop', 'roll'];
  const fullL = Math.round(def.fillMax * recipe.fills * beatRng.range(0.7, 1.15));
  const w = { ...def.fillKinds };
  if (fullL <= 2) {
    w.run *= 0.5;
    w.stutter *= 1.5;
    w.roll *= 0.5;
  }
  const kind = kinds[Math.max(0, beatRng.weighted(kinds.map((k) => w[k])))]!;

  const bars: Hit[][] = [];
  const mark = (i: number, L: number) => {
    if (v3) v3.marks[i] = { from: STEPS - clamp(L, 1, 8), kind };
  };
  for (const [i, role] of roles.entries()) {
    if (role === 'A') bars.push(tidy(copy(cell)));
    else if (role === 'A2') {
      // breakcore: even the answer is cut up
      if (def.warp >= 0.3) bars.push(tidy(chopBar(copy(answer), [{ hits: answer, name: 'answer' }, { hits: cell, name: 'groove' }], beatRng, { amount: def.chop * 0.6, from: 8, roll: false, warp: def.warp * 0.5 })));
      else bars.push(tidy(copy(answer)));
    }
    else if (role === 'B') {
      // development: more variation, then (in the chop recipes) a resequencing of the groove
      let b = varyBeat(answer, def, recipe, Math.max(1, Math.round(recipe.variation * 2)), beatRng, true, 'developing the groove', 4);
      b = varyDetail(b, def, Math.max(1, Math.round(recipe.variation * 2)), detailRng, ctx.timekeeper, 'developing the groove', 4, open);
      if (!ctx.sixteenths && ctx.timekeeper === 'hat' && def.sixteenthsAbove < 0.9 && detailRng.chance(0.35 + 0.4 * recipe.complexity)) {
        // the hats double to sixteenths for this bar: an intensification
        for (let s = 9; s < STEPS; s += 2) if (!has(b, 'hat', s) && !has(b, 'open', s - 1)) b.push({ cat: 'hat', step: s, sub: 0, level: 0.44, role: 'time', why: 'hats double to sixteenths: the development bar builds' });
      }
      if (def.chop > 0 && beatRng.chance(def.chop * (0.4 + 0.6 * recipe.variation))) {
        b = chopBar(tidy(b), [{ hits: tidy(b), name: 'answer' }, { hits: cell, name: 'groove' }], beatRng, { amount: def.chop * (0.5 + 0.5 * recipe.variation), from: beatRng.chance(0.5) ? 4 : 8, roll: false, warp: def.warp });
      }
      bars.push(tidy(b));
    } else if (role === 'F') {
      const L = clamp(Math.round(fullL / 2), 1, 4);
      if (recipe.fills > 0.05 && L > 0) mark(i, L);
      bars.push(tidy(recipe.fills > 0.05 && L > 0 ? addFill(copy(answer), kind, def, recipe, L, beatRng, true, [cell]) : copy(answer)));
    } else {
      let t = copy(answer);
      if (def.warp > 0 && beatRng.chance(def.warp)) t = chopBar(tidy(t), [{ hits: tidy(t), name: 'answer' }, { hits: cell, name: 'groove' }], beatRng, { amount: def.chop, from: 4, roll: false, warp: def.warp });
      if (recipe.fills > 0.05 && fullL > 0) {
        mark(i, fullL);
        t = addFill(t, kind, def, recipe, fullL, beatRng, ctx.crashAtTop, [cell]);
      }
      bars.push(tidy(t));
    }
  }
  // a 1-bar loop with strong FILLS: a pickup at the end of the bar, so the loop turns over
  if (roles.length === 1 && recipe.fills > 0.6 && !def.loop) {
    const b = bars[0]!;
    if (!has(b, 'snare', 15) && !has(b, 'snare', 14)) {
      b.push({ cat: 'snare', step: 15, sub: 0, level: 0.62, role: 'fill', why: `pickup on ${posName(15)}: a one-bar loop turning over` });
      bars[0] = tidy(b);
    }
  }
  return bars;
}

/**
 * MUTATE: a few small variation operations applied to the groove cell itself, so every bar
 * derived from it changes in a related way. Each mutation draws from its own seed.
 */
export function mutateCell(cell: Hit[], def: StyleDef, recipe: Recipe, rng: Rng, beat: boolean, detail: boolean, timekeeper: 'hat' | 'ride', opts?: MutationOptions, open = true): Hit[] {
  let out = cell.map((h) => ({ ...h }));
  if (!opts?.style) {
    // a plain MUTATE (and every mutation made before MUTATE had options): exactly as it always was
    if (beat) out = varyBeat(out, def, recipe, 1 + (rng.chance(0.4) ? 1 : 0), rng, false, 'a mutation of the groove', 2);
    if (detail) out = varyDetail(out, def, 1 + (rng.chance(0.5) ? 1 : 0), rng, timekeeper, 'a mutation of the groove', 1, open);
    return tidy(out);
  }
  const d = clamp(opts.depth ?? 0.5, 0, 1);
  const what = `a ${opts.style} mutation of the groove`;
  const n = (lo: number, span: number) => Math.max(0, Math.round(lo + span * d + rng.range(-0.3, 0.3)));
  const p = MUTATION_PLAN[opts.style];
  if (beat && p.beat) out = varyBeat(out, def, recipe, n(p.beat[0], p.beat[1]), rng, p.snare(d), what, p.from);
  if (detail && p.detail) out = varyDetail(out, def, n(p.detail[0], p.detail[1]), rng, timekeeper, what, p.from, open);
  if (p.texture === 'thin' || (opts.style === 'wild' && rng.chance(0.5))) out = thin(out, def, (opts.style === 'wild' ? 0.3 : 0.75) * d + 0.15, rng, beat, detail);
  else if (p.texture === 'thicken' || opts.style === 'wild') out = thicken(out, def, (opts.style === 'wild' ? 0.3 : 0.7) * d + 0.15, rng, timekeeper, beat, detail, what);
  out = tidy(out);
  // SELECTED TRACKS: every other track stays exactly as it was
  if (opts.cats) {
    const only = new Set(opts.cats);
    out = tidy([...out.filter((h) => only.has(h.cat)), ...cell.filter((h) => !only.has(h.cat)).map((h) => ({ ...h }))]);
  }
  return out;
}

/** How each MUTATE style uses the variation operations: [operations at depth 0, more at full depth], from which step, and a texture change. */
const MUTATION_PLAN: Record<MutationStyle, { beat?: [number, number]; detail?: [number, number]; from: number; snare: (d: number) => boolean; texture?: 'thin' | 'thicken' }> = {
  musical: { beat: [1, 2], detail: [1, 2], from: 2, snare: () => false },
  subtle: { detail: [1, 1], from: 8, snare: () => false },
  rhythmic: { beat: [2, 3], from: 1, snare: (d) => d > 0.5 },
  fills: { beat: [1, 3], detail: [1, 2], from: 8, snare: () => true },
  sparse: { detail: [0, 1], from: 4, snare: () => false, texture: 'thin' },
  dense: { beat: [0, 2], detail: [1, 3], from: 1, snare: () => false, texture: 'thicken' },
  wild: { beat: [3, 4], detail: [3, 3], from: 0, snare: () => true },
};

/** SPARSE: take out the decoration (ghosts, percussion, off-beat time, extra kicks), never the downbeat or a backbeat. */
function thin(hits: Hit[], def: StyleDef, p: number, rng: Rng, beat: boolean, detail: boolean): Hit[] {
  const kicks = hits.filter((h) => h.cat === 'kick').length;
  let dropped = 0;
  return hits.filter((h) => {
    const extraKick = beat && h.cat === 'kick' && h.step !== 0 && !def.fixedKicks.includes(h.step) && kicks - dropped > 1;
    const decoration = detail && (h.cat === 'ghost' || h.cat === 'perc' || h.cat === 'open' || ((h.cat === 'hat' || h.cat === 'ride') && h.step % 2 === 1));
    if (!(extraKick || decoration) || !rng.chance(extraKick ? p * 0.6 : p)) return true;
    if (extraKick) dropped++;
    return false;
  });
}

/** DENSE: ghosts into the backbeats and time on the off-sixteenths, where there is room. */
function thicken(hits: Hit[], def: StyleDef, p: number, rng: Rng, timekeeper: 'hat' | 'ride', beat: boolean, detail: boolean, what: string): Hit[] {
  const out = hits.slice();
  if (detail) for (let s = 1; s < STEPS; s += 2) {
    if (def.ghostMax > 0 && !has(out, 'snare', s) && !has(out, 'ghost', s) && (has(out, 'snare', s + 1) || has(out, 'snare', s - 1)) && rng.chance(p))
      out.push({ cat: 'ghost', step: s, sub: 0, level: def.ghostLevel, role: 'ghost', why: `ghost on ${posName(s)}: ${what}` });
    if (!has(out, timekeeper, s) && has(out, timekeeper, s - 1) && rng.chance(p * 0.8))
      out.push({ cat: timekeeper, step: s, sub: 0, level: 0.34, role: 'time', why: `${timekeeper === 'ride' ? 'ride' : 'hat'} on ${posName(s)}: ${what}` });
  }
  // a pickup kick into the next beat
  if (beat) for (const s of [7, 15]) if (!has(out, 'kick', s) && !has(out, 'snare', s) && !has(out, 'snare', (s + 1) % STEPS) && rng.chance(p * 0.5))
    out.push({ cat: 'kick', step: s, sub: 0, level: 0.7, role: 'pickup kick', why: `pickup kick on ${posName(s)}: ${what}` });
  return out;
}
