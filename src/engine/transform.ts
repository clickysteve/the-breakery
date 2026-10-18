/**
 * TRANSFORMATION: what is done to a GROOVE once it is generated. Each transformation is a pure
 * function of the GROOVE's events, the recipe and the seeds; they run in order, each from the one
 * before, and every BAKE runs them again from the GROOVE (so they never compound). A transformation
 * that is off returns its input untouched, so a recipe without it bakes exactly as before.
 *
 * CHOP is the only one for now. Another (an EVOLVE, say) would be one more entry in TRANSFORMS with
 * its settings in the recipe beside `chop`.
 */
import { chop, chopActive } from './chopper';
import type { BarRole, BreakEvent, ChopReport, Recipe, Seeds } from './types';

export interface TransformContext {
  recipe: Recipe;
  seeds: Seeds;
  plan: BarRole[];
}

export interface TransformResult {
  events: BreakEvent[];
  /** CHOP's report (absent when CHOP did not run) */
  chop?: ChopReport;
}

interface Transformation {
  id: 'chop';
  active(recipe: Recipe): boolean;
  apply(events: BreakEvent[], ctx: TransformContext): { events: BreakEvent[]; report: ChopReport };
}

const CHOP: Transformation = {
  id: 'chop',
  active: (r) => chopActive(r.chop),
  // seeded from the BEAT seed: FREEZE BEAT (and RHYTHM) keep the chop with the kick and snare
  apply: (events, ctx) => chop(events, ctx.recipe.chop!, { recipe: ctx.recipe, plan: ctx.plan, seed: ctx.seeds.beat }),
};

/** The transformations, in the order they run. */
export const TRANSFORMS: readonly Transformation[] = [CHOP];

export function transform(events: BreakEvent[], ctx: TransformContext): TransformResult {
  const out: TransformResult = { events };
  for (const t of TRANSFORMS) {
    if (!t.active(ctx.recipe)) continue;
    const r = t.apply(out.events, ctx);
    out.events = r.events;
    out[t.id] = r.report;
  }
  return out;
}
