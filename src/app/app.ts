/**
 * The Breakery's state and actions, independent of the interface: the recipe, the seeds (and
 * their name), what is frozen, the current break, the batch of candidates, seed history and
 * favourites, sample-selection settings and solo/mute. Changing the recipe re-bakes the SAME seeds,
 * so each control's effect is heard on the same break; BAKE draws new seeds for every layer that
 * is not frozen; MUTATE varies the current groove a little.
 */
import { addHit, deleteHit, describeEdits, fmtPitch, hitKey, duplicateHit, editCount, findRef, hasEdits, moveHit, noEdits, posLabel, posOf, ratchetHit, RATCHET_SPAN_LABEL, refLabel, revertHit, sanitiseEdits, setPitch, setReverse, setSample, setTiming, setVelocity, upgradeEdits, type EditResult, type Edits } from '../engine/edits';
import { defaultRollExpr, describeExpr, diceExpr, presetExpr, sanitiseRollExpr, type RollExpression, type RollPreset } from '../engine/rollExpr';
import { defaultDestroy, describeDestroy, sanitiseDestroy, type DestroySettings } from '../engine/destroy';
import { describePersonality, PERSONALITY_LABEL, sanitisePersonality, type PersonalitySetting } from '../engine/personality';
import { describeDna, DNA_IDS, DNA_LABEL, sanitiseDna, type DnaSetting } from '../engine/dna';
import { chaosDestroy, defaultDestroy2, describeDestroy2, sanitiseDestroy2, type DestroyEffect, type DestroySettings2 } from '../engine/destroy2';
import { cymSettings, migrateCym, sanitiseCym, type CymbalSettings } from '../engine/cymbals4';
import { regenStep } from '../engine/regen';
import { bake, mutate, parseSeed, reseed, sanitiseMutationOptions, sanitiseRecipe, seedLabel, seedsFrom } from '../engine/generate';
import { CHOP_STYLE, chopActive, defaultChop, describeChop, sanitiseChop } from '../engine/chopper';
import { rollGroups } from '../engine/rolls';
import { usesRollLayer } from '../engine/rollLayer';
import { SECTION_DEFS, type Section } from '../engine/sections';
import { freshSeed, stream } from '../engine/rng';
import { defaultWildcard, sanitiseWildcard, wildcardMix, wildcardOutput, wildcardRecipe, wildcardSampleModes, type WildcardCategory, type WildcardSettings } from '../engine/wildcard';
import { wildcardReport, type ReportState, type WildcardReport } from '../engine/wildcardReport';
import { chooseMain } from '../engine/kit';
import { pickTempo, tempoFor, tempoRange } from '../engine/tempo';
import { selectSamples, sanitiseSampleSettings, type CategorySamples, type SampleSettings } from '../engine/samples';
import { defaultRecipe, STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, CATEGORY_LABEL, CURRENT_ENGINE, CURRENT_REVISION, CYMBAL_REVISION, LAYERS, MUTATION_STYLES, STYLES, TPS, type Break, type Category, type ChopSettings, type Layer, type RollReport, type MutationOptions, type MutationStyle, type Recipe, type Seeds, type Style } from '../engine/types';
import type { Ingredients } from '../audio/ingredients';
import type { Player } from '../audio/player';
import { defaultTakeaway, type TakeawayOptions } from '../audio/takeaway';
import { audible, emptyMix, safeGain, safePan, sanitiseMix, type MixState } from './mix';
import { OutputChain, presetsFor, type ChainConfig } from '@slopfactory/core/engines';
import { OUTPUT_ENGINES } from '../audio/output';
import { diceName, entryKey, entryLabel, FAVOURITES_MAX, sanitiseFavourite, SeedHistory, type Favourite, type SeedEntry } from './seeds';

export const BATCH_SIZE = 8;
/** Grid for placing and moving hits by hand, in grid ticks (12 per sixteenth). */
export const SNAPS = [12, 6, 3, 8, 4] as const;
export const SNAP_LABEL: Record<number, string> = { 12: '1/16', 6: '1/32', 3: '1/64', 8: '1/16T', 4: '1/32T' };
const UNDO_LIMIT = 50;

/** The MUTATE tab's settings (what the next MUTATE does). */
export interface MutateSettings {
  style: MutationStyle;
  depth: number;
  range: number;
  target: 'all' | 'selected';
  /** the tracks MUTATE may change when target is 'selected' */
  cats: Category[];
}
export const defaultMutate = (): MutateSettings => ({ style: 'musical', depth: 0.5, range: 1, target: 'all', cats: ['kick', 'snare'] });
export function sanitiseMutate(v: unknown): MutateSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<MutateSettings>;
  const d = defaultMutate();
  const unit = (x: unknown, f: number) => (Number.isFinite(Number(x)) && x !== null ? Math.max(0, Math.min(1, Number(x))) : f);
  return {
    style: (MUTATION_STYLES as readonly string[]).includes(String(o.style)) ? o.style! : d.style,
    depth: unit(o.depth, d.depth),
    range: unit(o.range, d.range),
    target: o.target === 'selected' ? 'selected' : 'all',
    cats: Array.isArray(o.cats) ? CATEGORIES.filter((c) => o.cats!.includes(c)) : d.cats,
  };
}
const STATE_KEY = 'breakery.state.v1';
const HISTORY_KEY = 'breakery.history.v1';
const FAVOURITES_KEY = 'breakery.favourites.v1';

interface Saved {
  recipe: Recipe;
  seeds: Seeds;
  seedName: string | null;
  frozen: Record<Layer, boolean>;
  loop: boolean;
  level: number;
  takeaway: TakeawayOptions;
  samples: SampleSettings;
  mix: MixState;
  /** hand edits of the current break */
  edits?: Edits;
  /** FREEZE EDITS: carry the hand edits onto new breaks */
  keepEdits?: boolean;
  /** grid for placing and moving hits */
  snap?: number;
  /** the MUTATE tab's settings */
  mutate?: MutateSettings;
  /** the OUTPUT tab: the master output chain (Slop Factory Core chain configuration) */
  output?: ChainConfig;
  /** ROLL GENERATION: the user's preference (absent: off for a new user; a state saved before it keeps what its break had) */
  rollGeneration?: boolean;
  /** TEMPO LOCK: the tempo stays through recipe changes, RANDOM RECIPE, WILDCARD and REGEN */
  tempoLock?: boolean;
  /** WILDCARD: which categories it changes */
  wildcard?: WildcardSettings;
  /** changed since the last NEW PATCH (NEW PATCH asks first) */
  patchDirty?: boolean;
  /** PAINT: the sample chosen in INGREDIENTS for each track's hand-placed hits */
  paint?: Partial<Record<Category, string>>;
}

/** What an undo step of WILDCARD also restores (the mixer and the output chain are otherwise never part of undo). */
interface Extras {
  mix: MixState;
  output: ChainConfig;
}
const withExtras = (snap: string, extras: Extras): string => JSON.stringify({ ...JSON.parse(snap), extras });
const hasExtras = (snap: string): boolean => 'extras' in (JSON.parse(snap) as object);

const noFreeze = (): Record<Layer, boolean> => ({ beat: false, detail: false, feel: false, kit: false });

const ROLLS_ON_NOTE = 'ROLL GENERATION ON: rolls follow the ROLLS settings.';

const LEGACY_NOTE = 'This break was made by the first release’s generator (LEGACY), so it plays exactly as it did. RECIPE ▸ USE GROOVE re-bakes the same seed with today’s GROOVE.';

/** The current GROOVE for a recipe: a LEGACY recipe moves to engine 2 (with the Phase 7 JUNGLE). Other recipes are returned as they are. */
function current(r: Recipe): Recipe {
  if (r.engine !== 1) return r;
  return sanitiseRecipe({ ...r, engine: CURRENT_ENGINE, ...(r.style === 'jungle' ? { jungleCuts: true as const } : {}) });
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* no storage: this lasts for this visit */
  }
}

export class App {
  recipe: Recipe;
  seeds: Seeds;
  /** the seed's name when it was typed as text or rolled with DICE */
  seedName: string | null;
  frozen: Record<Layer, boolean>;
  takeawayOpts: TakeawayOptions;
  samples: SampleSettings;
  mix: MixState;
  current: Break;
  /** BATCH candidates (empty until BATCH is used) */
  batch: Break[] = [];
  /** index of the candidate that is current, if any */
  picked: number | null = null;
  history: SeedHistory;
  favourites: Favourite[];
  status = '';
  /** hand edits of the current break (a layer over the generated events: engine/edits.ts) */
  edits: Edits = noEdits();
  /** FREEZE EDITS: new breaks (BAKE, BATCH, seeds, MUTATE) keep the hand edits */
  keepEdits = false;
  /** the selected hit (its ref), or null */
  selected: string | null = null;
  /** grid for placing and moving hits, in grid ticks */
  snap = 12;
  /** what MUTATE does (the MUTATE tab) */
  mutation: MutateSettings = defaultMutate();
  /**
   * ROLL GENERATION, the user's preference: off until they switch it on, and kept (saved) through
   * everything else: recipe changes, RANDOM RECIPE, BAKE, BATCH, seeds, MUTATE, CHOP, reloads. Every
   * break baked from here on carries it in its recipe (rollsOn), so the switch and the generator
   * always agree; no recipe's defaults ever turn it back on.
   */
  rollGeneration = false;
  /**
   * TEMPO LOCK, the user's preference (saved, never part of undo): when on, nothing but the BPM box
   * changes the tempo (choosing a recipe, RANDOM RECIPE and WILDCARD keep it). BAKE never changes
   * the tempo either way. With an EXTERNAL MIDI clock the clock sets the tempo whatever this says.
   */
  tempoLock = false;
  /** WILDCARD's categories (a preference: saved, never part of undo, kept through recipe changes) */
  wildcardSettings: WildcardSettings = defaultWildcard();
  /**
   * OUTPUT: the master output chain. App settings like the mixer: saved, never part of the break
   * or of undo. Every change is heard at once and saved.
   */
  output: OutputChain;
  /**
   * Has the patch changed since the last NEW PATCH (any change that is an undo step)? NEW PATCH
   * asks before discarding it. A state saved before Phase 15 counts as changed.
   */
  patchDirty = false;
  /**
   * The last WILDCARD's report: what it changed, before and after. Kept until the next WILDCARD
   * or NEW PATCH; part of the undo snapshots, so undo and redo bring back the matching one.
   */
  wildcardReport: WildcardReport | null = null;
  /**
   * PAINT (Phase 17): a sample chosen in INGREDIENTS for its own track. A hit placed by hand on
   * that track plays exactly that sample (pinned: no PICK mode chooses for it); other tracks keep
   * their own choice or their PICK mode. A preference, saved, never part of undo (the hits it
   * places are). A choice whose sample is no longer in its track is dropped (see checkPaint).
   */
  paint: Partial<Record<Category, string>> = {};
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private baseline = '';
  private gesture = false;
  private listeners: (() => void)[] = [];

  constructor(public ingredients: Ingredients, public player: Player, initialSeed?: string) {
    const s = readJson(STATE_KEY) as Partial<Saved> | null;
    const fromUrl = initialSeed !== undefined ? parseSeed(initialSeed) : null;
    // ROLL GENERATION: off for a new user; a state saved before the preference existed keeps what its break had
    this.rollGeneration = typeof s?.rollGeneration === 'boolean' ? s.rollGeneration : s?.recipe ? s.recipe.rollsOn !== false : false;
    this.tempoLock = s?.tempoLock === true;
    this.wildcardSettings = sanitiseWildcard(s?.wildcard);
    this.patchDirty = typeof s?.patchDirty === 'boolean' ? s.patchDirty : !!s?.recipe;
    // a saved break (LEGACY too) reproduces as it was; a seed from a link is a new break, baked by the current GROOVE
    this.recipe = s?.recipe ? sanitiseRecipe(s.recipe) : this.fresh(defaultRecipe('funk', 2));
    if (fromUrl) this.recipe = this.fresh(current(this.recipe));
    this.seeds = fromUrl ? seedsFrom(fromUrl.seed) : (s?.seeds ?? seedsFrom(freshSeed()));
    this.seedName = fromUrl ? fromUrl.name : (s?.seedName ?? null);
    this.frozen = { ...noFreeze(), ...(s?.frozen ?? {}) };
    this.takeawayOpts = { ...defaultTakeaway(), ...(s?.takeaway ?? {}) };
    this.samples = sanitiseSampleSettings(s?.samples);
    this.mix = sanitiseMix(s?.mix);
    // a seed from the link is another break: its edits are not these
    if (!fromUrl) this.edits = sanitiseEdits(s?.edits, CATEGORIES);
    this.keepEdits = s?.keepEdits === true;
    this.snap = (SNAPS as readonly number[]).includes(Number(s?.snap)) ? Number(s!.snap) : 12;
    this.mutation = sanitiseMutate(s?.mutate);
    if (s?.paint && typeof s.paint === 'object') for (const c of CATEGORIES) if (typeof s.paint[c] === 'string' && s.paint[c]) this.paint[c] = s.paint[c];
    this.output = new OutputChain(OUTPUT_ENGINES, s?.output);
    player.setOutput(this.output.config);
    this.output.subscribe((c) => {
      player.setOutput(c);
      this.changed();
    });
    this.history = SeedHistory.from(readJson(HISTORY_KEY));
    const favs = readJson(FAVOURITES_KEY);
    this.favourites = Array.isArray(favs) ? favs.map(sanitiseFavourite).filter((f): f is Favourite => !!f) : [];
    player.loop = s?.loop ?? true;
    player.setLevel(typeof s?.level === 'number' ? s.level : player.level);
    player.setMix(this.mix);
    this.current = this.bakeWith(this.seeds);
    // a saved break whose recipe disagrees with the preference follows it (the ROLLS layer just switches; an older engine keeps its rolls as hits)
    if (this.rollsDisagree) {
      this.switchRolls(this.rollGeneration);
      this.current = this.bakeWith(this.seeds);
    }
    player.setBreak(this.current);
    player.onSwap = () => { this.ingredients.releaseRetired?.(); this.changed(false); };
    this.remember();
    this.baseline = this.snapshot();
    if (this.legacy) this.status = LEGACY_NOTE;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  changed(save = true): void {
    this.recordChange();
    if (save) this.save();
    for (const f of this.listeners) f();
  }

  say(msg: string): void {
    this.status = msg;
    this.changed(false);
  }

  save(): void {
    const s: Saved = { recipe: this.recipe, seeds: this.seeds, seedName: this.seedName, frozen: this.frozen, loop: this.player.loop, level: this.player.level, takeaway: this.takeawayOpts, samples: this.samples, mix: this.mix, edits: this.edits, keepEdits: this.keepEdits, snap: this.snap, mutate: this.mutation, output: this.output.config, rollGeneration: this.rollGeneration, tempoLock: this.tempoLock, wildcard: this.wildcardSettings, patchDirty: this.patchDirty, paint: this.paint };
    writeJson(STATE_KEY, s);
    writeJson(HISTORY_KEY, this.history.toJSON());
  }

  /** Bake with the current recipe, kit, sample settings and (by default) the hand edits. */
  private bakeWith(seeds: Seeds, recipe = this.recipe, edits: Edits | null = this.edits): Break {
    return bake(recipe, seeds, this.ingredients.kit(), { settings: this.samples, loudness: this.ingredients.loudness() }, (id) => this.ingredients.name(id), edits);
  }

  /** Show and play a break: `edit` when it is this break changed (a control, a transformation), not a new one. */
  private show(b: Break, edit = false): void {
    // the seed's words travel with the break (the batch, exports and the pattern card show them)
    if (this.seedName) b.seedName = this.seedName;
    else delete b.seedName;
    this.current = b;
    this.player.setBreak(b, edit);
    if (this.selected && !findRef(b.events, this.selected)) this.selected = null;
  }

  private remember(): void {
    this.history.push(this.entry);
  }

  /** The current seed as shown: its name, or the number. */
  get seedText(): string {
    return seedLabel(this.seeds.beat, this.seedName);
  }

  get entry(): SeedEntry {
    return { recipe: this.recipe, seeds: this.seeds, name: this.seedName, ...(hasEdits(this.edits) ? { edits: JSON.parse(JSON.stringify(this.edits)) as Edits } : {}) };
  }

  /** Re-bake the current seeds (after a recipe, kit or sample-setting change); the batch follows. Hand edits are re-applied. */
  rebake(): void {
    this.checkPaint();
    const before = this.current.editReport;
    this.show(this.bakeWith(this.seeds), true);
    this.batch = this.batch.map((c, i) => (i === this.picked ? this.current : this.bakeWith(c.seeds, this.recipe, this.keepEdits ? this.edits : null)));
    const r = this.current.editReport;
    if (r && (r.outside !== (before?.outside ?? 0) || r.inactive !== (before?.inactive ?? 0)) && (r.outside || r.inactive)) this.status = describeEdits(this.edits, r);
    this.changed();
  }

  /**
   * A NEW break is about to replace this one (BAKE, BATCH, a seed, DICE, MUTATE). Its hand edits
   * stay with it in the history (they were stored there with every edit), unless FREEZE EDITS
   * carries them onto the new break. Returns a note for the status line.
   */
  private leaveEdits(): string {
    if (!hasEdits(this.edits)) return '';
    if (this.keepEdits) return ` Hand edits kept (FREEZE EDITS).`;
    const n = editCount(this.edits);
    this.edits = noEdits();
    this.selected = null;
    return ` Your ${n} hand edit${n === 1 ? '' : 's'} stay with the previous break: ◀ goes back to it (FREEZE EDITS carries edits onto new breaks).`;
  }

  /**
   * The recipe for a new or changed break: ROLL GENERATION as the user set it (whatever the recipe
   * says) and the current GROOVE revision (engine 2). Only restoring a break (history, favourites,
   * undo, a reload) bakes a recipe as it was saved.
   */
  private fresh(r: Recipe): Recipe {
    // a revision 3 recipe moving to revision 4 brings its HI-HAT and RIDE ACTIVITY and RELATIONSHIP with it (cymbals4.ts migrateCym)
    const cym = r.engine === 2 && (r.revision ?? 0) < CYMBAL_REVISION && !r.cym && (r.hats !== undefined || r.ride !== undefined || r.cymbals !== undefined) ? { cym: migrateCym(r) } : {};
    return sanitiseRecipe({ ...r, ...cym, rollsOn: this.rollGeneration, ...(r.engine === 2 ? { revision: CURRENT_REVISION } : {}) });
  }

  /** A new named seed (DICE's words): its name and the seed it hashes to. `random` is Math.random in the app; WILDCARD passes its own stream. */
  private named(random: () => number = Math.random): { name: string; seed: number } {
    const name = diceName(random);
    return { name, seed: parseSeed(name)!.seed };
  }

  /** A new break is never LEGACY: the recipe moves to the current GROOVE. Returns a note for the status line. */
  private leaveLegacy(): string {
    const note = this.legacy ? ' (Now with the current GROOVE: the legacy break stays in the history.)' : '';
    this.recipe = this.fresh(current(this.recipe));
    return note;
  }

  setRecipe(patch: Partial<Recipe>): void {
    this.recipe = this.fresh({ ...this.recipe, ...patch });
    this.history.replaceCurrent(this.entry);
    this.rebake();
  }

  /**
   * Choose a style: its defaults replace the controls, baked by the current GROOVE. CHOP's settings
   * stay. The tempo comes from the recipe's TEMPO PROFILE (seeded by the break's beat seed, so the
   * same recipe and seed give the same tempo), or stays as it is with TEMPO LOCK on.
   */
  setStyle(style: Style): void {
    this.recipe = this.fresh({ ...defaultRecipe(style, this.recipe.bars), ...this.carried(), bpm: this.tempoOf(style, this.seeds.beat) });
    this.history.replaceCurrent(this.entry);
    this.rebake();
  }

  /** The tempo for a recipe and a seed: from its TEMPO PROFILE, or the current one with TEMPO LOCK on. */
  private tempoOf(style: Style, seed: number): number {
    return this.tempoLock ? this.recipe.bpm : tempoFor(style, seed);
  }

  /** TEMPO LOCK on or off (a preference: saved, not an undo step). */
  setTempoLock(on: boolean): void {
    this.tempoLock = on;
    this.status = on ? `TEMPO LOCK on: ${this.recipe.bpm} BPM stays through recipe changes, RANDOM RECIPE and WILDCARD (the BPM box still sets it).` : `TEMPO LOCK off: choosing a recipe picks a tempo from its range (${tempoRange(this.recipe.style)}).`;
    this.save();
    for (const f of this.listeners) f();
  }

  /**
   * TEMPO DICE: a new tempo from the recipe's TEMPO PROFILE, for the same break (the pattern is
   * not regenerated). Not while TEMPO LOCK is on. One undo step.
   */
  diceTempo(seed = freshSeed()): boolean {
    if (this.tempoLock) {
      this.say('TEMPO LOCK is on: unlock it to roll a new tempo (the BPM box still sets it by hand).');
      return false;
    }
    const rng = stream(seed, 'tempo-dice');
    let bpm = pickTempo(this.recipe.style, rng);
    for (let i = 0; i < 6 && bpm === this.recipe.bpm; i++) bpm = pickTempo(this.recipe.style, rng);
    this.setRecipe({ bpm });
    this.say(`Tempo ${bpm} BPM, from ${STYLE_DEFS[this.recipe.style].label}'s range (${tempoRange(this.recipe.style)}). Same break.`);
    return true;
  }

  /**
   * What a new recipe keeps from the current one: CHOP (with DESTROY), the rolls' EXPRESSION, the
   * PERSONALITY and the BREAK DNA. They are how the break is treated and who plays it, not part of
   * a recipe's defaults.
   */
  private carried(): Partial<Recipe> {
    const r = this.recipe;
    return JSON.parse(JSON.stringify({ ...(r.chop ? { chop: r.chop } : {}), ...(r.destroy ? { destroy: r.destroy } : {}), ...(r.destroy2 ? { destroy2: r.destroy2 } : {}), ...(r.rollExpr ? { rollExpr: r.rollExpr } : {}), ...(r.personality ? { personality: r.personality } : {}), ...(r.dna ? { dna: r.dna } : {}) })) as Partial<Recipe>;
  }

  /** Is this break LEGACY (baked by the first release's generator, kept so saved breaks reproduce)? */
  get legacy(): boolean {
    return this.recipe.engine === 1;
  }

  /**
   * USE CURRENT GROOVE: a LEGACY break (restored from a save made with the first release's
   * generator) re-baked with today's GROOVE: same seed, same controls. One way, undoable; nothing
   * offers the legacy generator for new breaks.
   */
  useCurrentGroove(): void {
    if (!this.legacy) return;
    this.recipe = this.fresh(current(this.recipe));
    this.history.replaceCurrent(this.entry);
    this.rebake();
    this.say('Re-baked with the current GROOVE: same seed and controls (⌘Z returns to the legacy break).');
  }

  /**
   * RANDOM RECIPE: a different recipe at random, and a new break from it with the current GROOVE.
   * The pattern length, the kit and CHOP stay; the seeds follow FREEZE exactly as BAKE does. One
   * undo step. `roll` 0..1 picks the recipe.
   */
  randomRecipe(roll = Math.random()): Style {
    const pool: Style[] = [...STYLES];
    const others = pool.filter((s) => s !== this.recipe.style);
    const choices = others.length ? others : pool;
    const style = choices[Math.min(choices.length - 1, Math.max(0, Math.floor(roll * choices.length)))]!;
    const note = this.leaveEdits();
    const n = this.named();
    const seeds = reseed(this.seeds, this.frozen, n.seed);
    this.recipe = this.fresh({ ...defaultRecipe(style, this.recipe.bars), ...this.carried(), bpm: this.tempoOf(style, seeds.beat) });
    this.seeds = seeds;
    this.seedName = n.name;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `Random recipe: ${STYLE_DEFS[style].label} at ${this.recipe.bpm} BPM${this.tempoLock ? ' (TEMPO LOCK)' : ''}, seed ${this.seedText}${this.frozenNote}.${note}`;
    this.changed();
    return style;
  }

  /** WILDCARD's settings: one category on or off (a preference, not an undo step). */
  setWildcard(cat: WildcardCategory, on: boolean): void {
    this.wildcardSettings = { ...this.wildcardSettings, [cat]: on };
    this.save();
    for (const f of this.listeners) f();
  }

  resetWildcard(): void {
    this.wildcardSettings = defaultWildcard();
    this.save();
    for (const f of this.listeners) f();
  }

  /**
   * WILDCARD: a new break re-imagined across the categories in its settings (engine/wildcard.ts):
   * a new recipe, tempo, controls, personality and treatments, new seeds as BAKE draws them (FREEZE
   * respected; the KIT seed changes only with SAMPLE ASSIGNMENTS), and optionally the mixer and the
   * output chain. Deterministic from `seed`. One undo step restores all of it, the mixer and the
   * output chain included; redo brings it back. Heard through the switching mode while playing.
   */
  wildcard(seed = freshSeed()): void {
    this.endGesture();
    const before = this.snapshot();
    const extrasBefore: Extras = { mix: JSON.parse(JSON.stringify(this.mix)) as MixState, output: this.output.config };
    const S = this.wildcardSettings;
    const reportBefore = this.reportState(S.mixer, S.output);
    let status = '';
    this.gesture = true;
    try {
      const note = this.leaveEdits() + this.leaveLegacy();
      const res = wildcardRecipe(this.recipe, { settings: S, frozen: this.frozen, tempoLock: this.tempoLock, rollGeneration: this.rollGeneration }, seed);
      const wn = this.named(stream(seed, 'wildcard:seed-name').next);
      const seeds = reseed(this.seeds, this.frozen, wn.seed);
      // the samples change only with SAMPLE ASSIGNMENTS (and never with KIT frozen)
      if (!S.samples || this.frozen.kit) seeds.kit = this.seeds.kit;
      else res.changed.push('samples');
      if (S.samples && this.frozen.kit) res.kept.push('SAMPLE ASSIGNMENTS (KIT frozen)');
      // a PICK mode per track with two or more samples (never with KIT frozen)
      if (S.sampleModes) {
        if (this.frozen.kit) res.kept.push('SAMPLE SELECTION MODES (KIT frozen)');
        else {
          const kit = this.ingredients.kit();
          const m = wildcardSampleModes(this.samples, Object.fromEntries(CATEGORIES.map((c) => [c, kit[c].length])), seed);
          if (m.changed.length) {
            this.samples = m.samples;
            res.changed.push('sampleModes');
          }
        }
      }
      if (S.mixer) {
        this.mix = wildcardMix(this.mix, seed);
        this.player.setMix(this.mix);
        res.changed.push('mixer');
      }
      if (S.output) {
        const presets = presetsFor(OUTPUT_ENGINES);
        const p = presets[wildcardOutput(presets.length, seed)];
        if (p && this.output.applyPreset(p)) res.changed.push('output');
      }
      this.recipe = this.fresh(res.recipe);
      this.seeds = seeds;
      this.seedName = wn.name;
      this.picked = null;
      this.show(this.bakeWith(this.seeds));
      this.remember();
      // the report: every setting that changed, before and after (the status line is its headline)
      this.wildcardReport = wildcardReport(reportBefore, this.reportState(S.mixer, S.output), res.kept);
      status = `${this.wildcardReport.headline}${note ? ` ·${note}` : ''}`;
    } finally {
      this.gesture = false;
    }
    this.status = status;
    this.baseline = S.mixer || S.output ? withExtras(before, extrasBefore) : before;
    this.changed();
  }

  /** The state a WILDCARD report compares (plain data: names and settings, no audio). */
  private reportState(mix: boolean, output: boolean): ReportState {
    const main = chooseMain(this.ingredients.kit(), this.seeds.kit);
    const cfg = this.output.config;
    return {
      recipe: JSON.parse(JSON.stringify(this.recipe)) as Recipe,
      seedText: this.seedText,
      samples: JSON.parse(JSON.stringify(this.samples)) as SampleSettings,
      main: Object.fromEntries(CATEGORIES.map((c) => [c, main[c] ? this.ingredients.name(main[c]!) : null])),
      ...(mix ? { mix: JSON.parse(JSON.stringify(this.mix)) as MixState } : {}),
      ...(output ? { output: { bypass: cfg.bypass, stages: cfg.stages.map((x) => ({ engine: x.engine, enabled: x.enabled, params: { ...x.params } })) } } : {}),
    };
  }

  /**
   * NEW PATCH: start again. Resets the patch: the break, its recipe and every control, the tempo
   * and TEMPO LOCK, the seeds, FREEZE, PERSONALITY, BREAK DNA, cymbals, CHOP, the roll settings,
   * DESTROY, MUTATE's settings, hand edits, the batch, selections, the WILDCARD report, SOLO and
   * MUTE. Keeps the library (samples, saved kits, favourites, the seed history) and the
   * preferences (palette, MIDI, OUTPUT, ROLL GENERATION, WILDCARD's toggles, export naming,
   * SNAP). With `keepKit` false the PICK modes and the mixer's levels and pans reset too (the
   * caller loads the default kit first). Undo starts afresh; the previous break stays in the seed
   * history (◀ goes back to it).
   */
  newPatch(opts: { keepKit?: boolean } = {}): void {
    const keepKit = opts.keepKit !== false;
    this.gesture = false;
    const n = this.named();
    this.tempoLock = false;
    this.recipe = this.fresh(defaultRecipe('funk', 2));
    this.seeds = seedsFrom(n.seed);
    this.seedName = n.name;
    this.frozen = noFreeze();
    this.edits = noEdits();
    this.keepEdits = false;
    this.selected = null;
    this.batch = [];
    this.picked = null;
    this.trackSel = [];
    this.mutation = defaultMutate();
    this.wildcardReport = null;
    if (keepKit) for (const c of Object.values(this.mix)) Object.assign(c, { mute: false, solo: false });
    else {
      this.samples = {};
      this.mix = emptyMix();
    }
    this.player.setMix(this.mix);
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.undoStack = [];
    this.redoStack = [];
    this.baseline = this.snapshot();
    this.patchDirty = false;
    this.status = `NEW PATCH: ${STYLE_DEFS[this.recipe.style].label} at ${this.recipe.bpm} BPM, seed ${this.seedText}, ${keepKit ? 'current kit kept' : 'default kit'}. The previous break is in the seed history (◀).`;
    this.save();
    for (const f of this.listeners) f();
  }

  /**
   * CLEAR PATTERN: remove every hit, as hand edits, so the settings stay as they are. One undo
   * step (⌘Z brings the hits back); add hits by hand on the empty grid, or BAKE a new pattern.
   */
  clearPattern(): void {
    const n = this.current.events.length;
    if (!n) return this.say('The pattern is already empty.');
    const generated = this.bakeWith(this.seeds, this.recipe, null).events;
    const removed = [...new Set(generated.map((e) => e.ref ?? hitKey(e)))];
    this.selected = null;
    this.commit({ edits: { v: 2, removed, changed: {}, added: [] }, ref: null }, false, { say: `Cleared the pattern (${n} hit${n === 1 ? '' : 's'}). The settings are as they were: ⌘Z brings the hits back, BAKE makes a new pattern.` });
  }

  /**
   * RESET CONTROLS: every control back to this recipe's defaults (the generation controls, TOM,
   * CLAP and FX ACTIVITY, cymbals, PERSONALITY, BREAK DNA, CHOP, the roll settings and ROLL
   * EXPRESSION, DESTROY). The recipe, tempo, length and seed stay, and so does the pattern: it is
   * not re-baked, so nothing you hear changes until you bake (or move a control, which re-bakes
   * with all of them). One undo step.
   */
  resetControls(): void {
    const d = defaultRecipe(this.recipe.style, this.recipe.bars);
    const next = this.fresh({ ...d, bpm: this.recipe.bpm });
    if (JSON.stringify(next) === JSON.stringify(this.recipe)) return this.say(`The controls are already ${STYLE_DEFS[this.recipe.style].label}’s defaults.`);
    this.recipe = next;
    this.status = `Controls reset to ${STYLE_DEFS[this.recipe.style].label}’s defaults. The pattern stays as it is until you bake (or move a control); ⌘Z undoes this.`;
    this.changed();
  }

  resetRecipe(): void {
    this.setStyle(this.recipe.style);
  }

  /** BAKE: new seeds for the layers that are not frozen, baked by the current GROOVE (a LEGACY recipe moves to it). */
  bake(): void {
    const note = this.leaveEdits() + this.leaveLegacy();
    const n = this.named();
    this.seeds = reseed(this.seeds, this.frozen, n.seed);
    this.seedName = n.name;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `Baked: ${STYLE_DEFS[this.recipe.style].label}, seed ${this.seedText}${this.frozenNote}.${note}`;
    this.changed();
  }

  /** BATCH: several candidates from new seeds (frozen layers kept); the first becomes current. */
  bakeBatch(n = BATCH_SIZE): void {
    const note = this.leaveEdits() + this.leaveLegacy();
    this.batch = [];
    for (let i = 0; i < n; i++) {
      const nm = this.named();
      const b = this.bakeWith(reseed(this.seeds, this.frozen, nm.seed));
      b.seedName = nm.name;
      this.batch.push(b);
    }
    this.pick(0);
    this.status = `A batch of ${n}: click one (or press 1–${n}) to audition it.${note}`;
    this.changed();
  }

  pick(i: number): void {
    const b = this.batch[i];
    if (!b) return;
    if (i !== this.picked) {
      const note = this.leaveEdits();
      if (note) this.status = note.trim();
    }
    this.picked = i;
    this.seeds = { ...b.seeds };
    this.seedName = b.seedName ?? null;
    // a candidate is baked with the edits it was made with; bake it again with the current ones
    this.show(hasEdits(this.edits) || b.edits ? this.bakeWith(this.seeds) : b);
    this.batch[i] = this.current;
    this.remember();
    this.changed();
  }

  /** Set every layer from one seed (a number, or a name). */
  setSeed(seed: number, name: string | null = null): void {
    const note = this.leaveEdits() + this.leaveLegacy();
    this.seeds = seedsFrom(Math.max(0, Math.floor(seed)) >>> 0);
    this.seedName = name;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `Seed ${this.seedText}.${note}`;
    this.changed();
  }

  /** What was typed in the SEED box: a number or a name. False if empty. */
  setSeedText(text: string): boolean {
    const p = parseSeed(text);
    if (!p) return false;
    // the same seed typed again (Return in an unchanged box) changes nothing and adds no undo step
    if (p.seed === this.seeds.beat && seedsFrom(p.seed).detail === this.seeds.detail && seedsFrom(p.seed).feel === this.seeds.feel && seedsFrom(p.seed).kit === this.seeds.kit && !this.seeds.mut?.length && !this.seeds.regen?.length && (p.name ?? null) === this.seedName) return true;
    const had = hasEdits(this.edits) && !this.keepEdits;
    this.setSeed(p.seed, p.name);
    const note = had ? ' Your hand edits stay with the previous break (◀).' : '';
    this.status = (p.name ? `Seed ${p.name} (${p.seed}): the same words always bake the same break with the same recipe and settings (case and extra spaces do not matter).` : `Seed ${p.seed}.`) + note;
    this.changed(false);
    return true;
  }

  /** DICE: a new random named seed (memorable words, VELVET-THUNDER-17) for every layer. */
  dice(): void {
    const name = diceName();
    this.setSeedText(name);
    this.status = `Rolled ${name}: type it into SEED to bake it again (with the same recipe and settings).`;
    this.changed(false);
  }

  /** A note for the status line when FREEZE kept some layers: the seed then names only the others. */
  get frozenNote(): string {
    const f = LAYERS.filter((l) => this.frozen[l]);
    return f.length ? ` (${f.map((l) => l.toUpperCase()).join(', ')} frozen: kept from before)` : '';
  }

  /** MUTATE's options from the MUTATE tab; none for the plain settings, so a plain MUTATE replays exactly as before. */
  get mutationOptions(): MutationOptions | undefined {
    const o = this.mutation;
    if (o.style === 'musical' && o.depth === 0.5 && o.range === 1 && o.target === 'all') return undefined;
    return { style: o.style, depth: o.depth, range: o.range, ...(o.target === 'selected' ? { cats: [...o.cats] } : {}) };
  }

  /** Change the MUTATE tab's settings (they apply to the next MUTATE; the break is unchanged). */
  setMutation(patch: Partial<MutateSettings>): void {
    this.mutation = sanitiseMutate({ ...this.mutation, ...patch });
    this.changed();
  }

  /** MUTATE: a related variation of this break (the layers that are not frozen), as the MUTATE tab sets it. */
  mutate(): void {
    const o = this.mutationOptions;
    if (o?.cats && !o.cats.length) return this.say('MUTATE: choose at least one track, or ALL TRACKS.');
    const n = (this.seeds.mut?.length ?? 0) + 1;
    const how = o ? `${o.style!.toUpperCase()} at ${Math.round(o.depth! * 100)}% depth${o.range! < 1 ? `, the last ${Math.round(o.range! * 100)}% of the phrase` : ''}${o.cats ? `, ${o.cats.length} track${o.cats.length === 1 ? '' : 's'}` : ''}` : 'the groove varied a little';
    this.mutateWith(o, `Mutation ${n}: ${how}`);
  }

  /** CREATE RELATED SECTION: a section of the same tune from this break (a mutation, and for some sections a recipe change). */
  createSection(kind: Section): void {
    const d = SECTION_DEFS[kind];
    const from = this.seedText;
    this.mutateWith({ ...d.mutation }, `${d.label}: a related section made from ${from}`, d.recipe(this.recipe));
  }

  private mutateWith(opts: MutationOptions | undefined, what: string, patch: Partial<Recipe> = {}): boolean {
    const next = mutate(this.seeds, this.frozen, undefined, opts ? sanitiseMutationOptions(opts) : undefined);
    if (!next) {
      this.say('Nothing to mutate: BEAT and DETAIL are both frozen.');
      return false;
    }
    if (this.legacy) {
      this.say('MUTATE works on the current GROOVE: this is a LEGACY break, kept exactly as released. RECIPE ▸ USE GROOVE first.');
      return false;
    }
    const note = this.leaveEdits();
    this.recipe = this.fresh({ ...this.recipe, ...patch });
    this.seeds = next;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `${what}${this.frozen.beat ? ' (kick and snare frozen)' : this.frozen.detail ? ' (detail frozen)' : ''}. ← goes back.${note}`;
    this.changed();
    return true;
  }

  // ---------------------------------------------------------------- rolls

  /** The rolls in the current pattern: whole rolls (a roll round the toms is one), and their hits. */
  get rollCount(): { rolls: number; hits: number } {
    const g = rollGroups(this.current.events);
    return { rolls: g.length, hits: g.reduce((n, x) => n + x.events.length, 0) };
  }

  /**
   * Are this break's ROLLS the transformation of the finished groove (revision 6, or an older
   * break moved to it by a roll action)? Then ROLL GENERATION, RE-ROLL and the roll settings
   * change only the rolls, never the groove.
   */
  get rollLayer(): boolean {
    return usesRollLayer(this.recipe);
  }

  /**
   * What the ROLLS tab shows about this pattern, from its actual events (after hand edits and
   * DESTROY): the generated rolls (the ROLLS transformation) and their retriggers, the rolls made
   * or kept by hand, the rolls inside fills and CHOP, and why there are none.
   */
  get rollSummary(): { generated: number; strokes: number; manual: number; other: number; report: RollReport | null; text: string } {
    const evs = this.current.events.filter((e) => e.role === 'roll');
    const gen = evs.filter((e) => e.rollOf && !e.manual?.match(/added|moved/));
    const manual = evs.filter((e) => e.manual === 'added' || e.manual === 'moved');
    const other = evs.filter((e) => !gen.includes(e) && !manual.includes(e));
    const generated = new Set(gen.map((e) => e.rollOf)).size;
    const m = rollGroups(manual).length;
    const o = rollGroups(other).length;
    const report = this.current.rollReport ?? null;
    const s = (n: number) => (n === 1 ? '' : 'S');
    const extra = `${m ? ` · ${m} MANUAL ROLL${s(m)}` : ''}${o ? ` · ${o} IN FILLS/CHOP` : ''}`;
    let text: string;
    if (this.legacy) text = 'LEGACY BREAK: NO ROLLS';
    else if (!this.rollGeneration) text = `ROLL GENERATION OFF · ${m} MANUAL ROLL${s(m)} RETAINED${o ? ` · ${o} IN FILLS/CHOP` : ''}`;
    else if (!this.rollLayer) {
      const c = this.rollCount;
      text = c.rolls ? `${c.rolls} ROLL${s(c.rolls)} · ${c.hits} HIT${c.hits === 1 ? '' : 'S'} (EARLIER ROLL ENGINE: RE-ROLL MOVES THIS BREAK TO THE NEW ONE)` : '0 ROLLS · RE-ROLL APPLIES ROLLS TO THIS GROOVE';
    } else if (generated) text = `${generated} ROLL${s(generated)} · ${gen.length} RETRIGGER${s(gen.length)}${extra}`;
    else text = `0 ROLLS · ${report?.rolls ? 'THE GENERATED ROLLS WERE DELETED BY HAND (⌘Z)' : (report?.reason ?? 'NONE')}${extra}`;
    return { generated, strokes: gen.length, manual: m, other: o, report, text };
  }

  /** Does the current recipe disagree with ROLL GENERATION (a restored engine-2 break baked the other way)? */
  private get rollsDisagree(): boolean {
    return this.recipe.engine === 2 && (this.recipe.rollsOn !== false) !== this.rollGeneration;
  }

  /** The recipe with this patch, its rolls moved to the transformation (an older engine 2 break keeps its groove exactly). */
  private rollRecipe(patch: Partial<Recipe>): Recipe {
    return sanitiseRecipe({ ...this.recipe, ...(this.recipe.engine === 2 && !this.rollLayer ? { rollLayer: true as const } : {}), ...patch });
  }

  /**
   * ROLL GENERATION on or off: the user's preference (saved, kept until they change it, never
   * turned on by a recipe or WILDCARD) and this pattern's ROLLS transformation. On: the roll
   * settings apply to the CURRENT groove at once, no BAKE. Off: the generated rolls go (the
   * groove is as it was without them) and come back exactly when it is on again; rolls made or
   * kept by hand (RATCHET, hand-placed roll hits) stay. Toggling never accumulates anything: the
   * rolls are recalculated from the groove every time. Undoable, one step.
   */
  setRollsOn(on: boolean): void {
    if (this.legacy) return this.say('ROLLS: this is a LEGACY break, kept exactly as released. RECIPE ▸ USE GROOVE first.');
    if (this.rollGeneration === on && !this.rollsDisagree && this.rollLayer) return;
    this.rollGeneration = on;
    this.recipe = this.rollRecipe({ rollsOn: on });
    this.history.replaceCurrent(this.entry);
    this.rebake();
    this.status = on ? `ROLL GENERATION ON: ${this.rollSummary.text}. RE-ROLL draws another set; the groove is unchanged.` : `ROLL GENERATION OFF: the generated rolls are off this groove (on again brings the same ones back).${this.rollSummary.manual ? ` ${this.rollSummary.manual} manual roll${this.rollSummary.manual === 1 ? '' : 's'} kept; CLEAR ROLLS deletes them.` : ''}`;
    this.changed(false);
  }

  /**
   * A roll setting (PROBABILITY, LENGTH, SPEED, DYNAMICS, PLACEMENT, TARGET TRACKS): heard at once
   * on the current groove (only the rolls change, the same take). A drag is one undo step.
   */
  setRolls(patch: Partial<Pick<Recipe, 'rolls' | 'rollLength' | 'rollSpeed' | 'rollDynamics' | 'rollPlace' | 'rollTargets'>>): void {
    if (this.legacy) return this.say('ROLLS: this is a LEGACY break, kept exactly as released. RECIPE ▸ USE GROOVE first.');
    const next = this.rollRecipe(patch);
    if (JSON.stringify(next) === JSON.stringify(this.recipe)) return;
    this.recipe = next;
    this.history.replaceCurrent(this.entry);
    this.rebake();
    if (this.rollGeneration) this.status = `ROLLS: ${this.rollSummary.text}.`;
    this.changed(false);
  }

  /**
   * RE-ROLL: another take of the ROLLS transformation on the CURRENT groove, with the current
   * settings (and EXPRESSION). Not BAKE: no other hit, sample, setting or seed changes. The next
   * take that gives different rolls is used (up to 16 ahead), so a press is never silently the
   * same. One undo step; redo restores the exact take.
   */
  reRoll(): void {
    if (this.legacy) return this.say('RE-ROLL: this is a LEGACY break, kept exactly as released. RECIPE ▸ USE GROOVE first.');
    if (!this.rollGeneration) return this.say('RE-ROLL: switch ROLL GENERATION on first (ROLLS tab).');
    const sig = (b: Break) => JSON.stringify(b.events.filter((e) => e.rollOf).map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.offsetMs]));
    const now = this.rollLayer ? sig(this.current) : null;
    const take0 = this.recipe.rollTake ?? 0;
    let pick = take0 + 1;
    for (let t = take0 + 1; t <= take0 + 16; t++) {
      if (sig(this.bakeWith(this.seeds, this.rollRecipe({ rollTake: t, rollsOn: true }))) !== now) {
        pick = t;
        break;
      }
    }
    this.recipe = this.rollRecipe({ rollTake: pick, rollsOn: true });
    this.history.replaceCurrent(this.entry);
    this.rebake();
    const r = this.current.rollReport;
    const same = now !== null && sig(this.current) === now;
    this.status = same && r ? `RE-ROLL take ${pick}: these settings give the same rolls on every take (${r.eligible} eligible, ${Math.round(this.recipe.rolls * 100)}%). Lower PROBABILITY, or allow more PLACEMENT or TARGET TRACKS, for variety.` : `RE-ROLL take ${pick}: ${this.rollSummary.text}. The groove is unchanged (⌘Z returns to the previous rolls).`;
    this.changed(false);
  }

  /** Bake this break with roll generation on or off (the rest of its recipe as it is), keeping the rolls it had. Returns a note for the status line. */
  private switchRolls(on: boolean): string {
    // the ROLLS transformation (revision 6): the switch is all there is; nothing becomes a hand edit
    if (this.rollLayer) {
      this.recipe = sanitiseRecipe({ ...this.recipe, rollsOn: on });
      return on ? ROLLS_ON_NOTE : 'ROLL GENERATION OFF: no generated rolls.';
    }
    if ((this.recipe.rollsOn !== false) === on) return on ? ROLLS_ON_NOTE : 'ROLL GENERATION OFF: new breaks get no rolls.';
    if (!on) {
      const before = this.current.events.filter((e) => e.role === 'roll' && e.manual !== 'added' && e.manual !== 'moved');
      this.recipe = sanitiseRecipe({ ...this.recipe, rollsOn: false });
      const after = this.bakeWith(this.seeds).events;
      let edits = this.edits;
      let kept = 0;
      for (const e of before) {
        if (after.some((x) => x.cat === e.cat && hitKey(x) === hitKey(e))) continue; // still there (a fill's roll, or its stroke as a plain fill)
        const r = addHit(edits, after, { cat: e.cat, bar: e.bar, step: e.step, sub: e.sub, vel: e.vel, offsetMs: e.offsetMs, role: 'roll', ...(e.pinned ? { sample: e.pinned } : {}) });
        if (r.edits !== edits) kept++;
        edits = r.edits;
      }
      this.edits = edits;
      return `ROLL GENERATION OFF: new breaks get no rolls.${kept ? ` The ${kept} roll hit${kept === 1 ? '' : 's'} already here ${kept === 1 ? 'is' : 'are'} kept; CLEAR ROLLS deletes them.` : ''}`;
    }
    this.recipe = sanitiseRecipe({ ...this.recipe, rollsOn: true });
    const gen = new Set(this.bakeWith(this.seeds, this.recipe, null).events.filter((e) => e.role === 'roll').map((e) => hitKey(e)));
    const added = this.edits.added.filter((m) => !(m.role === 'roll' && !m.from && gen.has(hitKey(m)) && !this.edits.removed.includes(hitKey(m))));
    if (added.length !== this.edits.added.length) this.edits = { ...this.edits, added };
    return ROLLS_ON_NOTE;
  }

  // ---------------------------------------------------------------- chop

  /** CHOP's settings (the defaults, with the recipe's slice size, until CHOP is first used). */
  get chop(): ChopSettings {
    return this.recipe.chop ?? { ...defaultChop(), slice: CHOP_STYLE[this.recipe.style].slice };
  }

  /**
   * A transformation's settings changed (CHOP, EXPRESSION, DESTROY): the recipe with the patch,
   * baked from the same seeds. Unlike a generation control it never moves the break to a newer
   * GROOVE revision, so the groove underneath stays exactly as it is.
   */
  private transformWith(patch: Partial<Recipe>): void {
    this.recipe = sanitiseRecipe({ ...this.recipe, ...patch });
    this.history.replaceCurrent(this.entry);
    this.rebake();
  }

  /**
   * Hand edits through a transformation change: they are a layer over the result, anchored to the
   * hits they were made on (engine/edits.ts), so they are never deleted. One whose hit CHOP moved
   * follows it; one whose hit is not in the new result waits, inactive, and applies again when
   * that hit comes back. Hits added by hand stay where they were put.
   */
  private get editsNote(): string {
    if (!hasEdits(this.edits)) return '';
    const n = editCount(this.edits);
    const off = this.current.editReport?.inactive ?? 0;
    const moved = this.current.editReport?.followed ?? 0;
    const notes = [moved ? `${moved} followed ${moved === 1 ? 'its hit' : 'their hits'} to ${moved === 1 ? 'its' : 'their'} new place` : '', off ? `${off} waiting for ${off === 1 ? 'its' : 'their'} hit: ${off === 1 ? 'it applies' : 'they apply'} again when it returns` : ''].filter(Boolean);
    return ` Your ${n} hand edit${n === 1 ? ' is' : 's are'} kept${notes.length ? ` (${notes.join('; ')})` : ''}.`;
  }

  /**
   * Change CHOP (ENABLED, AMOUNT, SLICE SIZE, RETRIGGER, the RE-CHOP variant). The pattern is CHOP
   * of the GROOVE baked from the same seeds (never of the previous result), so AMOUNT 0 or off is
   * the GROOVE again and on again is the same chop. No BAKE: the groove, recipe, seeds, kit,
   * samples and mixer are untouched. Always available: hand edits stay (see editsNote). The batch
   * follows, as for any recipe change. A drag is one undo step.
   */
  setChop(patch: Partial<ChopSettings>): void {
    const next = sanitiseChop({ ...this.chop, ...patch })!;
    if (JSON.stringify(next) === JSON.stringify(this.recipe.chop)) return;
    this.transformWith({ chop: next });
    this.status = (next.on ? describeChop(this.current.chop) : 'CHOP off: the pattern is the GROOVE (the settings are kept; on again gives the same chop).') + this.editsNote;
    this.changed(false);
  }

  /** RE-CHOP: another chop of the same GROOVE with the same settings (the next variant). One undo step; redo is the exact chop. */
  reChop(): void {
    if (!this.chop.on) return this.say('RE-CHOP: switch CHOP on first.');
    this.setChop({ variant: this.chop.variant + 1 });
    this.status = `RE-CHOP ${this.chop.variant}: ${this.status}`;
    this.changed(false);
  }

  /** Is CHOP changing this pattern? */
  get chopped(): boolean {
    return chopActive(this.recipe.chop);
  }

  // ---------------------------------------------------------------- roll expression

  /** ROLLS ▸ EXPRESSION (CLASSIC until changed). */
  get rollExpr(): RollExpression {
    return this.recipe.rollExpr ?? defaultRollExpr();
  }

  /** Change the expression by hand (it becomes CUSTOM unless it matches a preset). */
  setRollExpr(patch: Partial<RollExpression>): void {
    const next = sanitiseRollExpr({ ...this.rollExpr, preset: 'custom', ...patch });
    this.transformWith({ rollExpr: next });
    this.status = `ROLL EXPRESSION ${describeExpr(this.recipe.rollExpr)}${this.rollGeneration ? '' : ' ROLL GENERATION is off: it shapes the rolls already in fills and the RATCHETs you make.'}`;
    this.changed(false);
  }

  rollPreset(p: Exclude<RollPreset, 'custom'>): void {
    this.setRollExpr(presetExpr(p, this.rollExpr.variant));
  }

  /** DICE: a new expression for the rolls from a new seed (the rest of the pattern is unchanged). */
  diceRolls(seed = freshSeed()): void {
    this.setRollExpr(diceExpr(seed));
  }

  // ---------------------------------------------------------------- destroy

  get destroySettings(): DestroySettings {
    return this.recipe.destroy ?? defaultDestroy();
  }

  /** CHOP ▸ DESTROY (Phase 12; hand edits stay, as with CHOP). */
  setDestroy(patch: Partial<DestroySettings>): void {
    const next = sanitiseDestroy({ ...this.destroySettings, ...patch })!;
    if (JSON.stringify(next) === JSON.stringify(this.recipe.destroy)) return;
    this.transformWith({ destroy: next });
    this.status = describeDestroy(this.current.destroy, next) + this.editsNote;
    this.changed(false);
  }

  /** DESTROY ▸ DICE: another take of the destruction (a new seed). */
  diceDestroy(seed = freshSeed()): void {
    if (!this.destroySettings.on) return this.say('DESTROY: switch it on first.');
    this.setDestroy({ variant: seed || 1 });
  }

  // ---------------------------------------------------------------- personality and break DNA

  get personality(): PersonalitySetting {
    return this.recipe.personality ?? { id: 'neutral', amount: 0.6 };
  }

  setPersonality(patch: Partial<PersonalitySetting>): void {
    const next = sanitisePersonality({ ...this.personality, ...patch });
    this.recipe = this.fresh({ ...this.recipe, personality: next });
    this.history.replaceCurrent(this.entry);
    this.rebake();
    this.status = describePersonality(this.recipe.personality);
    this.changed(false);
  }

  get dna(): DnaSetting | null {
    return this.recipe.dna ?? null;
  }

  /** BREAK DNA: NONE (null) or one of the DNAs, with its INFLUENCE (kept when the DNA changes). */
  setDna(patch: Partial<DnaSetting> | null): void {
    const next = patch === null ? undefined : sanitiseDna({ id: 'amen', amount: this.dna?.amount ?? 0.6, ...(this.dna ?? {}), ...patch });
    const { dna: _old, ...rest } = this.recipe;
    this.recipe = this.fresh({ ...rest, ...(next ? { dna: next } : {}) });
    this.history.replaceCurrent(this.entry);
    this.rebake();
    this.status = describeDna(this.recipe.dna);
    this.changed(false);
  }

  /**
   * BREAK DNA DICE: a different DNA at random, heard at once on the same seeds and INFLUENCE (the
   * break is rebuilt from its new vocabulary, nothing else changes). One undo step.
   */
  diceDna(roll = Math.random()): void {
    const others = DNA_IDS.filter((id) => id !== this.dna?.id);
    const id = others[Math.min(others.length - 1, Math.floor(roll * others.length))]!;
    this.setDna({ id });
    this.status = `BREAK DNA ${DNA_LABEL[id]}: ${describeDna(this.recipe.dna).replace(/^[^:]*: /, '')}`;
    this.changed(false);
  }

  // ---------------------------------------------------------------- cymbals (revision 4)

  /** The cymbal settings (CLOSED HAT, OPEN HAT, RIDE, CRASH, SUBDIVISION, the relationships, CHOKE). */
  get cym(): CymbalSettings {
    return cymSettings(this.recipe);
  }

  setCym(patch: Partial<CymbalSettings>): void {
    if (this.legacy) return this.say('CYMBALS: this is a LEGACY break, kept exactly as released. RECIPE ▸ USE GROOVE first.');
    const next = sanitiseCym({ ...this.cym, ...patch }, this.recipe.style)!;
    if (JSON.stringify(next) === JSON.stringify(this.recipe.cym)) return;
    this.recipe = this.fresh({ ...this.recipe, cym: next });
    this.history.replaceCurrent(this.entry);
    this.rebake();
  }

  // ---------------------------------------------------------------- DESTROY (Phase 14)

  get destroy2(): DestroySettings2 {
    return this.recipe.destroy2 ?? defaultDestroy2();
  }

  /**
   * Change DESTROY (ENABLED, MASTER AMOUNT, an effect's settings). It works on the finished
   * pattern, hand edits included, so it is never locked; a drag is one undo step.
   */
  setDestroy2(patch: Partial<DestroySettings2>): void {
    const next = sanitiseDestroy2({ ...this.destroy2, ...patch })!;
    if (JSON.stringify(next) === JSON.stringify(this.recipe.destroy2)) return;
    this.transformWith({ destroy2: next });
    this.status = describeDestroy2(this.recipe.destroy2, this.current.destroy2);
    this.changed(false);
  }

  /** One cell of the matrix: may `fx` touch `cat`? */
  setDestroyCell(cat: Category, fx: DestroyEffect, on: boolean): void {
    const cur = this.destroy2.matrix[cat] ?? [];
    const list = on ? [...new Set([...cur, fx])] : cur.filter((x) => x !== fx);
    this.setDestroy2({ matrix: { ...this.destroy2.matrix, [cat]: list } });
  }

  /** RE-DESTROY: another take (a new draw of which hits each effect takes), same settings. One undo step. */
  reDestroy(): void {
    if (!this.destroy2.on) return this.say('DESTROY: switch it on first.');
    this.setDestroy2({ take: this.destroy2.take + 1 });
  }

  /** CHAOS: every effect the matrix uses gets random settings (the matrix and MASTER AMOUNT stay). One undo step. */
  chaos(seed = freshSeed()): void {
    this.setDestroy2(chaosDestroy(this.destroy2, seed));
    this.status = `CHAOS: ${describeDestroy2(this.recipe.destroy2, this.current.destroy2)}`;
    this.changed(false);
  }

  /** Remove the Phase 12 CHOP ▸ DESTROY a saved break may still have (the DESTROY tab offers it). */
  removeLegacyDestroy(): void {
    if (!this.recipe.destroy) return;
    const { destroy: _d, ...rest } = this.recipe;
    this.recipe = sanitiseRecipe(rest as Recipe);
    this.history.replaceCurrent(this.entry);
    this.rebake();
    this.say('The earlier CHOP ▸ DESTROY of this break is removed (⌘Z brings it back).');
  }

  /** A short line comparing this break with the same seeds played by NEUTRAL (the PERSONALITY tab's feedback). */
  private feedbackCache: [string, string] = ['', ''];
  get personaFeedback(): string {
    const p = this.recipe.personality;
    if (!p || p.id === 'neutral' || !p.amount) return 'NEUTRAL: the recipe as it is.';
    const key = entryKey({ recipe: this.recipe, seeds: this.seeds });
    if (this.feedbackCache[0] === key) return this.feedbackCache[1];
    const { personality: _p, ...plain } = this.recipe;
    const base = this.bakeWith(this.seeds, plain as Recipe, null).events;
    const now = this.bakeWith(this.seeds, this.recipe, null).events;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const off = (cat: string, evs: typeof now) => mean(evs.filter((e) => e.cat === cat).map((e) => e.offsetMs));
    const ms = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
    const line = `${PERSONALITY_LABEL[p.id]} vs NEUTRAL: ${base.length} → ${now.length} hits, velocity ${Math.round(mean(base.map((e) => e.vel)))} → ${Math.round(mean(now.map((e) => e.vel)))}, kick ${ms(off('kick', now) - off('kick', base))} ms, snare ${ms(off('snare', now) - off('snare', base))} ms, hats ${ms(off('hat', now) - off('hat', base))} ms.`;
    this.feedbackCache = [key, line];
    return line;
  }

  // ---------------------------------------------------------------- regen track

  /**
   * REGEN TRACK: the selected tracks generated again, fitted to the rest of the pattern, and every
   * other track left exactly as it is. An explicit request, so it applies whatever FREEZE says.
   * One undo step and one history entry; the batch is kept (only the working pattern changes);
   * playback follows with the SWITCH mode like any new break. Hand edits stay (those on the old
   * track's generated hits become inactive and come back with ⌘Z).
   */
  regenTracks(cats: Category[] = this.trackSel): void {
    if (!cats.length) return this.say('REGEN TRACK: select a track first (click its name on the left of the pattern).');
    if (this.legacy) return this.say('REGEN TRACK works on the current GROOVE: this is a LEGACY break. RECIPE ▸ USE GROOVE first.');
    if (!this.current.events.some((e) => cats.includes(e.cat))) return this.say(`REGEN TRACK: ${cats.map((c) => CATEGORY_LABEL[c]).join(', ')} has no hits in this pattern (its part is played on another track), so there is nothing to regenerate.`);
    const before = this.current.editReport?.inactive ?? 0;
    this.seeds = { ...this.seeds, regen: regenStep(this.seeds.regen, cats) };
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    const lost = (this.current.editReport?.inactive ?? 0) - before;
    const names = cats.map((c) => CATEGORY_LABEL[c]).join(', ');
    this.status = `Regenerated ${names}: everything else is as it was (⌘Z goes back).${this.frozen.beat || this.frozen.detail ? ' FREEZE does not stop REGEN TRACK: it was asked for.' : ''}${lost > 0 ? ` ${lost} hand edit${lost === 1 ? ' was' : 's were'} on the old track (kept, not active).` : ''}`;
    this.changed();
  }

  /** The tracks selected for REGEN TRACK (click a row name; shift-click adds). Not part of the break. */
  trackSel: Category[] = [];

  selectTrack(cat: Category, add = false): void {
    this.trackSel = add ? (this.trackSel.includes(cat) ? this.trackSel.filter((c) => c !== cat) : CATEGORIES.filter((c) => c === cat || this.trackSel.includes(c))) : this.trackSel.length === 1 && this.trackSel[0] === cat ? [] : [cat];
    this.changed(false);
  }

  /** The roll hits CLEAR ROLLS would delete that were made or kept by hand (RATCHET, kept roll hits): the UI asks first. */
  get manualRollHits(): number {
    return this.current.events.filter((e) => e.role === 'roll' && (e.manual === 'added' || e.manual === 'moved')).length;
  }

  /**
   * CLEAR ROLLS: no rolls in this pattern, one undo step. The generated rolls (the ROLLS
   * transformation) go by switching ROLL GENERATION off (RE-ROLL or the switch brings rolls back);
   * the rest (a fill's roll, CHOP's retriggers, roll hits made or kept by hand) are deleted as hand
   * edits. No other hit is touched.
   */
  clearRolls(): void {
    const all = this.current.events.filter((e) => e.role === 'roll' && e.ref);
    if (!all.length) return this.say('There are no rolls in this pattern.');
    const generated = this.rollLayer && all.some((e) => e.rollOf && !e.manual);
    let edits = this.layer;
    for (const e of all) if (!(generated && e.rollOf && !e.manual)) edits = deleteHit(edits, e.ref!);
    const deleted = all.length - (generated ? all.filter((e) => e.rollOf && !e.manual).length : 0);
    if (generated) {
      this.rollGeneration = false;
      this.recipe = sanitiseRecipe({ ...this.recipe, rollsOn: false });
    }
    this.edits = edits;
    this.selected = null;
    this.status = `Cleared the rolls${generated ? ': ROLL GENERATION is off (switch it on, or RE-ROLL, for rolls again)' : ''}${deleted ? `${generated ? ';' : ':'} ${deleted} roll hit${deleted === 1 ? '' : 's'} deleted` : ''}. No other hit changed; ⌘Z brings them back.`;
    this.applyEdits();
  }

  /** Delete several hits as one action (one undo step). */
  deleteHits(refs: string[], say?: string): void {
    let edits = this.layer;
    for (const r of refs) if (findRef(this.current.events, r)) edits = deleteHit(edits, r);
    if (this.unchanged(edits)) return;
    this.commit({ edits, ref: null }, !!this.selected && refs.includes(this.selected), { say: say ?? `Deleted ${refs.length} hit${refs.length === 1 ? '' : 's'}.` });
  }

  /** A break from the history or the favourites, exactly as it was: with its own hand edits. */
  private restore(e: SeedEntry, samples?: SampleSettings): void {
    this.recipe = sanitiseRecipe(e.recipe);
    this.seeds = { ...e.seeds, ...(e.seeds.mut ? { mut: e.seeds.mut.map((m) => ({ ...m })) } : {}) };
    this.seedName = e.name;
    if (samples) this.samples = sanitiseSampleSettings(samples);
    this.edits = sanitiseEdits(e.edits, CATEGORIES);
    this.selected = null;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    // it follows ROLL GENERATION as every break does (the ROLLS layer just switches; an older engine keeps its rolls as hits)
    if (this.rollsDisagree) {
      this.switchRolls(this.rollGeneration);
      this.show(this.bakeWith(this.seeds));
      this.history.replaceCurrent(this.entry);
    }
  }

  historyBack(): void {
    const e = this.history.back();
    if (!e) return this.say('No earlier seed in the history.');
    this.restore(e);
    this.status = `Back: ${entryLabel(e)}.`;
    this.changed();
  }

  historyForward(): void {
    const e = this.history.forward();
    if (!e) return this.say('No later seed in the history.');
    this.restore(e);
    this.status = `Forward: ${entryLabel(e)}.`;
    this.changed();
  }

  historyGo(i: number): void {
    const e = this.history.go(i);
    if (!e) return;
    this.restore(e);
    this.status = `From the history: ${entryLabel(e)}.`;
    this.changed();
  }

  // ---------------------------------------------------------------- favourites

  get isFavourite(): boolean {
    const k = entryKey(this.entry);
    return this.favourites.some((f) => entryKey(f) === k);
  }

  toggleFavourite(): void {
    const k = entryKey(this.entry);
    const had = this.favourites.find((f) => entryKey(f) === k);
    if (had) {
      this.favourites = this.favourites.filter((f) => f !== had);
      this.status = `Removed from favourites: ${entryLabel(had)}.`;
    } else {
      const f: Favourite = { ...JSON.parse(JSON.stringify(this.entry)), id: `${Date.now().toString(36)}-${this.favourites.length}`, samples: JSON.parse(JSON.stringify(this.samples)), savedAt: Date.now() };
      this.favourites = [f, ...this.favourites].slice(0, FAVOURITES_MAX);
      this.status = `Saved to favourites: ${entryLabel(f)}. Recipe, seeds and sample settings are kept.`;
    }
    writeJson(FAVOURITES_KEY, this.favourites);
    this.changed();
  }

  loadFavourite(id: string): void {
    const f = this.favourites.find((x) => x.id === id);
    if (!f) return;
    this.restore(f, f.samples);
    this.remember();
    this.status = `Favourite: ${entryLabel(f)}.`;
    this.changed();
  }

  removeFavourite(id: string): void {
    this.favourites = this.favourites.filter((x) => x.id !== id);
    writeJson(FAVOURITES_KEY, this.favourites);
    this.changed();
  }

  // ---------------------------------------------------------------- freeze

  toggleFreeze(l: Layer): void {
    this.frozen[l] = !this.frozen[l];
    this.changed();
  }

  /** FREEZE RHYTHM: beat, detail and feel together (hit placement and performance). */
  get rhythmFrozen(): boolean {
    return this.frozen.beat && this.frozen.detail && this.frozen.feel;
  }
  toggleRhythm(): void {
    const v = !this.rhythmFrozen;
    this.frozen.beat = this.frozen.detail = this.frozen.feel = v;
    this.changed();
  }

  get frozenCount(): number {
    return LAYERS.filter((l) => this.frozen[l]).length;
  }

  /** FREEZE EDITS: carry the hand edits onto new breaks (they are positional: "no kick on 1.3", "a ghost on 2.4"). */
  toggleKeepEdits(): void {
    this.keepEdits = !this.keepEdits;
    this.status = this.keepEdits ? 'FREEZE EDITS: new breaks keep your hand edits (deleted, added, moved and changed hits, by position).' : 'Hand edits stay with their break: a new break starts unedited (◀ returns to an edited one).';
    this.changed();
  }

  // ---------------------------------------------------------------- hand editing

  get hasEdits(): boolean {
    return hasEdits(this.edits);
  }

  /** A layer saved before Phase 17, made anchored for its next edit (the same notes play); kept until the layer changes. */
  private upgraded: { from: Edits; to: Edits } | null = null;

  /** The edit layer that hand edits build on: anchored (engine/edits.ts upgradeEdits). */
  private get layer(): Edits {
    if (this.edits.v === 2) return this.edits;
    if (this.upgraded?.from !== this.edits) this.upgraded = { from: this.edits, to: upgradeEdits(this.edits, this.current.editReport) };
    return this.upgraded.to;
  }

  /** Is this the layer as it is (an operation that changed nothing)? */
  private unchanged(e: Edits): boolean {
    return e === this.edits || (this.upgraded?.from === this.edits && e === this.upgraded.to);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * An undo step: the break (its events, no audio), recipe, seeds, PICK modes, hand edits, batch,
   * each sample's category (ids and names only: undo never deletes a sample) and the WILDCARD
   * report. Selection and the report alone are not steps.
   */
  private snapshot(): string {
    return JSON.stringify({ current: this.current, recipe: this.recipe, seeds: this.seeds,
      seedName: this.seedName, samples: this.samples, edits: this.edits,
      selected: this.selected, batch: this.batch, picked: this.picked, rollGeneration: this.rollGeneration,
      cats: this.ingredients.categories?.() ?? {}, report: this.wildcardReport });
  }

  /** Re-apply the edit layer to the current seeds: playback follows at once (not at the loop point). */
  private applyEdits(): void {
    const b = this.bakeWith(this.seeds);
    this.current = b;
    this.player.update(b);
    if (this.picked !== null && this.batch[this.picked]) this.batch[this.picked] = b;
    if (this.selected && !findRef(b.events, this.selected)) this.selected = null;
    this.history.replaceCurrent(this.entry);
    this.changed();
  }

  /**
   * Start a gesture (a drag that moves a hit, or paints several): one undo step for all of it.
   * Operations inside it pass `gesture`.
   */
  beginGesture(): void {
    if (this.gesture) return;
    this.gesture = true;
  }

  endGesture(): void {
    this.gesture = false;
    this.recordChange();
    this.changed(false);
  }

  /** Compare complete lightweight states; selection alone is not a pattern action. */
  private recordChange(): void {
    if (!this.baseline || this.gesture) return;
    const next = this.snapshot();
    const pattern = (s: string) => {
      const { selected: _selected, extras: _extras, report: _report, ...state } = JSON.parse(s);
      return JSON.stringify(state);
    };
    if (pattern(next) !== pattern(this.baseline)) {
      this.patchDirty = true;
      this.undoStack.push(this.baseline);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.baseline = next;
  }

  /** Commit a new edit layer; pointer gestures group intermediate changes. */
  private commit(r: EditResult, select: boolean, opts: { gesture?: boolean; say?: string } = {}): boolean {
    if (this.unchanged(r.edits)) {
      if (select && r.ref) this.select(r.ref);
      return false;
    }
    this.edits = r.edits;
    if (select) this.selected = r.ref;
    if (opts.say !== undefined) this.status = opts.say;
    this.applyEdits();
    return true;
  }

  select(ref: string | null): void {
    if (ref === this.selected) return;
    this.selected = ref && findRef(this.current.events, ref) ? ref : null;
    this.changed(false);
  }

  get selectedEvent() {
    return findRef(this.current.events, this.selected);
  }

  /** Add a hit by hand at a grid tick of the break; it becomes the selected hit. Returns its ref. */
  addHit(cat: Category, tick: number, gesture = false): string | null {
    const p = posOf(tick);
    if (p.bar < 0 || p.bar >= this.recipe.bars) return null;
    // PAINT: the sample chosen for this track, exactly (no PICK mode); none chosen, the PICK mode as before
    const sample = this.paintSample(cat);
    const r = addHit(this.layer, this.current.events, { cat, ...p, ...(sample ? { sample } : {}) });
    this.commit(r, true, { gesture, say: this.unchanged(r.edits) ? `There is already a ${CATEGORY_LABEL[cat]} hit at ${posLabel(p)}: selected.` : `Added ${CATEGORY_LABEL[cat]} at ${posLabel(p)} by hand${sample ? ` (${this.ingredients.name(sample)})` : ''}.` });
    const e = this.selectedEvent;
    if (e?.sample && !gesture) void this.player.audition(e.cat, e.sample, e.vel, e);
    return r.ref;
  }

  deleteHit(ref: string | null = this.selected): void {
    const e = findRef(this.current.events, ref);
    if (!e || !ref) return;
    const label = refLabel(this.current.events, ref);
    this.commit({ edits: deleteHit(this.layer, ref), ref: null }, ref === this.selected, { say: `Deleted ${label}${e.manual === 'added' ? '' : ' (⌘Z brings it back)'}.` });
  }

  /** Move a hit to a grid tick (same category). False if refused (another hit of the category is there). */
  moveHit(ref: string, tick: number, gesture = false): boolean {
    const p = posOf(tick);
    if (p.bar < 0 || p.bar >= this.recipe.bars) return false;
    const r = moveHit(this.layer, this.current.events, ref, p);
    if (!r.ref) return false;
    this.commit(r, true, { gesture, say: `Moved to ${posLabel(p)}.` });
    return true;
  }

  /** Move the selected hit by `ticks` (keys and the ◀ ▶ buttons). */
  nudge(ticks: number): void {
    const e = this.selectedEvent;
    if (!e) return;
    const t = e.bar * 16 * TPS + e.step * TPS + e.sub + ticks;
    if (t < 0 || t >= this.recipe.bars * 16 * TPS) return this.say('That would move the hit out of the pattern.');
    if (!this.moveHit(this.selected!, t)) this.say(`There is already a ${CATEGORY_LABEL[e.cat]} hit there.`);
  }

  setHitVelocity(v: number, ref: string | null = this.selected): void {
    if (!ref) return;
    this.commit(setVelocity(this.layer, this.current.events, ref, v), false);
  }

  setHitTiming(ms: number, ref: string | null = this.selected): void {
    if (!ref) return;
    this.commit(setTiming(this.layer, this.current.events, ref, ms), false);
  }

  setHitSample(sample: string | null, ref: string | null = this.selected): void {
    if (!ref) return;
    this.commit(setSample(this.layer, this.current.events, ref, sample), false, { say: sample ? `This hit plays ${this.ingredients.name(sample)}.` : 'This hit’s sample is chosen by the PICK mode again.' });
    const e = findRef(this.current.events, ref);
    if (e?.sample) void this.player.audition(e.cat, e.sample, e.vel, e);
  }

  /** EXPRESSION: transpose the hit (semitones, by playback rate). */
  setHitPitch(st: number, ref: string | null = this.selected): void {
    if (!ref) return;
    if (this.commit(setPitch(this.layer, this.current.events, ref, st), false)) this.status = `Pitch ${fmtPitch(findRef(this.current.events, ref)?.pitch ?? 0)} (by playback rate: higher is shorter).`;
  }

  /** EXPRESSION: play the hit backwards (or forwards again). */
  setHitReverse(on: boolean, ref: string | null = this.selected): void {
    if (!ref) return;
    this.commit(setReverse(this.layer, this.current.events, ref, on), false, { say: on ? 'Reversed: the sample plays backwards from this hit.' : 'Forwards again.' });
    const e = findRef(this.current.events, ref);
    if (e?.sample) void this.player.audition(e.cat, e.sample, e.vel, e);
  }

  /** RATCHET: split the hit into n strokes over `span` grid ticks, with the ROLLS tab's EXPRESSION. One undo step. */
  ratchet(n: number, span: number, ref: string | null = this.selected): void {
    if (!ref) return;
    const { preset: _p, variant: _v, ratchet: _r, ...shape } = this.rollExpr;
    const r = ratchetHit(this.layer, this.current.events, ref, n, span, shape, this.recipe.bpm, this.recipe.bars);
    if (!r.ref) return this.say('No room to ratchet this hit there.');
    this.commit(r, true, { say: `Ratchet ×${n} over ${RATCHET_SPAN_LABEL[span] ?? `${span} ticks`} (${describeExpr(this.recipe.rollExpr)}) ⌘Z undoes it.` });
  }

  duplicateHit(ref: string | null = this.selected): void {
    if (!ref) return;
    const r = duplicateHit(this.layer, this.current.events, ref, this.snap, this.recipe.bars);
    if (!r.ref) return this.say('No free place for a copy after this hit.');
    this.commit(r, true, { say: `Duplicated: ${refLabel(this.current.events, ref)} → ${refLabel(this.bakeWith(this.seeds, this.recipe, r.edits).events, r.ref)}.` });
  }

  /** Back to how the generator made this hit (a moved hit returns to its place). */
  revertHit(ref: string | null = this.selected): void {
    if (!ref) return;
    const r = revertHit(this.layer, ref);
    if (!r.ref) return this.say('This hit was placed by hand: there is nothing generated to go back to (DEL removes it).');
    this.commit(r, true, { say: 'Back to the generated hit.' });
  }

  /** Remove every hand edit of this break (undoable). */
  revertAll(): void {
    if (!hasEdits(this.edits)) return this.say('This break has no hand edits.');
    const n = editCount(this.edits);
    this.commit({ edits: noEdits(), ref: null }, true, { say: `Removed ${n} hand edit${n === 1 ? '' : 's'}: the break is as generated (⌘Z undoes this).` });
  }

  undo(): void {
    this.endGesture();
    const s = this.undoStack.pop();
    if (!s) return this.say('Nothing to undo.');
    this.redoStack.push(hasExtras(s) ? withExtras(this.snapshot(), this.extras()) : this.snapshot());
    this.restoreSnapshot(s);
    this.say('Undone.');
  }

  redo(): void {
    this.endGesture();
    const s = this.redoStack.pop();
    if (!s) return this.say('Nothing to redo.');
    this.undoStack.push(hasExtras(s) ? withExtras(this.snapshot(), this.extras()) : this.snapshot());
    this.restoreSnapshot(s);
    this.say('Redone.');
  }

  private extras(): Extras {
    return { mix: JSON.parse(JSON.stringify(this.mix)) as MixState, output: this.output.config };
  }

  private restoreSnapshot(s: string): void {
    const { extras, cats, report, ...o } = JSON.parse(s) as Pick<App, 'current' | 'recipe' | 'seeds' | 'seedName' | 'samples' | 'edits' | 'selected' | 'batch' | 'picked' | 'rollGeneration'> & { extras?: Extras; cats?: ReturnType<Ingredients['categories']>; report?: WildcardReport | null };
    Object.assign(this, o);
    // the samples' categories as they were (a sample added since stays; none is ever deleted)
    if (cats) this.ingredients.restoreCategories?.(cats);
    this.wildcardReport = report ?? null;
    if (extras) {
      // a WILDCARD step: the mixer and the output chain come back too
      this.mix = sanitiseMix(extras.mix);
      this.player.setMix(this.mix);
      this.gesture = true;
      this.output.load(extras.output);
      this.gesture = false;
    }
    // The player applies the selected live transition policy to restored snapshots.
    this.player.update(this.current);
    if (this.selected && !findRef(this.current.events, this.selected)) this.selected = null;
    this.history.replaceCurrent(this.entry);
    this.baseline = this.snapshot();
    this.changed();
  }

  /** Replace only sound selection, preserving every hit and the undo/redo stacks. */
  kitLoaded(settings: SampleSettings): void {
    this.samples = sanitiseSampleSettings(settings);
    this.checkPaint();
    const reassign = (b: Break): Break => {
      const events: Break['events'] = b.events.map(e => ({ ...e, sample: null, sampleWhy: undefined, pinned: undefined }));
      selectSamples(events, this.ingredients.kit(), b.seeds.kit, { settings: this.samples, loudness: this.ingredients.loudness() }, id => this.ingredients.name(id));
      events.forEach((e, i) => {
        const pinned = b.events[i]!.pinned;
        if (pinned && this.ingredients.items.some(it => it.id === pinned && it.status === 'ready')) { e.sample = pinned; e.sampleWhy = 'Sample chosen by hand'; }
        if (pinned) Object.assign(e, { pinned });
        else delete (e as { pinned?: string }).pinned;
      });
      return { ...b, events };
    };
    this.current = reassign(this.current);
    this.batch = this.batch.map(reassign);
    this.player.update(this.current);
    this.baseline = this.snapshot();
    this.save();
    for (const f of this.listeners) f();
  }

  // ---------------------------------------------------------------- PAINT: a chosen sample for hand-placed hits

  /** The sample a hand-placed hit of this track plays (null: its PICK mode chooses, as before). */
  paintSample(cat: Category): string | null {
    const id = this.paint[cat];
    return id && this.ingredients.kit()[cat].includes(id) ? id : null;
  }

  /**
   * Choose (or, given the chosen one or null, release) the sample new hits of `cat` play. Not a
   * preview: nothing sounds. The choice belongs to that track only.
   */
  setPaint(cat: Category, id: string | null): void {
    if (!id || this.paint[cat] === id) {
      if (!this.paint[cat]) return;
      delete this.paint[cat];
      this.status = `PAINT off for ${CATEGORY_LABEL[cat]}: hits placed by hand take its PICK mode again.`;
    } else {
      this.paint[cat] = id;
      this.status = `PAINT ${CATEGORY_LABEL[cat]}: hits placed by hand on the ${CATEGORY_LABEL[cat]} row play ${this.ingredients.name(id)}. Click it again (or another sample) to change; other rows are unaffected.`;
    }
    this.save();
    for (const f of this.listeners) f();
  }

  /**
   * Drop PAINT choices whose sample is no longer in its track (another kit, removed, moved to
   * another category): that track goes back to its PICK mode, never to a stale sample. The sample
   * itself is not touched. Samples still loading count as there.
   */
  private checkPaint(): void {
    const gone: Category[] = [];
    for (const c of CATEGORIES) {
      const id = this.paint[c];
      if (id && !(this.ingredients.items ?? []).some((it) => it.id === id && it.cat === c)) {
        delete this.paint[c];
        gone.push(c);
      }
    }
    if (gone.length) this.status = `PAINT: the chosen ${gone.map((c) => CATEGORY_LABEL[c]).join(', ')} sample${gone.length === 1 ? ' is' : 's are'} not in ${gone.length === 1 ? 'that track' : 'those tracks'} now; hits placed by hand there take the PICK mode again.`;
  }

  setSnap(ticks: number): void {
    if (!(SNAPS as readonly number[]).includes(ticks)) return;
    this.snap = ticks;
    this.changed();
  }

  // ---------------------------------------------------------------- samples

  setSampleSettings(cat: Category, patch: Partial<CategorySamples>): void {
    const cur = this.samples[cat] ?? { mode: 'auto' };
    this.samples = { ...this.samples, [cat]: { ...cur, ...patch } };
    this.rebake();
  }

  // ---------------------------------------------------------------- solo / mute

  setChannel(cat: Category, gain: number, pan: number): void {
    this.mix[cat].gain = safeGain(gain); this.mix[cat].pan = safePan(pan);
    this.player.setMix(this.mix); this.changed();
  }
  toggleSolo(cat: Category): void {
    this.mix[cat].solo = !this.mix[cat].solo;
    this.player.setMix(this.mix);
    this.changed();
  }
  toggleMute(cat: Category): void {
    this.mix[cat].mute = !this.mix[cat].mute;
    this.player.setMix(this.mix);
    this.changed();
  }
  clearMix(): void {
    for (const c of Object.values(this.mix)) { c.mute = false; c.solo = false; }
    this.player.setMix(this.mix);
    this.changed();
  }
  audible(cat: Category): boolean {
    return audible(this.mix, cat);
  }
}
