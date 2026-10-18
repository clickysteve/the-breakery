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
import { applyEdits, hasEdits, type Edits } from './edits';
import { autoSamples, finishSamples, type SampleContext } from './samples';
import { FLOURISH, STYLE_DEFS } from './styles';
import { generateSupport, planSupport } from './support';
import { addRolls } from './rolls';
import { addToms } from './toms';
import { bakeV1 } from './v1/generate';
import { V1_STYLES, type V1Style } from './v1/styles';
import { CATEGORIES, clamp, LAYERS, MAX_BARS, MAX_ROLL, MIN_BARS, MIN_ROLL, MUTATION_STYLES, RECIPE_KEYS, ROLL_DYNAMICS, ROLL_PLACES, ROLL_SPEEDS, ROLL_TARGETS, type BarRole, type Bars, type Break, type BreakEvent, type Engine, type Hit, type Layer, type Mutation, type MutationOptions, type Recipe, type RollTarget, type Seeds } from './types';

/** Recipe values made safe (clamped, known style and engine, whole bars 1–8). */
export function sanitiseRecipe(r: Recipe): Recipe {
  const def = STYLE_DEFS[r.style] ?? STYLE_DEFS.funk;
  const bars = clamp(Math.round(Number(r.bars) || 2), MIN_BARS, MAX_BARS) as Bars;
  // a recipe without an engine predates engine 2: it was baked by engine 1
  let engine: Engine = r.engine === 1 || r.engine === undefined || r.engine === null ? 1 : 2;
  if (engine === 1 && !V1_STYLES.includes(def.style as V1Style)) engine = 2; // engine 1 only knows the original four
  const out: Recipe = { ...r, style: def.style, engine, bpm: clamp(Math.round(Number(r.bpm) || def.bpm[2]), 40, 220), bars };
  for (const k of RECIPE_KEYS) out[k] = clamp(Number(r[k]) || 0, 0, 1);
  // the roll settings (recipes saved before ROLLS existed take the style's; ROLLS itself is then 0)
  const fl = FLOURISH[def.style].defaults;
  out.rollLength = Number.isFinite(Number(r.rollLength)) && r.rollLength !== null ? clamp(Math.round(Number(r.rollLength)), MIN_ROLL, MAX_ROLL) : fl.rollLength;
  out.rollSpeed = (ROLL_SPEEDS as readonly string[]).includes(String(r.rollSpeed)) ? r.rollSpeed : fl.rollSpeed;
  out.rollDynamics = (ROLL_DYNAMICS as readonly string[]).includes(String(r.rollDynamics)) ? r.rollDynamics : fl.rollDynamics;
  out.rollPlace = (ROLL_PLACES as readonly string[]).includes(String(r.rollPlace)) ? r.rollPlace : fl.rollPlace;
  out.rollTargets = Array.isArray(r.rollTargets) ? ROLL_TARGETS.filter((t) => (r.rollTargets as unknown[]).includes(t)) : [...fl.rollTargets];
  if (r.rollsOn === false) out.rollsOn = false;
  else delete out.rollsOn;
  return out;
}

/** The roll targets toggled (kept in the canonical order). */
export const toggleTarget = (ts: readonly RollTarget[], t: RollTarget): RollTarget[] => ROLL_TARGETS.filter((x) => (x === t ? !ts.includes(t) : ts.includes(x)));

function bakeV2(recipe: Recipe, seeds: Seeds): Omit<Break, 'recipe' | 'seeds'> {
  const def = STYLE_DEFS[recipe.style];
  const plan = planSupport(def, recipe, stream(seeds.detail, 'plan'));
  const foundation = generateFoundation(def, recipe, stream(seeds.beat, 'foundation'));
  const support = generateSupport(def, recipe, plan, foundation.hits, foundation.backbeats, stream(seeds.detail, 'support'));
  const groove = tidy([...foundation.hits, ...support]);
  const roles = planBars(recipe.bars, def);
  const crashAtTop = stream(seeds.beat, 'crash').chance(def.crashP * (0.4 + recipe.fills));
  // MUTATE: each mutation varies the groove cell, and the phrase is developed from it (from the same
  // streams, so the bars stay related). A mutation with a RANGE reaches only some bars, so each bar
  // follows its own line of mutations; one limited to SELECTED TRACKS changes only those tracks of
  // its bars (the other tracks stay as the phrase before it had them). Plain mutations: as always.
  const muts = seeds.mut ?? [];
  const reach = muts.map((m) => mutationBars(m, roles));
  const cells = new Map<string, Hit[]>([['', groove]]);
  const phrases = new Map<string, Hit[][]>();
  const develop = (key: string): Hit[][] => {
    let ph = phrases.get(key);
    if (!ph) {
      const ctx = { def, recipe, timekeeper: plan.timekeeper, sixteenths: plan.sixteenths, beatRng: stream(seeds.beat, 'phrase'), detailRng: stream(seeds.detail, 'phrase'), crashAtTop };
      ph = developPhrase(cells.get(key)!, roles, ctx);
      phrases.set(key, ph);
    }
    return ph;
  };
  const bars = roles.map((_, i) => {
    let key = '';
    /** the bar as a SELECTED TRACKS mutation left it (null: as developed from the cell) */
    let kept: Hit[] | null = null;
    muts.forEach((m, k) => {
      if (!reach[k]![i]) return;
      const prev = key;
      key += `${k},`;
      if (!cells.has(key)) cells.set(key, mutateCell(cells.get(prev)!, def, recipe, stream(m.seed, 'mutate'), m.beat, m.detail, plan.timekeeper, m));
      if (!m.cats) kept = null;
      else {
        const only = new Set(m.cats);
        const before: Hit[] = kept ?? develop(prev)[i]!;
        kept = tidy([...develop(key)[i]!.filter((h) => only.has(h.cat)), ...before.filter((h) => !only.has(h.cat))]);
      }
    });
    return kept ?? develop(key)[i]!;
  });

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

/**
 * TOMS and ROLLS (engine 2): layers over the performed break, from their own streams, so the rest of
 * the break (every other hit's velocity, timing and AUTO sample) is the same whatever they do.
 * FREEZE BEAT keeps them (what they play comes from the beat seed), FREEZE FEEL how they play it.
 */
function flourish(core: Omit<Break, 'recipe' | 'seeds'>, recipe: Recipe, seeds: Seeds): BreakEvent[] {
  const ctx = { def: STYLE_DEFS[recipe.style], fl: FLOURISH[recipe.style], recipe, feel: core.feel, roles: core.plan };
  const withToms = addToms(core.events, ctx, stream(seeds.beat, 'toms'), stream(seeds.feel, 'toms'));
  if (recipe.rollsOn === false) return withToms;
  return addRolls(withToms, { ...ctx, timekeeper: core.timekeeper }, stream(seeds.beat, 'rolls'), stream(seeds.feel, 'rolls'));
}

/**
 * BAKE a break. `edits` (the user's hand edits, edits.ts) are applied to the generated events
 * after the AUTO sample choice and before the PICK modes, so the generator and the AUTO choice
 * are untouched by them, and playback, export, stems, MIDI and the pattern view all use the
 * edited events.
 */
export function bake(recipeIn: Recipe, seeds: Seeds, kit: KitIndex = emptyKit(), samples: SampleContext = {}, names: (id: string) => string = (id) => id, edits?: Edits | null): Break {
  const recipe = sanitiseRecipe(recipeIn);
  const core = recipe.engine === 1 ? bakeV1(recipe, seeds) : bakeV2(recipe, seeds);
  const main = autoSamples(core.events, kit, seeds.kit, samples);
  const layered = recipe.engine === 2 ? flourish(core, recipe, seeds) : core.events;
  const { events, report } = applyEdits(layered, edits, recipe);
  finishSamples(events, kit, seeds.kit, samples, names, main);
  const ed = hasEdits(edits) ? { edits: JSON.parse(JSON.stringify(edits)) as Edits, editReport: report } : {};
  return { recipe, seeds: { ...seeds, ...(seeds.mut ? { mut: seeds.mut.map((m) => ({ ...m })) } : {}) }, ...core, events, ...ed };
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

/** A new mutation of the current break, varying the layers that are not frozen (with MUTATE's options, if any). */
export function mutate(current: Seeds, frozen: Partial<Record<Layer, boolean>>, seed = freshSeed(), opts?: MutationOptions): Seeds | null {
  const m: Mutation = { seed: hashString(`mut:${seed}:${current.mut?.length ?? 0}`), beat: !frozen.beat, detail: !frozen.detail, ...(opts?.style ? sanitiseMutationOptions(opts) : {}) };
  if (!m.beat && !m.detail) return null;
  return { ...current, mut: [...(current.mut ?? []).map((x) => ({ ...x })), m] };
}

/** MUTATE options made safe (a known style, depth and range 0..1, known tracks). */
export function sanitiseMutationOptions(o: MutationOptions): MutationOptions {
  if (!o || !(MUTATION_STYLES as readonly string[]).includes(String(o.style))) return {};
  const out: MutationOptions = { style: o.style, depth: clamp(Number(o.depth ?? 0.5) || 0, 0, 1), range: clamp(Number(o.range ?? 1) || 0, 0, 1) };
  if (Array.isArray(o.cats)) out.cats = CATEGORIES.filter((c) => o.cats!.includes(c));
  return out;
}

/** A stored mutation made safe (options kept only when valid). */
export const sanitiseMutation = (m: Mutation): Mutation => ({ seed: m.seed >>> 0, beat: !!m.beat, detail: !!m.detail, ...sanitiseMutationOptions(m) });

/** Which bars a mutation reaches: the last part of the phrase (RANGE), or the fill bars (FILLS style). Full range = every bar. */
export function mutationBars(m: MutationOptions, roles: BarRole[]): boolean[] {
  const n = roles.length;
  if (m.style === 'fills') {
    const fills = roles.map((r) => r === 'F' || r === 'T');
    return fills.some(Boolean) ? fills : roles.map((_, i) => i === n - 1);
  }
  const count = m.range === undefined ? n : Math.max(1, Math.ceil(clamp(m.range, 0, 1) * n));
  return roles.map((_, i) => i >= n - count);
}
