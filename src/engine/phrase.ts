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
import { chopBar, roll } from './chop';
import { posName } from './meter';
import type { Rng } from './rng';
import type { FillKind, StyleDef } from './styles';
import { clamp, STEPS, type BarRole, type Hit, type Recipe } from './types';

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
export function varyDetail(hits: Hit[], def: StyleDef, n: number, rng: Rng, timekeeper: 'hat' | 'ride', what = 'a variation on the first bar', fromAll?: number): Hit[] {
  let out = hits.slice();
  for (let i = 0; i < n; i++) {
    const from = fromAll ?? regionStart(def, rng);
    const ops: DetailOp[] = ['ghostAdd', 'ghostDrop', 'openAdd'];
    const op = ops[rng.weighted([def.ghostMax > 0 ? 1 : 0, 0.7, timekeeper === 'hat' ? 0.5 : 0.1])]!;
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
}

/** All bars of the phrase, derived from the groove cell. */
export function developPhrase(cell: Hit[], roles: BarRole[], ctx: DevelopContext): Hit[][] {
  const { def, recipe, beatRng, detailRng } = ctx;
  const copy = (hs: Hit[]) => hs.map((h) => ({ ...h }));
  const loopy = def.loop && recipe.variation < 0.5;

  // the answer (shared by every A2, and the base of B, F and T)
  const nBeat = loopy ? 0 : Math.round(recipe.variation * 3 * beatRng.range(0.6, 1.3));
  const nDetail = loopy ? 0 : Math.round(recipe.variation * 2.5 * detailRng.range(0.6, 1.3));
  let answer = varyBeat(cell, def, recipe, nBeat, beatRng, def.restless);
  answer = tidy(varyDetail(answer, def, nDetail, detailRng, ctx.timekeeper));

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
  for (const role of roles) {
    if (role === 'A') bars.push(tidy(copy(cell)));
    else if (role === 'A2') {
      // breakcore: even the answer is cut up
      if (def.warp >= 0.3) bars.push(tidy(chopBar(copy(answer), [{ hits: answer, name: 'answer' }, { hits: cell, name: 'groove' }], beatRng, { amount: def.chop * 0.6, from: 8, roll: false, warp: def.warp * 0.5 })));
      else bars.push(tidy(copy(answer)));
    }
    else if (role === 'B') {
      // development: more variation, then (in the chop recipes) a resequencing of the groove
      let b = varyBeat(answer, def, recipe, Math.max(1, Math.round(recipe.variation * 2)), beatRng, true, 'developing the groove', 4);
      b = varyDetail(b, def, Math.max(1, Math.round(recipe.variation * 2)), detailRng, ctx.timekeeper, 'developing the groove', 4);
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
      bars.push(tidy(recipe.fills > 0.05 && L > 0 ? addFill(copy(answer), kind, def, recipe, L, beatRng, true, [cell]) : copy(answer)));
    } else {
      let t = copy(answer);
      if (def.warp > 0 && beatRng.chance(def.warp)) t = chopBar(tidy(t), [{ hits: tidy(t), name: 'answer' }, { hits: cell, name: 'groove' }], beatRng, { amount: def.chop, from: 4, roll: false, warp: def.warp });
      if (recipe.fills > 0.05 && fullL > 0) t = addFill(t, kind, def, recipe, fullL, beatRng, ctx.crashAtTop, [cell]);
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
export function mutateCell(cell: Hit[], def: StyleDef, recipe: Recipe, rng: Rng, beat: boolean, detail: boolean, timekeeper: 'hat' | 'ride'): Hit[] {
  let out = cell.map((h) => ({ ...h }));
  if (beat) out = varyBeat(out, def, recipe, 1 + (rng.chance(0.4) ? 1 : 0), rng, false, 'a mutation of the groove', 2);
  if (detail) out = varyDetail(out, def, 1 + (rng.chance(0.5) ? 1 : 0), rng, timekeeper, 'a mutation of the groove', 1);
  return tidy(out);
}
