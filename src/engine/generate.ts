/**
 * BAKE: the whole generator, top-down.
 *
 *   phrase plan  ->  foundation (kick, snare)  ->  supporting voices  ->  [mutations]
 *               ->  phrase development (answer, development, chops, fills)
 *               ->  performance (velocity, swing, microtiming)  ->  sample selection
 *
 * Deterministic: the same recipe (including its ENGINE), seeds, kit and sample settings give the
 * same break. Streams per layer:
 *   beat    foundation, kick/snare variation, chops, fills, crash placement
 *   detail  timekeeper plan, ghosts, lifts, percussion, their variation
 *   feel    performance
 *   kit     sample selection
 *   mut     MUTATE: each mutation seed varies the groove cell (engine 2)
 *
 * Engine 1 (v1/) is the first release's generator, frozen so its breaks stay reproducible.
 */
import { generateFoundation } from './foundation';
import { emptyKit, type KitIndex } from './kit';
import { perform } from './performance';
import { developPhrase, mutateCell, planBars, tidy } from './phrase';
import { freshSeed, hashString, stream } from './rng';
import { selectSamples, type SampleContext } from './samples';
import { STYLE_DEFS } from './styles';
import { generateSupport, planSupport } from './support';
import { bakeV1 } from './v1/generate';
import { V1_STYLES, type V1Style } from './v1/styles';
import { clamp, LAYERS, MAX_BARS, MIN_BARS, RECIPE_KEYS, type Bars, type Break, type Engine, type Layer, type Mutation, type Recipe, type Seeds } from './types';

/** Recipe values made safe (clamped, known style and engine, whole bars 1–8). */
export function sanitiseRecipe(r: Recipe): Recipe {
  const def = STYLE_DEFS[r.style] ?? STYLE_DEFS.funk;
  const bars = clamp(Math.round(Number(r.bars) || 2), MIN_BARS, MAX_BARS) as Bars;
  // a recipe without an engine predates engine 2: it was baked by engine 1
  let engine: Engine = r.engine === 1 || r.engine === undefined || r.engine === null ? 1 : 2;
  if (engine === 1 && !V1_STYLES.includes(def.style as V1Style)) engine = 2; // engine 1 only knows the original four
  const out: Recipe = { ...r, style: def.style, engine, bpm: clamp(Math.round(Number(r.bpm) || def.bpm[2]), 40, 220), bars };
  for (const k of RECIPE_KEYS) out[k] = clamp(Number(r[k]) || 0, 0, 1);
  return out;
}

function bakeV2(recipe: Recipe, seeds: Seeds): Omit<Break, 'recipe' | 'seeds'> {
  const def = STYLE_DEFS[recipe.style];
  const plan = planSupport(def, recipe, stream(seeds.detail, 'plan'));
  const foundation = generateFoundation(def, recipe, stream(seeds.beat, 'foundation'));
  const support = generateSupport(def, recipe, plan, foundation.hits, foundation.backbeats, stream(seeds.detail, 'support'));
  let cell = tidy([...foundation.hits, ...support]);
  for (const m of seeds.mut ?? []) cell = mutateCell(cell, def, recipe, stream(m.seed, 'mutate'), m.beat, m.detail, plan.timekeeper);

  const roles = planBars(recipe.bars, def);
  const crashAtTop = stream(seeds.beat, 'crash').chance(def.crashP * (0.4 + recipe.fills));
  const ctx = { def, recipe, timekeeper: plan.timekeeper, sixteenths: plan.sixteenths, beatRng: stream(seeds.beat, 'phrase'), detailRng: stream(seeds.detail, 'phrase'), crashAtTop };
  const bars = developPhrase(cell, roles, ctx);

  const crash = (i: number, why: string) => {
    bars[i] = tidy([...bars[i]!.filter((h) => !((h.cat === 'hat' || h.cat === 'ride' || h.cat === 'open') && h.step === 0)), { cat: 'crash', step: 0, sub: 0, level: 0.85, role: 'crash', why }]);
  };
  if (crashAtTop) {
    crash(0, 'crash at the top of the phrase');
    // a new section after a half-way fill starts with a crash too
    roles.forEach((r, i) => r === 'F' && i + 1 < roles.length && crash(i + 1, 'crash: a new four-bar section after the half-way fill'));
  }

  const { events, feel } = perform(bars, roles, def, recipe, stream(seeds.feel, 'performance'), plan.cycle);
  return { plan: roles, feel, timekeeper: plan.timekeeper, events };
}

export function bake(recipeIn: Recipe, seeds: Seeds, kit: KitIndex = emptyKit(), samples: SampleContext = {}, names?: (id: string) => string): Break {
  const recipe = sanitiseRecipe(recipeIn);
  const core = recipe.engine === 1 ? bakeV1(recipe, seeds) : bakeV2(recipe, seeds);
  selectSamples(core.events, kit, seeds.kit, samples, names);
  return { recipe, seeds: { ...seeds, ...(seeds.mut ? { mut: seeds.mut.map((m) => ({ ...m })) } : {}) }, ...core };
}

export function randomSeeds(): Seeds {
  return { beat: freshSeed(), detail: freshSeed(), feel: freshSeed(), kit: freshSeed() };
}

/** All layers from one seed (what the SEED box shows and sets). */
export function seedsFrom(seed: number): Seeds {
  const s = seed >>> 0;
  return { beat: s, detail: s, feel: s, kit: s };
}

/** New seeds, keeping the frozen layers (and, when beat and detail are both frozen, the mutations). */
export function reseed(current: Seeds, frozen: Partial<Record<Layer, boolean>>, seed = freshSeed()): Seeds {
  const next = seedsFrom(seed);
  for (const l of LAYERS) if (frozen[l]) next[l] = current[l];
  if (frozen.beat && frozen.detail && current.mut?.length) next.mut = current.mut.map((m) => ({ ...m }));
  return next;
}

// ------------------------------------------------------------------ named seeds

/** The largest seed typed as a number (larger numbers, and anything else, are hashed as text). */
export const MAX_NUMERIC_SEED = 999999999;

/** Normalise a seed name: trimmed, lower case, single spaces (so "Funky  Chicken" = "funky chicken"). */
export function normaliseSeedName(text: string): string {
  return text.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 32-bit FNV-1a over the name's UTF-8 bytes: stable across browsers and versions. */
export function hashSeedName(text: string): number {
  const bytes = new TextEncoder().encode(normaliseSeedName(text));
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A seed from what was typed: a whole number is that seed (so every numeric seed from the
 * first release still works); any other text is a NAMED seed, hashed.
 */
export function parseSeed(text: string): { seed: number; name: string | null } | null {
  const t = normaliseSeedName(text);
  if (!t) return null;
  if (/^\d+$/.test(t) && Number(t) <= MAX_NUMERIC_SEED) return { seed: Number(t), name: null };
  return { seed: hashSeedName(t), name: t };
}

/** The name or number to show for a seed. */
export const seedLabel = (seed: number, name: string | null | undefined): string => name || String(seed);

// ------------------------------------------------------------------ mutation

/** A new mutation of the current break, varying the layers that are not frozen. */
export function mutate(current: Seeds, frozen: Partial<Record<Layer, boolean>>, seed = freshSeed()): Seeds | null {
  const m: Mutation = { seed: hashString(`mut:${seed}:${current.mut?.length ?? 0}`), beat: !frozen.beat, detail: !frozen.detail };
  if (!m.beat && !m.detail) return null;
  return { ...current, mut: [...(current.mut ?? []).map((x) => ({ ...x })), m] };
}
