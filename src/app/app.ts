/**
 * The Breakery's state and actions, independent of the interface: the recipe, the seeds (and
 * their name), what is frozen, the current break, the batch of candidates, seed history and
 * favourites, sample-selection settings and solo/mute. Changing the recipe re-bakes the SAME seeds,
 * so each control's effect is heard on the same break; BAKE draws new seeds for every layer that
 * is not frozen; MUTATE varies the current groove a little.
 */
import { addHit, deleteHit, describeEdits, duplicateHit, editCount, findRef, hasEdits, moveHit, noEdits, posLabel, posOf, refLabel, revertHit, sanitiseEdits, setSample, setTiming, setVelocity, type EditResult, type Edits } from '../engine/edits';
import { bake, mutate, parseSeed, reseed, sanitiseRecipe, seedLabel, seedsFrom } from '../engine/generate';
import { freshSeed } from '../engine/rng';
import { sanitiseSampleSettings, type CategorySamples, type SampleSettings } from '../engine/samples';
import { defaultRecipe, STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, CATEGORY_LABEL, CURRENT_ENGINE, LAYERS, TPS, type Break, type Category, type Engine, type Layer, type Recipe, type Seeds, type Style } from '../engine/types';
import type { Ingredients } from '../audio/ingredients';
import type { Player } from '../audio/player';
import { defaultTakeaway, type TakeawayOptions } from '../audio/takeaway';
import { audible, emptyMix, sanitiseMix, type MixState } from './mix';
import { diceName, entryKey, entryLabel, FAVOURITES_MAX, sanitiseFavourite, SeedHistory, type Favourite, type SeedEntry } from './seeds';

export const BATCH_SIZE = 8;
/** Grid for placing and moving hits by hand, in grid ticks (12 per sixteenth). */
export const SNAPS = [12, 6, 3, 8, 4] as const;
export const SNAP_LABEL: Record<number, string> = { 12: '1/16', 6: '1/32', 3: '1/64', 8: '1/16T', 4: '1/32T' };
const UNDO_LIMIT = 50;
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
}

const noFreeze = (): Record<Layer, boolean> => ({ beat: false, detail: false, feel: false, kit: false });

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
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private baseline = '';
  private gesture = false;
  private listeners: (() => void)[] = [];

  constructor(public ingredients: Ingredients, public player: Player, initialSeed?: string) {
    const s = readJson(STATE_KEY) as Partial<Saved> | null;
    this.recipe = s?.recipe ? sanitiseRecipe(s.recipe) : defaultRecipe('funk', 2);
    const fromUrl = initialSeed !== undefined ? parseSeed(initialSeed) : null;
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
    this.history = SeedHistory.from(readJson(HISTORY_KEY));
    const favs = readJson(FAVOURITES_KEY);
    this.favourites = Array.isArray(favs) ? favs.map(sanitiseFavourite).filter((f): f is Favourite => !!f) : [];
    player.loop = s?.loop ?? true;
    player.setLevel(typeof s?.level === 'number' ? s.level : player.level);
    player.setMix(this.mix);
    this.current = this.bakeWith(this.seeds);
    player.setBreak(this.current);
    player.onSwap = () => this.changed(false);
    this.remember();
    this.baseline = this.snapshot();
    if (s?.recipe && this.recipe.engine === 1) this.status = 'Restored with ENGINE 1, so this break sounds as it did. Switch RECIPE ▸ ENGINE to 2 to hear the new generator on the same seed.';
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
    const s: Saved = { recipe: this.recipe, seeds: this.seeds, seedName: this.seedName, frozen: this.frozen, loop: this.player.loop, level: this.player.level, takeaway: this.takeawayOpts, samples: this.samples, mix: this.mix, edits: this.edits, keepEdits: this.keepEdits, snap: this.snap };
    writeJson(STATE_KEY, s);
    writeJson(HISTORY_KEY, this.history.toJSON());
  }

  /** Bake with the current recipe, kit, sample settings and (by default) the hand edits. */
  private bakeWith(seeds: Seeds, recipe = this.recipe, edits: Edits | null = this.edits): Break {
    return bake(recipe, seeds, this.ingredients.kit(), { settings: this.samples, loudness: this.ingredients.loudness() }, (id) => this.ingredients.name(id), edits);
  }

  private show(b: Break): void {
    this.current = b;
    this.player.setBreak(b);
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
    const before = this.current.editReport;
    this.show(this.bakeWith(this.seeds));
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

  setRecipe(patch: Partial<Recipe>): void {
    this.recipe = sanitiseRecipe({ ...this.recipe, ...patch });
    this.history.replaceCurrent(this.entry);
    this.rebake();
  }

  /** Choose a style: its defaults replace the controls (BPM too). Keeps the engine where it can. */
  setStyle(style: Style): void {
    this.recipe = sanitiseRecipe(defaultRecipe(style, this.recipe.bars, this.recipe.engine));
    this.history.replaceCurrent(this.entry);
    this.rebake();
  }

  setEngine(engine: Engine): void {
    if (engine === 1 && this.recipe.engine !== 1) {
      const r = sanitiseRecipe({ ...this.recipe, engine: 1 });
      if (r.engine !== 1) {
        this.say(`ENGINE 1 only knows FUNK, HIP-HOP, JUNGLE and BROKEN. ${STYLE_DEFS[this.recipe.style].label} needs ENGINE 2.`);
        return;
      }
    }
    this.setRecipe({ engine });
    this.say(engine === CURRENT_ENGINE ? 'ENGINE 2: the current generator.' : `ENGINE 1: the first release’s generator, kept so its breaks reproduce. Same seed, same recipe: compare by ear.${this.seeds.mut?.length ? ' (Mutations apply to engine 2 only.)' : ''}`);
  }

  resetRecipe(): void {
    this.setStyle(this.recipe.style);
  }

  /** BAKE: new seeds for the layers that are not frozen. */
  bake(): void {
    const note = this.leaveEdits();
    this.seeds = reseed(this.seeds, this.frozen);
    this.seedName = null;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `Baked: ${STYLE_DEFS[this.recipe.style].label}, seed ${this.seeds.beat}.${note}`;
    this.changed();
  }

  /** BATCH: several candidates from new seeds (frozen layers kept); the first becomes current. */
  bakeBatch(n = BATCH_SIZE): void {
    const note = this.leaveEdits();
    this.batch = [];
    for (let i = 0; i < n; i++) this.batch.push(this.bakeWith(reseed(this.seeds, this.frozen)));
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
    this.seedName = null;
    // a candidate is baked with the edits it was made with; bake it again with the current ones
    this.show(hasEdits(this.edits) || b.edits ? this.bakeWith(this.seeds) : b);
    this.batch[i] = this.current;
    this.remember();
    this.changed();
  }

  /** Set every layer from one seed (a number, or a name). */
  setSeed(seed: number, name: string | null = null): void {
    const note = this.leaveEdits();
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
    const had = hasEdits(this.edits) && !this.keepEdits;
    this.setSeed(p.seed, p.name);
    const note = had ? ' Your hand edits stay with the previous break (◀).' : '';
    this.status = (p.name ? `Seed “${p.name}” (${p.seed}): the same name always bakes the same break with the same recipe.` : `Seed ${p.seed}.`) + note;
    this.changed(false);
    return true;
  }

  /** DICE: a new random named seed for every layer. */
  dice(): void {
    const name = diceName();
    this.setSeedText(name);
    this.status = `Rolled “${name}”.`;
    this.changed(false);
  }

  /** MUTATE: a related variation of this break (the layers that are not frozen). */
  mutate(): void {
    const next = mutate(this.seeds, this.frozen);
    if (!next) {
      this.say('Nothing to mutate: BEAT and DETAIL are both frozen.');
      return;
    }
    if (this.recipe.engine === 1) {
      this.say('MUTATE needs ENGINE 2 (engine 1 is kept exactly as released).');
      return;
    }
    const note = this.leaveEdits();
    this.seeds = next;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `Mutation ${next.mut!.length}: the groove varied a little${this.frozen.beat ? ' (kick and snare frozen)' : this.frozen.detail ? ' (detail frozen)' : ''}. ← goes back.${note}`;
    this.changed();
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

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private snapshot(): string {
    return JSON.stringify({ current: this.current, recipe: this.recipe, seeds: this.seeds,
      seedName: this.seedName, samples: this.samples, edits: this.edits,
      selected: this.selected, batch: this.batch, picked: this.picked });
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
      const { selected: _selected, ...state } = JSON.parse(s);
      return JSON.stringify(state);
    };
    if (pattern(next) !== pattern(this.baseline)) {
      this.undoStack.push(this.baseline);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.baseline = next;
  }

  /** Commit a new edit layer; pointer gestures group intermediate changes. */
  private commit(r: EditResult, select: boolean, opts: { gesture?: boolean; say?: string } = {}): boolean {
    if (r.edits === this.edits) {
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
    const r = addHit(this.edits, this.current.events, { cat, ...p });
    this.commit(r, true, { gesture, say: r.edits === this.edits ? `There is already a ${CATEGORY_LABEL[cat]} hit at ${posLabel(p)}: selected.` : `Added ${CATEGORY_LABEL[cat]} at ${posLabel(p)} by hand.` });
    const e = this.selectedEvent;
    if (e?.sample && !gesture) void this.player.audition(e.cat, e.sample, e.vel);
    return r.ref;
  }

  deleteHit(ref: string | null = this.selected): void {
    const e = findRef(this.current.events, ref);
    if (!e || !ref) return;
    const label = refLabel(this.current.events, ref);
    this.commit({ edits: deleteHit(this.edits, ref), ref: null }, ref === this.selected, { say: `Deleted ${label}${e.manual === 'added' ? '' : ' (⌘Z brings it back)'}.` });
  }

  /** Move a hit to a grid tick (same category). False if refused (another hit of the category is there). */
  moveHit(ref: string, tick: number, gesture = false): boolean {
    const p = posOf(tick);
    if (p.bar < 0 || p.bar >= this.recipe.bars) return false;
    const r = moveHit(this.edits, this.current.events, ref, p);
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
    this.commit(setVelocity(this.edits, this.current.events, ref, v), false);
  }

  setHitTiming(ms: number, ref: string | null = this.selected): void {
    if (!ref) return;
    this.commit(setTiming(this.edits, this.current.events, ref, ms), false);
  }

  setHitSample(sample: string | null, ref: string | null = this.selected): void {
    if (!ref) return;
    this.commit(setSample(this.edits, this.current.events, ref, sample), false, { say: sample ? `This hit plays ${this.ingredients.name(sample)}.` : 'This hit’s sample is chosen by the PICK mode again.' });
    const e = findRef(this.current.events, ref);
    if (e?.sample) void this.player.audition(e.cat, e.sample, e.vel);
  }

  duplicateHit(ref: string | null = this.selected): void {
    if (!ref) return;
    const r = duplicateHit(this.edits, this.current.events, ref, this.snap, this.recipe.bars);
    if (!r.ref) return this.say('No free place for a copy after this hit.');
    this.commit(r, true, { say: `Duplicated: ${refLabel(this.current.events, ref)} → ${refLabel(this.bakeWith(this.seeds, this.recipe, r.edits).events, r.ref)}.` });
  }

  /** Back to how the generator made this hit (a moved hit returns to its place). */
  revertHit(ref: string | null = this.selected): void {
    if (!ref) return;
    const r = revertHit(this.edits, ref);
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
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(s);
    this.say('Undone.');
  }

  redo(): void {
    this.endGesture();
    const s = this.redoStack.pop();
    if (!s) return this.say('Nothing to redo.');
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(s);
    this.say('Redone.');
  }

  private restoreSnapshot(s: string): void {
    const o = JSON.parse(s) as Pick<App, 'current' | 'recipe' | 'seeds' | 'seedName' | 'samples' | 'edits' | 'selected' | 'batch' | 'picked'>;
    Object.assign(this, o);
    // Existing update preserves the scheduling horizon, or replaces the queued break.
    this.player.update(this.current);
    if (this.selected && !findRef(this.current.events, this.selected)) this.selected = null;
    this.history.replaceCurrent(this.entry);
    this.baseline = this.snapshot();
    this.changed();
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
    this.mix = emptyMix();
    this.player.setMix(this.mix);
    this.changed();
  }
  audible(cat: Category): boolean {
    return audible(this.mix, cat);
  }
}
