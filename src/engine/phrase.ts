/**
 * Layer D: phrase development. Bars are derived from the groove cell, not regenerated:
 *
 *   1 bar  A            2 bars  A T            4 bars  A A2 A T
 *
 * A2 (answer) is the cell with a few variation operations, mostly in its second half (where
 * the classic breaks put their variations). T (turnaround) is an answer plus a fill at the end
 * that pushes back into the top of the loop: a snare run, a displaced (delayed) backbeat with an
 * early crash, a drop-out, or a stutter.
 */
import { posName } from './meter';
import type { Rng } from './rng';
import type { FillKind, StyleDef } from './styles';
import { clamp, STEPS, type BarRole, type Hit, type Recipe } from './types';

export function planBars(bars: number): BarRole[] {
  if (bars <= 1) return ['A'];
  if (bars === 2) return ['A', 'T'];
  return ['A', 'A2', 'A', 'T'];
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
  return [...m.values()].sort((a, b) => a.step * 12 + a.sub - (b.step * 12 + b.sub));
}

const has = (hits: Hit[], cat: Hit['cat'], step: number) => hits.some((h) => h.cat === cat && h.step === step && h.sub === 0);

type BeatOp = 'kickShift' | 'kickAdd' | 'kickDrop' | 'snareDelay';
type DetailOp = 'ghostAdd' | 'ghostDrop' | 'openAdd';

function regionStart(def: StyleDef, rng: Rng): number {
  return def.restless && rng.chance(0.4) ? 4 : 8;
}

/** Variation operations on kick and snare (beat stream). */
function varyBeat(hits: Hit[], def: StyleDef, recipe: Recipe, n: number, rng: Rng, allowSnare: boolean): Hit[] {
  let out = hits.slice();
  for (let i = 0; i < n; i++) {
    const from = regionStart(def, rng);
    const ops: BeatOp[] = ['kickShift', 'kickAdd', 'kickDrop', 'snareDelay'];
    const op = ops[rng.weighted([1.2, 1, 0.6, allowSnare ? 0.5 * recipe.complexity + 0.1 : 0])]!;
    const kicks = out.filter((h) => h.cat === 'kick' && h.step >= from && h.step !== 0 && h.sub === 0);
    if (op === 'kickShift' && kicks.length) {
      const k = rng.pick(kicks);
      const to = k.step + (rng.chance(0.6) ? -1 : 1);
      if (to > 0 && to < STEPS && !has(out, 'kick', to) && !has(out, 'snare', to)) {
        out = out.filter((h) => h !== k);
        out.push({ ...k, step: to, role: to % 2 ? 'syncopated kick' : 'kick', level: to % 2 ? 0.74 : 0.8, why: `kick moved from ${posName(k.step)} to ${posName(to)}: a variation on the first bar` });
      }
    } else if (op === 'kickAdd') {
      const w = def.kickWeights.map((x, s) => (s < from || has(out, 'kick', s) || has(out, 'snare', s) ? 0 : x));
      const s = rng.weighted(w);
      if (s > 0) out.push({ cat: 'kick', step: s, sub: 0, level: 0.76, role: s % 2 ? 'syncopated kick' : 'kick', why: `extra kick on ${posName(s)}: a variation on the first bar` });
    } else if (op === 'kickDrop' && kicks.length > 0 && out.filter((h) => h.cat === 'kick').length > 2) {
      const k = rng.pick(kicks);
      out = out.filter((h) => h !== k);
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
function varyDetail(hits: Hit[], def: StyleDef, n: number, rng: Rng, timekeeper: 'hat' | 'ride'): Hit[] {
  let out = hits.slice();
  for (let i = 0; i < n; i++) {
    const from = regionStart(def, rng);
    const ops: DetailOp[] = ['ghostAdd', 'ghostDrop', 'openAdd'];
    const op = ops[rng.weighted([1, 0.7, timekeeper === 'hat' ? 0.5 : 0.1])]!;
    if (op === 'ghostAdd') {
      const cands: number[] = [];
      for (let s = from; s < STEPS; s++) if (s % 2 === 1 && !has(out, 'snare', s) && !has(out, 'ghost', s) && !has(out, 'ghost', s - 1) && !has(out, 'ghost', s + 1)) cands.push(s);
      if (cands.length) {
        const s = rng.pick(cands);
        out.push({ cat: 'ghost', step: s, sub: 0, level: def.ghostLevel, role: 'ghost', why: `ghost on ${posName(s)}: a variation on the first bar` });
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
        out.push({ cat: 'open', step: s, sub: 0, level: 0.72, role: 'lift', why: `open hat on ${posName(s)}: a lift in the answer bar` });
      }
    }
  }
  return out;
}

/** The fill at the end of a turnaround bar. */
function addFill(hits: Hit[], def: StyleDef, recipe: Recipe, length: number, rng: Rng, crashAtTop: boolean): { hits: Hit[]; kind: FillKind } {
  const L = clamp(length, 1, 8);
  const start = STEPS - L;
  const w = { ...def.fillKinds };
  if (L <= 2) {
    w.run *= 0.5;
    w.stutter *= 1.5;
  }
  const kinds: FillKind[] = ['run', 'displace', 'drop', 'stutter'];
  const kind = kinds[rng.weighted(kinds.map((k) => w[k]))]!;
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
  } else {
    // stutter: kick and snare alternate in sixteenths (a linear fill), the last snare doubled
    out = out.filter((h) => !(inFill(h) && (h.cat === 'kick' || h.cat === 'ghost' || h.cat === 'hat' || h.cat === 'open' || h.cat === 'perc' || (h.cat === 'snare' && h.role !== 'backbeat'))));
    for (let s = start; s < STEPS; s++) {
      const cat = (s - start) % 2 === 0 ? 'kick' : 'snare';
      out.push({ cat, step: s, sub: 0, level: cat === 'kick' ? 0.8 : 0.7 + (0.25 * (s - start)) / L, role: 'fill', why: 'stuttered kick/snare fill' });
    }
    out.push({ cat: 'snare', step: 15, sub: 6, level: 0.75, role: 'fill', why: 'retriggered snare on the last 32nd' });
  }
  return { hits: out, kind };
}

export interface DevelopContext {
  def: StyleDef;
  recipe: Recipe;
  timekeeper: 'hat' | 'ride';
  beatRng: Rng;
  detailRng: Rng;
  crashAtTop: boolean;
}

/** Derive a bar of the given role from the groove cell. */
export function developBar(cell: Hit[], role: BarRole, ctx: DevelopContext, miniFill = false): Hit[] {
  if (role === 'A') return tidy(cell.map((h) => ({ ...h })));
  const { def, recipe } = ctx;
  const n = Math.round(recipe.variation * 3 * ctx.beatRng.range(0.6, 1.3));
  let out = varyBeat(cell, def, recipe, n, ctx.beatRng, role === 'T' || def.restless);
  out = varyDetail(out, def, Math.round(recipe.variation * 2.5 * ctx.detailRng.range(0.6, 1.3)), ctx.detailRng, ctx.timekeeper);
  if (role === 'T' && recipe.fills > 0.05) {
    const L = Math.round(def.fillMax * recipe.fills * ctx.beatRng.range(0.7, 1.15));
    if (L > 0) out = addFill(out, def, recipe, L, ctx.beatRng, ctx.crashAtTop).hits;
  } else if (miniFill) {
    out = addFill(out, def, recipe, 2, ctx.beatRng, true).hits;
  }
  return tidy(out);
}
