/**
 * BAKE: GENERATION (GROOVE), then TRANSFORMATION (CHOP, ROLLS from revision 6), then the hand edits.
 *
 *   GROOVE   phrase plan  ->  foundation (kick, snare)  ->  supporting voices  ->  [mutations]
 *            ->  phrase development (answer, development, chops, fills)
 *            ->  performance (velocity, swing, microtiming)  ->  AUTO samples  ->  TOMS, ROLLS
 *   CHOP     transform.ts: fragments of the GROOVE rearranged (chopper.ts), from the GROOVE every time
 *   ROLLS    revision 6: retriggers leading into eligible hits of the chopped groove (rollLayer.ts)
 *   EDITS    the hand-edit layer (edits.ts)  ->  PICK modes and hand-chosen samples
 *
 * Deterministic: the same recipe (including its ENGINE), seeds, kit and sample settings give the
 * same break. Streams per layer:
 *   beat    foundation, kick/snare variation, chops, fills, crash placement
 *   detail  timekeeper plan, ghosts, lifts, percussion, their variation
 *   feel    performance
 *   kit     sample selection
 *   mut     MUTATE: each mutation seed varies the groove cell (engine 2)
 *
 * GROOVE is engine 2. Engine 1 (v1/) is the first release's generator, kept internally (LEGACY)
 * so breaks saved with it reproduce exactly; nothing new is baked with it.
 */
import { generateFoundation } from './foundation';
import { emptyKit, type KitIndex } from './kit';
import { perform } from './performance';
import { developPhrase, mutateCell, planBars, tidy } from './phrase';
import { chooseForm, chooseGroove, chooseMotif, GROOVE_DEFS, type GrooveId } from './approaches';
import { addCymbals, hatActivity, mutateCymbals, rideActivity, type FillMark } from './cymbals';
import { addCymbals4, cymSettings, sanitiseCym, type CymbalReport } from './cymbals4';
import { blendGrammar, grammarCymbals } from './dnaGrammar';
import { freshSeed, hashString, stream } from './rng';
import { applyEdits, hasEdits, type Edits } from './edits';
import { autoSamples, finishSamples, type SampleContext } from './samples';
import { FLOURISH, STYLE_DEFS } from './styles';
import { generateSupport, planSupport } from './support';
import { addRolls } from './rolls';
import { addTomPhrases, addToms, tomVoices } from './toms';
import { sanitiseChop } from './chopper';
import { transform } from './transform';
import { usesRollLayer } from './rollLayer';
import { sanitiseRollExpr } from './rollExpr';
import { personaBars, personaPerform, personaRecipe, sanitisePersonality } from './personality';
import { dnaActive, dnaBars, sanitiseDna } from './dna';
import { sanitiseDestroy } from './destroy';
import { destroy2, sanitiseDestroy2 } from './destroy2';
import { applyRegen, sanitiseRegen } from './regen';
import { bakeV1 } from './v1/generate';
import { V1_STYLES, type V1Style } from './v1/styles';
import { addClapFx, usesClapFx } from './clapfx';
import { CATEGORIES, clamp, CLAPFX_REVISION, CURRENT_REVISION, CYMBAL_MODES, CYMBAL_REVISION, LAYERS, ROLLS_REVISION, VOCAB_REVISION, MAX_BARS, MAX_ROLL, MIN_BARS, MIN_ROLL, MUTATION_STYLES, RECIPE_KEYS, ROLL_DYNAMICS, ROLL_PLACES, ROLL_SPEEDS, ROLL_TARGETS, type BarRole, type Bars, type Break, type BreakEvent, type Engine, type Hit, type Layer, type Mutation, type MutationOptions, type Recipe, type RollTarget, type Seeds, type Approach } from './types';

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
  // RE-ROLL's take (revision 6 rolls; absent = 0)
  const take = Number(r.rollTake);
  if (Number.isFinite(take) && take > 0) out.rollTake = Math.min(Math.floor(take), 999999);
  else delete out.rollTake;
  // the GROOVE revision (engine 2 only; absent = 0, as every recipe saved before revisions)
  const rev = engine === 2 ? clamp(Math.floor(Number(r.revision) || 0), 0, CURRENT_REVISION) : 0;
  if (rev) out.revision = rev;
  else delete out.revision;
  // an older engine 2 break whose rolls became the transformation (implied from revision 6 on)
  if (r.rollLayer === true && engine === 2 && rev < ROLLS_REVISION) out.rollLayer = true;
  else delete out.rollLayer;
  // the new JUNGLE phrase belongs to engine 2's JUNGLE only; anything else (or anything saved before it) keeps the old
  if (r.jungleCuts === true && def.style === 'jungle' && engine === 2) out.jungleCuts = true;
  else delete out.jungleCuts;
  const chop = sanitiseChop(r.chop);
  if (chop) out.chop = chop;
  else delete out.chop;
  // Phase 12: absent unless set, so every recipe saved before them bakes exactly as it did
  const opt = <K extends 'rollExpr' | 'personality' | 'dna' | 'destroy' | 'destroy2'>(k: K, v: Recipe[K] | undefined) => {
    if (v) out[k] = v;
    else delete out[k];
  };
  opt('rollExpr', sanitiseRollExpr(r.rollExpr));
  opt('personality', sanitisePersonality(r.personality));
  opt('dna', sanitiseDna(r.dna));
  opt('destroy', sanitiseDestroy(r.destroy));
  // Phase 14: DESTROY (any revision: it works on the finished pattern)
  opt('destroy2', sanitiseDestroy2(r.destroy2));
  // Phase 13 (revision 3): HI-HAT ACTIVITY, RIDE ACTIVITY (absent = the recipe's default) and the RELATIONSHIP (absent = ALTERNATE)
  const unit = (x: unknown) => (x !== undefined && x !== null && Number.isFinite(Number(x)) ? clamp(Number(x), 0, 1) : undefined);
  const hats = rev >= VOCAB_REVISION ? unit(r.hats) : undefined;
  const ride = rev >= VOCAB_REVISION ? unit(r.ride) : undefined;
  if (hats !== undefined) out.hats = hats;
  else delete out.hats;
  if (ride !== undefined) out.ride = ride;
  else delete out.ride;
  if (rev >= VOCAB_REVISION && r.cymbals !== 'alternate' && (CYMBAL_MODES as readonly string[]).includes(String(r.cymbals))) out.cymbals = r.cymbals;
  else delete out.cymbals;
  // Phase 15 (revision 5): CLAP ACTIVITY and FX ACTIVITY (absent = the recipe's default)
  const clapA = rev >= CLAPFX_REVISION ? unit(r.clap) : undefined;
  const fxA = rev >= CLAPFX_REVISION ? unit(r.fx) : undefined;
  if (clapA !== undefined) out.clap = clapA;
  else delete out.clap;
  if (fxA !== undefined) out.fx = fxA;
  else delete out.fx;
  // Phase 14 (revision 4): the cymbal engine's settings replace revision 3's (absent = the recipe's defaults)
  if (rev >= CYMBAL_REVISION) {
    delete out.hats;
    delete out.ride;
    delete out.cymbals;
    const cym = sanitiseCym(r.cym, def.style);
    if (cym) out.cym = cym;
    else delete out.cym;
  } else delete out.cym;
  return out;
}

/** Does this recipe use the Phase 14 BREAK DNA grammar and cymbal engine (revision 4)? */
export const usesCym4 = (r: Recipe): boolean => r.engine === 2 && (r.revision ?? 0) >= CYMBAL_REVISION;

/** The cymbal categories the revision 4 engine owns. */
const CYMBAL_CATS = new Set(['hat', 'open', 'ride', 'crash']);

/** Does this recipe use the Phase 13 rhythmic vocabulary (revision 3)? */
export const usesVocab = (r: Recipe): boolean => r.engine === 2 && (r.revision ?? 0) >= VOCAB_REVISION;

/**
 * SHUFFLE (revision 3): the off-beat kicks, ghosts, percussion and extra snares move to the
 * eighth-note triplet grid: the "e" to the second partial of the beat, the "and" and the "a" to
 * the third. The backbeats, fills and rolls stay where they are.
 */
function onTriplets(hits: Hit[]): Hit[] {
  return tidy(
    hits.map((h) => {
      const r = h.step % 4;
      if (h.sub !== 0 || r === 0 || !(h.cat === 'kick' || h.cat === 'ghost' || h.cat === 'perc' || (h.cat === 'snare' && h.role === 'extra snare'))) return h;
      if (h.role === 'fill' || h.role === 'roll' || h.role === 'drag') return h;
      return r === 1 ? { ...h, sub: 4, why: `${h.why} (on the triplet grid: a shuffle)` } : { ...h, step: h.step - r + 2, sub: 8, why: `${h.why} (on the triplet grid: a shuffle)` };
    }),
  );
}

/** Stored seeds made safe (mutations and track regenerations kept only when valid). */
export function sanitiseSeeds(s: Seeds): Seeds {
  const regen = sanitiseRegen(s.regen);
  const mut = Array.isArray(s.mut) ? s.mut.filter((m) => m && Number.isFinite(m.seed)).map(sanitiseMutation) : [];
  return { beat: s.beat >>> 0, detail: s.detail >>> 0, feel: s.feel >>> 0, kit: s.kit >>> 0, ...(mut.length ? { mut } : {}), ...(regen ? { regen } : {}) };
}

/** The roll targets toggled (kept in the canonical order). */
export const toggleTarget = (ts: readonly RollTarget[], t: RollTarget): RollTarget[] => ROLL_TARGETS.filter((x) => (x === t ? !ts.includes(t) : ts.includes(x)));

function bakeV2(recipe: Recipe, seeds: Seeds): Omit<Break, 'recipe' | 'seeds'> {
  // revision 3: a groove approach within the recipe shapes its foundation strategy (approaches.ts)
  const v3 = usesVocab(recipe);
  let def = STYLE_DEFS[recipe.style];
  let grooveId: GrooveId = 'backbeat';
  let note: string | undefined;
  if (v3) {
    const ar = stream(seeds.beat, 'approach');
    grooveId = chooseGroove(def, recipe, ar);
    const shaped = GROOVE_DEFS[grooveId].shape(def, ar);
    def = shaped.def;
    note = shaped.note;
  }
  const plan = planSupport(def, recipe, stream(seeds.detail, 'plan'));
  const foundation = generateFoundation(def, recipe, stream(seeds.beat, 'foundation'), v3);
  const support = generateSupport(def, recipe, plan, foundation.hits, foundation.backbeats, stream(seeds.detail, 'support'), v3);
  const groove = tidy([...foundation.hits, ...support]);
  const roles = v3 ? chooseForm(recipe.bars, def, recipe, stream(seeds.beat, 'form')) : planBars(recipe.bars, def);
  const motif = v3 ? chooseMotif(def, grooveId, stream(seeds.beat, 'motif')) : undefined;
  const crashAtTop = stream(seeds.beat, 'crash').chance(def.crashP * (0.4 + recipe.fills));
  // MUTATE: each mutation varies the groove cell, and the phrase is developed from it (from the same
  // streams, so the bars stay related). A mutation with a RANGE reaches only some bars, so each bar
  // follows its own line of mutations; one limited to SELECTED TRACKS changes only those tracks of
  // its bars (the other tracks stay as the phrase before it had them). Plain mutations: as always.
  const muts = seeds.mut ?? [];
  const reach = muts.map((m) => mutationBars(m, roles));
  const cells = new Map<string, Hit[]>([['', groove]]);
  const phrases = new Map<string, Hit[][]>();
  const marksOf = new Map<string, (FillMark | null)[]>();
  const develop = (key: string): Hit[][] => {
    let ph = phrases.get(key);
    if (!ph) {
      const marks: (FillMark | null)[] = roles.map(() => null);
      const ctx = { def, recipe, timekeeper: plan.timekeeper, sixteenths: v3 || plan.sixteenths, beatRng: stream(seeds.beat, 'phrase'), detailRng: stream(seeds.detail, 'phrase'), crashAtTop, ...(v3 ? { vocab: { motif: motif!, marks } } : {}) };
      ph = developPhrase(cells.get(key)!, roles, ctx);
      phrases.set(key, ph);
      marksOf.set(key, marks);
    }
    return ph;
  };
  const barMarks: (FillMark | null)[] = roles.map(() => null);
  const bars = roles.map((_, i) => {
    let key = '';
    /** the bar as a SELECTED TRACKS mutation left it (null: as developed from the cell) */
    let kept: Hit[] | null = null;
    muts.forEach((m, k) => {
      if (!reach[k]![i]) return;
      const prev = key;
      key += `${k},`;
      if (!cells.has(key)) cells.set(key, mutateCell(cells.get(prev)!, def, recipe, stream(m.seed, 'mutate'), m.beat, m.detail, plan.timekeeper, m, !v3));
      if (!m.cats) kept = null;
      else {
        const only = new Set(m.cats);
        const before: Hit[] = kept ?? develop(prev)[i]!;
        kept = tidy([...develop(key)[i]!.filter((h) => only.has(h.cat)), ...before.filter((h) => !only.has(h.cat))]);
      }
    });
    const bar = kept ?? develop(key)[i]!;
    develop(key);
    barMarks[i] = marksOf.get(key)![i] ?? null;
    return bar;
  });

  // revision 3: a shuffle moves the off-beats to the triplet grid, then the cymbals are generated per bar (cymbals.ts)
  let timekeeper = plan.timekeeper;
  let approach: Approach | undefined;
  let cymReport: CymbalReport | undefined;
  const v4 = usesCym4(recipe);
  if (v4) {
    // revision 4: the BREAK DNA builds into the kick, snare, ghost and percussion first, then the cymbal engine hears it
    const dna = dnaActive(recipe.dna) ? recipe.dna : null;
    const prep = (bs: Hit[][]): Hit[][] => {
      let out = bs.map((b) => (GROOVE_DEFS[grooveId].triplet ? onTriplets(b) : b).filter((h) => !CYMBAL_CATS.has(h.cat)));
      if (dna) out = blendGrammar(out, roles, dna.id, dna.amount, { beatSeed: seeds.beat, halftime: def.backbeat === 'three', recipe }).map(tidy);
      return out;
    };
    const built = prep(bars);
    // a bar reached only by SELECTED TRACKS mutations: its cymbals follow the phrase as it was before them
    const limited = roles.map((_, i) => {
      const ms = muts.filter((_m, k) => reach[k]![i]);
      return ms.length > 0 && ms.every((m) => m.cats);
    });
    const context = limited.some(Boolean) ? prep(develop('')).map((b, i) => (limited[i] ? b : built[i]!)) : undefined;
    const mutations = roles.map((_, i) => muts.filter((m, k) => reach[k]![i] && m.detail));
    const cy = addCymbals4(built, { def, recipe, groove: grooveId, roles, marks: barMarks, cycle: plan.cycle, mutations, detailSeed: seeds.detail, mutate: mutateCymbals, ...(context ? { context } : {}), ...(dna ? { dna: grammarCymbals(dna.id, dna.amount, roles) } : {}) });
    // then the PERSONALITY plays the phrase its way; a cymbal family at 100% keeps every stroke whatever it did
    const shaped = personaBars(cy.bars.map(tidy), roles, recipe, recipe.personality, seeds.beat).map((b, i) => {
      const add = cy.full[i]!.filter((h) => !b.some((x) => x.cat === h.cat && x.step === h.step && x.sub === h.sub));
      return add.length ? tidy([...b, ...add]) : b;
    });
    bars.splice(0, bars.length, ...shaped);
    timekeeper = cy.timekeeper;
    cymReport = cy.report;
    approach = { groove: `${GROOVE_DEFS[grooveId].label}${note ? ` ${note}` : ''}`, form: roles.join(' '), motif: motif!, hats: cy.hats, ride: cy.ride, development: cy.development };
  } else {
    if (v3) {
      if (GROOVE_DEFS[grooveId].triplet) bars.splice(0, bars.length, ...bars.map(onTriplets));
      const mutations = roles.map((_, i) => muts.filter((m, k) => reach[k]![i] && m.detail));
      const cy = addCymbals(bars, { def, recipe, groove: grooveId, roles, marks: barMarks, cycle: plan.cycle, mutations }, stream(seeds.detail, 'cymbals'));
      bars.splice(0, bars.length, ...cy.bars.map(tidy));
      timekeeper = cy.timekeeper;
      approach = { groove: `${GROOVE_DEFS[grooveId].label}${note ? ` ${note}` : ''}`, form: roles.join(' '), motif: motif!, hats: cy.hats, ride: cy.ride, development: cy.development };
    }

    // BREAK DNA builds with its vocabulary, then the PERSONALITY plays the phrase its way (both off: the bars as they are)
    const shaped = personaBars(dnaBars(bars, roles, recipe.dna, { beatSeed: seeds.beat, halftime: def.backbeat === 'three' }), roles, recipe, recipe.personality, seeds.beat);
    bars.splice(0, bars.length, ...shaped);

    const crash = (i: number, why: string) => {
      bars[i] = tidy([...bars[i]!.filter((h) => !((h.cat === 'hat' || h.cat === 'ride' || h.cat === 'open') && h.step === 0)), { cat: 'crash', step: 0, sub: 0, level: 0.85, role: 'crash', why }]);
    };
    if (crashAtTop) {
      crash(0, 'crash at the top of the phrase');
      // a new section after a half-way fill starts with a crash too
      roles.forEach((r, i) => r === 'F' && i + 1 < roles.length && crash(i + 1, 'crash: a new four-bar section after the half-way fill'));
    }
  }

  const { events, feel } = perform(bars, roles, def, recipe, stream(seeds.feel, 'performance'), plan.cycle);
  return { plan: roles, feel, timekeeper, events, ...(approach ? { approach } : {}), ...(cymReport ? { cymReport } : {}) };
}

/** Does this recipe hold back every new roll (ROLL GENERATION off, revision 1 on)? Before revision 1 it held back only the ROLLS layer. */
export const holdsRolls = (r: Recipe): boolean => r.rollsOn === false && (r.revision ?? 0) >= 1;

/**
 * ROLL GENERATION off (revision 1): the GROOVE's own rolls (a fill's roll, a JUNGLE retrigger
 * burst, a BREAKCORE stutter) are played as plain fills: their strokes on the sixteenth grid stay,
 * as fill hits, and the faster strokes between them go. The rhythm of the fill is kept; nothing
 * is retriggered. Runs after the AUTO sample choice and the toms, so no other hit's sample, and
 * no tom, changes.
 */
export function plainFills(events: BreakEvent[]): BreakEvent[] {
  return events
    .filter((e) => e.role !== 'roll' || e.sub === 0)
    .map((e) => (e.role === 'roll' ? { ...e, role: 'fill' as const, why: `${e.why.replace(/ \(32nd retrigger\)$/, '')} (played as a plain fill: ROLL GENERATION is off)` } : e));
}

/**
 * TOMS and ROLLS (engine 2): layers over the performed break, from their own streams, so the rest of
 * the break (every other hit's velocity, timing and AUTO sample) is the same whatever they do.
 * FREEZE BEAT keeps them (what they play comes from the beat seed), FREEZE FEEL how they play it.
 * The toms come first and never depend on ROLLS: from revision 1 they are phrases over the whole
 * pattern (addTomPhrases), voiced on the toms the kit has; before it, fills in the fill bars.
 */
function flourish(core: Omit<Break, 'recipe' | 'seeds'>, recipe: Recipe, seeds: Seeds, kit: KitIndex): BreakEvent[] {
  // revision 3: a cymbal family at 0% does not roll either
  const off = usesVocab(recipe) && (core.timekeeper === 'ride' ? rideActivity(recipe) : hatActivity(recipe)) <= 0;
  if (off) recipe = { ...recipe, rollTargets: recipe.rollTargets.filter((t) => t !== 'hat') };
  const ctx = { def: STYLE_DEFS[recipe.style], fl: FLOURISH[recipe.style], recipe, feel: core.feel, roles: core.plan };
  const withToms = (recipe.revision ?? 0) >= 1 ? addTomPhrases(core.events, ctx, stream(seeds.beat, 'tom-phrases'), stream(seeds.feel, 'toms'), tomVoices(kit)) : addToms(core.events, ctx, stream(seeds.beat, 'toms'), stream(seeds.feel, 'toms'));
  // revision 6: ROLLS is a transformation after CHOP (rollLayer.ts), not part of the GROOVE
  if (recipe.rollsOn === false || usesRollLayer(recipe)) return withToms;
  return addRolls(withToms, { ...ctx, timekeeper: core.timekeeper }, stream(seeds.beat, 'rolls'), stream(seeds.feel, 'rolls'));
}

/**
 * GROOVE: generation. The recipe-driven break (engine 2, or the legacy engine 1 for breaks saved
 * with it), with its AUTO sample choice and (engine 2) its toms and rolls. Exactly what BAKE made
 * before CHOP existed.
 */
export function groove(recipeIn: Recipe, seeds: Seeds, kit: KitIndex = emptyKit(), samples: SampleContext = {}): { core: Omit<Break, 'recipe' | 'seeds'>; events: BreakEvent[]; main: ReturnType<typeof autoSamples> } {
  // the PERSONALITY's composition: the recipe the GROOVE is generated from (engine 2; NEUTRAL: the recipe itself)
  const recipe = recipeIn.engine === 2 ? personaRecipe(recipeIn, recipeIn.personality) : recipeIn;
  const core = recipe.engine === 1 ? bakeV1(recipe, seeds) : bakeV2(recipe, seeds);
  const main = autoSamples(core.events, kit, seeds.kit, samples);
  const flourished = recipe.engine === 2 ? flourish(core, recipe, seeds, kit) : core.events;
  // the toms are the same whatever ROLL GENERATION is: the GROOVE's rolls become plain fills after them
  const plain = holdsRolls(recipe) ? plainFills(flourished) : flourished;
  // revision 5: the CLAP and FX layers, after the toms and rolls (never rolled themselves), from their own streams
  const played = usesClapFx(recipe) ? addClapFx(plain, { def: STYLE_DEFS[recipe.style], recipe, feel: core.feel, roles: core.plan, reach: (seeds.mut ?? []).map((m) => mutationBars(m, core.plan)) }, seeds) : plain;
  // revision 3: HI-HAT ACTIVITY or RIDE ACTIVITY at 0% means none of that family, whatever a later layer added
  let events = usesVocab(recipe) ? silence(played, recipe) : played;
  // revision 4: a family at 100% keeps every stroke (a tom phrase or a roll may have taken some), and OPEN-HAT CHOKE off frees the closed hats
  if (usesCym4(recipe)) events = keepFull(events, core.events, recipe);
  return { core, events, main };
}

/** Revision 4: the strokes of a cymbal family at 100% that a later layer removed, put back; with OPEN-HAT CHOKE off, the closed hats marked `free`. */
function keepFull(events: BreakEvent[], performed: BreakEvent[], recipe: Recipe): BreakEvent[] {
  const cs = cymSettings(recipe);
  const full = new Set<string>([...(cs.closed >= 1 ? ['hat'] : []), ...(cs.ride >= 1 ? ['ride'] : []), ...(cs.open >= 1 ? ['open'] : [])]);
  let out = events;
  if (full.size) {
    const at = new Set(events.map((e) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`));
    const back = performed.filter((e) => full.has(e.cat) && !at.has(`${e.cat}|${e.bar}|${e.step}|${e.sub}`));
    if (back.length) out = [...events, ...back.map((e) => ({ ...e }))].sort((a, b) => a.bar - b.bar || a.step - b.step || a.sub - b.sub);
  }
  if (!cs.choke) out = out.map((e) => (e.cat === 'hat' ? { ...e, free: true as const } : e));
  return out;
}

/** The generated events without the cymbal families whose activity is 0 (revision 3; revision 4 per family, the crash included). */
export function silence(events: BreakEvent[], recipe: Recipe): BreakEvent[] {
  if (usesCym4(recipe)) {
    const cs = cymSettings(recipe);
    const off = new Set<string>([...(cs.closed <= 0 ? ['hat'] : []), ...(cs.open <= 0 ? ['open'] : []), ...(cs.ride <= 0 ? ['ride'] : []), ...(cs.crash <= 0 ? ['crash'] : [])]);
    return off.size ? events.filter((e) => !off.has(e.cat)) : events;
  }
  const noHats = hatActivity(recipe) <= 0;
  const noRide = rideActivity(recipe) <= 0;
  if (!noHats && !noRide) return events;
  return events.filter((e) => !((noHats && (e.cat === 'hat' || e.cat === 'open')) || (noRide && e.cat === 'ride')));
}

/**
 * BAKE a break: GROOVE, then the transformations (CHOP), then the hand edits. The transformations
 * always start from the GROOVE baked from the seeds (never from an earlier result), so changing
 * CHOP is heard on the same break, and CHOP at 0 is the GROOVE exactly. `edits` (the user's hand
 * edits, edits.ts) are applied after the AUTO sample choice and the transformations and before the
 * PICK modes, so the generator and the AUTO choice are untouched by them, and playback, export,
 * stems, MIDI and the pattern view all use the edited events.
 */
export function bake(recipeIn: Recipe, seeds: Seeds, kit: KitIndex = emptyKit(), samples: SampleContext = {}, names: (id: string) => string = (id) => id, edits?: Edits | null): Break {
  const recipe = sanitiseRecipe(recipeIn);
  const core = (s: Seeds) => {
    const g = groove(recipe, s, kit, samples);
    return { g, t: transform(g.events, { recipe, seeds: s, plan: g.core.plan }) };
  };
  const { g, t } = core(seeds);
  // REGEN TRACK: the selected tracks from the best of their candidates, every other track exactly as it was
  const rg = applyRegen(t.events, seeds, g.core.plan, (s) => core(s).t.events);
  // the PERSONALITY's performance (and DILLA's timing), keyed by position: before the hand edits, so a TIME set by hand wins
  const performed = personaPerform(rg.events, recipe.personality, { plan: g.core.plan, feelSeed: seeds.feel, bpm: recipe.bpm, swing: recipe.swing, busyFrom: t.events });
  const { events, report } = applyEdits(performed, edits, recipe);
  finishSamples(events, kit, seeds.kit, samples, names, g.main);
  // DESTROY (Phase 14): on the finished pattern, hand edits and samples included; hand-edited hits are never touched
  const d2 = destroy2(events, recipe.destroy2, { seed: seeds.beat, bars: recipe.bars });
  const ed = hasEdits(edits) ? { edits: JSON.parse(JSON.stringify(edits)) as Edits, editReport: report } : {};
  const copy: Seeds = { ...seeds, ...(seeds.mut ? { mut: seeds.mut.map((m) => ({ ...m })) } : {}), ...(seeds.regen ? { regen: seeds.regen.map((x) => ({ cats: [...x.cats], n: x.n })) } : {}) };
  return { recipe, seeds: copy, ...g.core, events: d2.events, ...ed, ...(d2.report ? { destroy2: d2.report } : {}), ...(t.chop ? { chop: t.chop } : {}), ...(t.rolls ? { rollReport: t.rolls } : {}), ...(t.destroy ? { destroy: t.destroy } : {}), ...(rg.report ? { regen: rg.report } : {}) };
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
  // track regenerations belong to the beat they were made on, as mutations do
  if (frozen.beat && frozen.detail && current.regen?.length) next.regen = current.regen.map((x) => ({ cats: [...x.cats], n: x.n }));
  return next;
}

// ------------------------------------------------------------------ named seeds

/** The largest seed typed as a number (larger numbers, and anything else, are hashed as text). */
export const MAX_NUMERIC_SEED = 999999999;

/**
 * Normalise a seed's text for hashing: Unicode NFC, trimmed, lower case, runs of whitespace as one
 * space. So "Velvet  Thunder" and "velvet thunder" are the same seed (case and spacing never
 * matter); hyphens, digits, accents and every other character do ("VELVET-THUNDER" is not
 * "VELVET THUNDER"). Unchanged since named seeds were introduced, so every saved name reproduces.
 */
export function normaliseSeedName(text: string): string {
  return text.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 32-bit FNV-1a over the normalised name's UTF-8 bytes: stable across browsers, platforms and versions. */
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
 * A seed from what was typed: a whole number of up to nine digits is that seed (so every numeric
 * seed ever saved or shared still works exactly); any other text is a NAMED seed, hashed (any
 * language, emoji included). The name keeps the case it was typed in, for display.
 */
export function parseSeed(text: string): { seed: number; name: string | null } | null {
  const t = normaliseSeedName(text);
  if (!t) return null;
  if (/^\d+$/.test(t) && Number(t) <= MAX_NUMERIC_SEED) return { seed: Number(t), name: null };
  return { seed: hashSeedName(t), name: text.normalize('NFC').trim().replace(/\s+/g, ' ') };
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
