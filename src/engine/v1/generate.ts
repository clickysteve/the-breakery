/**
 * ENGINE 1 (frozen, The Breakery 0.1): the first release's generator, kept so its breaks stay
 * reproducible from their seeds. Lengths it never had (3, 5–8 bars) use an extended plan; 1, 2 and
 * 4 bars are exactly as released. Sample choice happens afterwards (../samples.ts) for both engines.
 *
 *   phrase plan  ->  foundation (kick, snare)  ->  supporting voices  ->  phrase development
 *               ->  performance (velocity, swing, microtiming)
 */
import { stream } from '../rng';
import type { Break, Recipe, Seeds } from '../types';
import { generateFoundation } from './foundation';
import { perform } from './performance';
import { developBar, planBars, tidy } from './phrase';
import { STYLE_DEFS, type V1Style } from './styles';
import { generateSupport, planSupport } from './support';

export function bakeV1(recipe: Recipe, seeds: Seeds): Omit<Break, 'recipe' | 'seeds'> {
  const def = STYLE_DEFS[recipe.style as V1Style] ?? STYLE_DEFS.funk;

  const plan = planSupport(def, recipe, stream(seeds.detail, 'plan'));
  const foundation = generateFoundation(def, recipe, stream(seeds.beat, 'foundation'));
  const support = generateSupport(def, recipe, plan, foundation.hits, foundation.backbeats, stream(seeds.detail, 'support'));
  const cell = tidy([...foundation.hits, ...support]);

  const roles = planBars(recipe.bars);
  const crashAtTop = stream(seeds.beat, 'crash').chance(def.crashP * (0.4 + recipe.fills));
  const ctx = { def, recipe, timekeeper: plan.timekeeper, beatRng: stream(seeds.beat, 'phrase'), detailRng: stream(seeds.detail, 'phrase'), crashAtTop };
  const bars = roles.map((role, i) => developBar(cell, role, ctx, recipe.bars === 4 && i === 1 && recipe.fills > 0.7));

  if (crashAtTop) {
    bars[0] = tidy([
      ...bars[0]!.filter((h) => !((h.cat === 'hat' || h.cat === 'ride' || h.cat === 'open') && h.step === 0)),
      { cat: 'crash', step: 0, sub: 0, level: 0.85, role: 'crash', why: 'crash at the top of the phrase' },
    ]);
  }

  const { events, feel } = perform(bars, def, recipe, stream(seeds.feel, 'performance'));
  return { plan: roles, feel, timekeeper: plan.timekeeper, events };
}
