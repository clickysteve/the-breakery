/**
 * TRANSFORMATION: what is done to a GROOVE once it is generated. Each transformation is a pure
 * function of the GROOVE's events, the recipe and the seeds; they run in order, each from the one
 * before, and every BAKE runs them again from the GROOVE (so they never compound). A transformation
 * that is off returns its input untouched, so a recipe without it bakes exactly as before.
 *
 *   CHOP        fragments rearranged (chopper.ts), leaning the way BREAK DNA says (dna.ts)
 *   ROLLS       revision 6: retriggers leading into eligible hits, PROBABILITY per candidate, RE-ROLL takes (rollLayer.ts)
 *   EXPRESSION  every roll reshaped: pitch, velocity and timing contours, ratchets (rollExpr.ts)
 *   DESTROY     stutters, reverses, pitch dives, gates, skips, freezes, tape stops (destroy.ts)
 * Another would be one more entry in TRANSFORMS with its settings in the recipe.
 */
import { chop, chopActive, CHOP_STYLE } from './chopper';
import { destroy, destroyActive, type DestroyReport } from './destroy';
import { dnaChopStyle } from './dna';
import { exprActive, expressRolls } from './rollExpr';
import { rollLayer, usesRollLayer } from './rollLayer';
import type { BarRole, BreakEvent, ChopReport, Recipe, RollReport, Seeds } from './types';

export interface TransformContext {
  recipe: Recipe;
  seeds: Seeds;
  plan: BarRole[];
}

export interface TransformResult {
  events: BreakEvent[];
  /** CHOP's report (absent when CHOP did not run) */
  chop?: ChopReport;
  /** DESTROY's report (absent when DESTROY did not run) */
  destroy?: DestroyReport;
  /** the ROLLS transformation's report (revision 6; absent before) */
  rolls?: RollReport;
}

interface Transformation {
  id: 'chop' | 'rolls' | 'express' | 'destroy';
  active(recipe: Recipe): boolean;
  apply(events: BreakEvent[], ctx: TransformContext): { events: BreakEvent[]; report?: ChopReport | DestroyReport | RollReport };
}

/** ROLL GENERATION off (revision 1 on): no transformation makes a new roll. */
const noRolls = (r: Recipe) => r.rollsOn === false && (r.revision ?? 0) >= 1;

const CHOP: Transformation = {
  id: 'chop',
  active: (r) => chopActive(r.chop),
  // seeded from the BEAT seed: FREEZE BEAT (and RHYTHM) keep the chop with the kick and snare
  apply: (events, ctx) => chop(events, ctx.recipe.chop!, { recipe: ctx.recipe, plan: ctx.plan, seed: ctx.seeds.beat, ...(ctx.recipe.dna ? { style: dnaChopStyle(CHOP_STYLE[ctx.recipe.style], ctx.recipe.dna, !noRolls(ctx.recipe)) } : {}) }),
};

const ROLLS: Transformation = {
  id: 'rolls',
  // it always runs from revision 6, so its report says why there are no rolls (generation off included)
  active: (r) => usesRollLayer(r),
  // seeded from the BEAT seed (where) and the FEEL seed (how), with the RE-ROLL take
  apply: (events, ctx) => rollLayer(events, ctx.recipe, ctx.seeds, ctx.plan),
};

const EXPRESS: Transformation = {
  id: 'express',
  active: (r) => exprActive(r.rollExpr),
  // seeded from the FEEL seed (how the rolls are played) and the DICE variant
  apply: (events, ctx) => ({ events: expressRolls(events, ctx.recipe.rollExpr!, ctx.seeds.feel, ctx.recipe.bpm).events }),
};

const DESTROY: Transformation = {
  id: 'destroy',
  active: (r) => destroyActive(r.destroy),
  apply: (events, ctx) => destroy(events, ctx.recipe.destroy!, { plan: ctx.plan, seed: ctx.seeds.beat, bpm: ctx.recipe.bpm, noRolls: noRolls(ctx.recipe) }),
};

/** The transformations, in the order they run. */
export const TRANSFORMS: readonly Transformation[] = [CHOP, ROLLS, EXPRESS, DESTROY];

export function transform(events: BreakEvent[], ctx: TransformContext): TransformResult {
  const out: TransformResult = { events };
  for (const t of TRANSFORMS) {
    if (!t.active(ctx.recipe)) continue;
    const r = t.apply(out.events, ctx);
    out.events = r.events;
    if (t.id === 'chop') out.chop = r.report as ChopReport;
    if (t.id === 'rolls') out.rolls = r.report as RollReport;
    if (t.id === 'destroy') out.destroy = r.report as DestroyReport;
  }
  return out;
}
