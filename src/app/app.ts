/**
 * The Breakery's state and actions, independent of the interface: the recipe, the seeds (and
 * their name), what is frozen, the current break, the batch of candidates, seed history and
 * favourites, sample-selection settings and solo/mute. Changing the recipe re-bakes the SAME seeds,
 * so each control's effect is heard on the same break; BAKE draws new seeds for every layer that
 * is not frozen; MUTATE varies the current groove a little.
 */
import { bake, mutate, parseSeed, reseed, sanitiseRecipe, seedLabel, seedsFrom } from '../engine/generate';
import { freshSeed } from '../engine/rng';
import { sanitiseSampleSettings, type CategorySamples, type SampleSettings } from '../engine/samples';
import { defaultRecipe, STYLE_DEFS } from '../engine/styles';
import { CURRENT_ENGINE, LAYERS, type Break, type Category, type Engine, type Layer, type Recipe, type Seeds, type Style } from '../engine/types';
import type { Ingredients } from '../audio/ingredients';
import type { Player } from '../audio/player';
import { defaultTakeaway, type TakeawayOptions } from '../audio/takeaway';
import { audible, emptyMix, sanitiseMix, type MixState } from './mix';
import { diceName, entryKey, entryLabel, FAVOURITES_MAX, sanitiseFavourite, SeedHistory, type Favourite, type SeedEntry } from './seeds';

export const BATCH_SIZE = 8;
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
    if (s?.recipe && this.recipe.engine === 1) this.status = 'Restored with ENGINE 1, so this break sounds as it did. Switch RECIPE ▸ ENGINE to 2 to hear the new generator on the same seed.';
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  changed(save = true): void {
    if (save) this.save();
    for (const f of this.listeners) f();
  }

  say(msg: string): void {
    this.status = msg;
    this.changed(false);
  }

  save(): void {
    const s: Saved = { recipe: this.recipe, seeds: this.seeds, seedName: this.seedName, frozen: this.frozen, loop: this.player.loop, level: this.player.level, takeaway: this.takeawayOpts, samples: this.samples, mix: this.mix };
    writeJson(STATE_KEY, s);
    writeJson(HISTORY_KEY, this.history.toJSON());
  }

  /** Bake with the current recipe, kit and sample settings. */
  private bakeWith(seeds: Seeds, recipe = this.recipe): Break {
    return bake(recipe, seeds, this.ingredients.kit(), { settings: this.samples, loudness: this.ingredients.loudness() }, (id) => this.ingredients.name(id));
  }

  private show(b: Break): void {
    this.current = b;
    this.player.setBreak(b);
  }

  private remember(): void {
    this.history.push({ recipe: this.recipe, seeds: this.seeds, name: this.seedName });
  }

  /** The current seed as shown: its name, or the number. */
  get seedText(): string {
    return seedLabel(this.seeds.beat, this.seedName);
  }

  get entry(): SeedEntry {
    return { recipe: this.recipe, seeds: this.seeds, name: this.seedName };
  }

  /** Re-bake the current seeds (after a recipe, kit or sample-setting change); the batch follows. */
  rebake(): void {
    this.show(this.bakeWith(this.seeds));
    this.batch = this.batch.map((c) => this.bakeWith(c.seeds));
    this.changed();
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
    this.seeds = reseed(this.seeds, this.frozen);
    this.seedName = null;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `Baked: ${STYLE_DEFS[this.recipe.style].label}, seed ${this.seeds.beat}.`;
    this.changed();
  }

  /** BATCH: several candidates from new seeds (frozen layers kept); the first becomes current. */
  bakeBatch(n = BATCH_SIZE): void {
    this.batch = [];
    for (let i = 0; i < n; i++) this.batch.push(this.bakeWith(reseed(this.seeds, this.frozen)));
    this.pick(0);
    this.status = `A batch of ${n}: click one (or press 1–${n}) to audition it.`;
    this.changed();
  }

  pick(i: number): void {
    const b = this.batch[i];
    if (!b) return;
    this.picked = i;
    this.seeds = { ...b.seeds };
    this.seedName = null;
    this.show(b);
    this.remember();
    this.changed();
  }

  /** Set every layer from one seed (a number, or a name). */
  setSeed(seed: number, name: string | null = null): void {
    this.seeds = seedsFrom(Math.max(0, Math.floor(seed)) >>> 0);
    this.seedName = name;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.changed();
  }

  /** What was typed in the SEED box: a number or a name. False if empty. */
  setSeedText(text: string): boolean {
    const p = parseSeed(text);
    if (!p) return false;
    this.setSeed(p.seed, p.name);
    this.status = p.name ? `Seed “${p.name}” (${p.seed}): the same name always bakes the same break with the same recipe.` : `Seed ${p.seed}.`;
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
    this.seeds = next;
    this.picked = null;
    this.show(this.bakeWith(this.seeds));
    this.remember();
    this.status = `Mutation ${next.mut!.length}: the groove varied a little${this.frozen.beat ? ' (kick and snare frozen)' : this.frozen.detail ? ' (detail frozen)' : ''}. ← goes back.`;
    this.changed();
  }

  private restore(e: SeedEntry, samples?: SampleSettings): void {
    this.recipe = sanitiseRecipe(e.recipe);
    this.seeds = { ...e.seeds, ...(e.seeds.mut ? { mut: e.seeds.mut.map((m) => ({ ...m })) } : {}) };
    this.seedName = e.name;
    if (samples) this.samples = sanitiseSampleSettings(samples);
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
