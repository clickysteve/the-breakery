/**
 * CHOP (engine 2): event-level resequencing of the groove, the nearest a one-shot generator gets
 * to what hardcore and jungle producers did with a sampled break (docs/BREAKBEAT_RESEARCH.md §4).
 *
 * Model (after Collins' phrase / block / repeat cutting and Hockman & Davies' resequencing):
 * - The SOURCE is up to two bars of this break (the groove and its answer), like the two
 *   measures of a sampled break a producer cuts from.
 * - The output bar is filled with BLOCKS of 2, 3, 4 or 8 sixteenths, favouring odd sizes so
 *   groupings such as 3+3+2 appear. Each block copies the hits of one slice of the source (an
 *   offset into it), possibly REPEATED (a cut played twice). Early blocks tend to keep their own
 *   slice; later ones are more often moved or repeated (Collins: phrase-position weights).
 * - Salient slices (those that start with a kick or snare) are preferred as offsets, so a chop
 *   moves recognisable hits (snare displacement), rather than smearing hats.
 * - A ROLL may end the bar: one snare retriggered at sixteenths, then 32nds, louder towards the
 *   loop point (Collins: rolls at the end of a phrase). WARP (breakcore) allows rolls and
 *   accelerating stutters inside the bar too.
 *
 * Every copied hit keeps its sound category and nominal level and says where it came from. What
 * this cannot do: the tail and room of a sampled slice, pitch changes, time-stretch artefacts and
 * resampling; those need an audio slicing engine (the planned OVERBAKE).
 */
import { posName } from './meter';
import type { Rng } from './rng';
import { STEPS, TPS, type Hit } from './types';

export interface ChopSource {
  hits: Hit[];
  /** "groove", "answer" … (for explanations) */
  name: string;
}

export interface ChopOpts {
  /** 0..1: how much is moved or repeated rather than kept */
  amount: number;
  /** first step of the bar to chop (0 = the whole bar) */
  from: number;
  /** end the bar with a snare roll */
  roll: boolean;
  /** 0..1: rolls and stutters inside the bar (breakcore) */
  warp: number;
}

const salient = (src: Hit[], off: number) => src.some((h) => h.step === off && h.sub === 0 && (h.cat === 'kick' || (h.cat === 'snare' && h.level >= 0.8)));

/** A snare roll from `start` to the end of the bar: 16ths then 32nds (and 48ths when warped), crescendo. */
export function roll(start: number, end: number, rng: Rng, accelerate: boolean, why = 'snare roll into the top of the loop'): Hit[] {
  const out: Hit[] = [];
  const t0 = start * TPS;
  const t1 = end * TPS;
  const len = t1 - t0;
  let t = t0;
  while (t < t1) {
    const f = (t - t0) / Math.max(1, len);
    out.push({ cat: 'snare', step: Math.floor(t / TPS), sub: t % TPS, level: 0.42 + 0.5 * f, role: 'roll', why });
    const dt = f < 0.5 ? TPS : accelerate && f >= 0.75 && rng.chance(0.7) ? TPS / 3 : TPS / 2;
    t += dt;
  }
  return out;
}

export function chopBar(base: Hit[], sources: ChopSource[], rng: Rng, o: ChopOpts): Hit[] {
  const out: Hit[] = base.filter((h) => h.step < o.from).map((h) => ({ ...h }));
  let pos = o.from;
  let block = 0;
  const rollLen = o.roll ? (rng.chance(0.5) ? 2 : rng.chance(0.6) ? 3 : 4) : 0;
  const end = STEPS - rollLen;
  while (pos < end) {
    const remaining = end - pos;
    const sizes = [2, 3, 4, 8].filter((s) => s <= remaining);
    let size = remaining === 1 ? 1 : sizes[rng.weighted(sizes.map((s) => (s === 3 ? 1 : s === 2 ? 0.8 : s === 4 ? 0.7 : pos === o.from && block === 0 ? 0.4 : 0)))] ?? remaining;
    if (remaining - size === 1) size = remaining; // never leave a lone sixteenth
    const keepP = pos === 0 ? 1 : (1 - o.amount) * 0.8 + (block === 0 ? 0.25 : 0) - 0.08 * block;
    if (rng.chance(Math.max(0.05, keepP))) {
      for (const h of base) if (h.step >= pos && h.step < pos + size) out.push({ ...h });
    } else {
      const si = sources.length > 1 && rng.chance(0.45) ? 1 : 0;
      const src = sources[si]!;
      // a cut played `reps` times fills the block
      const reps = size >= 4 && size % 2 === 0 && rng.chance(0.25 + 0.35 * o.amount) ? 2 : 1;
      const cut = size / reps;
      const offs: number[] = [];
      const w: number[] = [];
      for (let off = 0; off + cut <= STEPS; off += 1) {
        if (off % 2 === 1 && cut % 2 === 0) continue;
        if (off === pos && si === 0 && reps === 1) continue; // that would be keeping it
        offs.push(off);
        w.push((salient(src.hits, off) ? 2.2 : 0.6) * (off % 4 === 0 ? 1.2 : 1));
      }
      const off = offs[Math.max(0, rng.weighted(w))] ?? 0;
      const warpIt = o.warp > 0 && rng.chance(o.warp * 0.5);
      if (warpIt) {
        // a stutter: the slice's first sound retriggered through the block, accelerating
        const first = src.hits.filter((h) => h.step === off && h.sub === 0 && h.cat !== 'hat' && h.cat !== 'ride').sort((a, b) => b.level - a.level)[0];
        if (first) {
          let t = pos * TPS;
          let dt = TPS;
          let i = 0;
          while (t < (pos + size) * TPS) {
            out.push({ cat: first.cat, step: Math.floor(t / TPS), sub: t % TPS, level: Math.min(1, first.level * (0.6 + 0.08 * i)), role: 'roll', why: `stutter: the ${posName(off)} slice of the ${src.name} retriggered, accelerating` });
            i++;
            t += dt;
            if (i % 2 === 0 && dt > TPS / 3) dt = dt === TPS ? TPS / 2 : TPS / 3;
          }
          pos += size;
          block++;
          continue;
        }
      }
      for (let r = 0; r < reps; r++) {
        for (const h of src.hits) {
          if (h.step < off || h.step >= off + cut) continue;
          const step = pos + r * cut + (h.step - off);
          if (step >= STEPS) continue;
          const same = si === 0 && step === h.step;
          out.push({
            ...h,
            step,
            level: h.level * (r ? 0.93 : 1),
            role: same ? h.role : 'chop',
            why: same ? h.why : `chop: the ${posName(off)}–${posName(off + cut - 1)} slice of the ${src.name}${reps > 1 ? ', played twice' : ''}, moved to ${posName(pos + r * cut)} (was ${h.role})`,
          });
        }
      }
    }
    pos += size;
    block++;
  }
  if (rollLen) {
    // the fill region keeps its kick on the first step, then the roll
    for (const h of base) if (h.step === end && h.cat === 'kick') out.push({ ...h });
    out.push(...roll(end, STEPS, rng, o.warp > 0));
  }
  return out;
}
