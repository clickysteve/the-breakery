/**
 * BAKE: the whole generator, top-down.
 *
 *   phrase plan  ->  foundation (kick, snare)  ->  supporting voices  ->  phrase development
 *               ->  performance (velocity, swing, microtiming)  ->  sample choice
 *
 * Deterministic: the same recipe, seeds and kit give the same break. Streams per layer:
 *   beat   foundation, kick/snare variation, fills, crash placement
 *   detail timekeeper plan, ghosts, lifts, percussion, their variation
 *   feel   performance
 *   kit    sample choice
 */
import { generateFoundation } from './foundation';
import { assignSamples, emptyKit, type KitIndex } from './kit';
import { perform } from './performance';
import { developBar, planBars, tidy } from './phrase';
import { freshSeed, stream } from './rng';
import { STYLE_DEFS } from './styles';
import { generateSupport, planSupport } from './support';
import { clamp, LAYERS, RECIPE_KEYS, type Break, type Layer, type Recipe, type Seeds } from './types';

/** Recipe values made safe (clamped, known style, whole bars). */
export function sanitiseRecipe(r: Recipe): Recipe {
  const def = STYLE_DEFS[r.style] ?? STYLE_DEFS.funk;
  const out: Recipe = { ...r, style: def.style, bpm: clamp(Math.round(Number(r.bpm) || def.bpm[2]), 40, 220), bars: r.bars === 1 || r.bars === 4 ? r.bars : 2 };
  for (const k of RECIPE_KEYS) out[k] = clamp(Number(r[k]) || 0, 0, 1);
  return out;
}

export function bake(recipeIn: Recipe, seeds: Seeds, kit: KitIndex = emptyKit()): Break {
  const recipe = sanitiseRecipe(recipeIn);
  const def = STYLE_DEFS[recipe.style];

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
  assignSamples(events, kit, seeds.kit);
  return { recipe, seeds: { ...seeds }, plan: roles, feel, timekeeper: plan.timekeeper, events };
}

export function randomSeeds(): Seeds {
  return { beat: freshSeed(), detail: freshSeed(), feel: freshSeed(), kit: freshSeed() };
}

/** All layers from one seed (what the SEED box shows and sets). */
export function seedsFrom(seed: number): Seeds {
  const s = seed >>> 0;
  return { beat: s, detail: s, feel: s, kit: s };
}

/** New seeds, keeping the frozen layers. */
export function reseed(current: Seeds, frozen: Partial<Record<Layer, boolean>>, seed = freshSeed()): Seeds {
  const next = seedsFrom(seed);
  for (const l of LAYERS) if (frozen[l]) next[l] = current[l];
  return next;
}
