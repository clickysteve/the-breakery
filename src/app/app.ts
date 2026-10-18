/**
 * The Breakery's state and actions, independent of the interface: the recipe, the seeds, what
 * is frozen, the current break and the batch of candidates. Changing the recipe re-bakes the
 * SAME seeds, so each control's effect is heard on the same break; BAKE draws new seeds for
 * every layer that is not frozen.
 */
import { bake, reseed, sanitiseRecipe, seedsFrom } from '../engine/generate';
import { freshSeed } from '../engine/rng';
import { defaultRecipe, STYLE_DEFS } from '../engine/styles';
import { LAYERS, type Break, type Layer, type Recipe, type Seeds, type Style } from '../engine/types';
import type { Ingredients } from '../audio/ingredients';
import type { Player } from '../audio/player';
import { defaultTakeaway, type TakeawayOptions } from '../audio/takeaway';

export const BATCH_SIZE = 8;
const STATE_KEY = 'breakery.state.v1';

interface Saved {
  recipe: Recipe;
  seeds: Seeds;
  frozen: Record<Layer, boolean>;
  loop: boolean;
  level: number;
  takeaway: TakeawayOptions;
}

const noFreeze = (): Record<Layer, boolean> => ({ beat: false, detail: false, feel: false, kit: false });

export class App {
  recipe: Recipe;
  seeds: Seeds;
  frozen: Record<Layer, boolean>;
  takeawayOpts: TakeawayOptions;
  current: Break;
  /** BATCH candidates (empty until BATCH is used) */
  batch: Break[] = [];
  /** index of the candidate that is current, if any */
  picked: number | null = null;
  status = '';
  private listeners: (() => void)[] = [];

  constructor(public ingredients: Ingredients, public player: Player, initialSeed?: number) {
    const s = this.load();
    this.recipe = s?.recipe ? sanitiseRecipe(s.recipe) : defaultRecipe('funk', 2);
    this.seeds = initialSeed !== undefined ? seedsFrom(initialSeed) : (s?.seeds ?? seedsFrom(freshSeed()));
    this.frozen = { ...noFreeze(), ...(s?.frozen ?? {}) };
    this.takeawayOpts = { ...defaultTakeaway(), ...(s?.takeaway ?? {}) };
    player.loop = s?.loop ?? true;
    player.setLevel(typeof s?.level === 'number' ? s.level : player.level);
    this.current = bake(this.recipe, this.seeds, ingredients.kit());
    player.setBreak(this.current);
    player.onSwap = () => this.changed(false);
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

  private load(): Partial<Saved> | null {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    } catch {
      return null;
    }
  }

  save(): void {
    try {
      const s: Saved = { recipe: this.recipe, seeds: this.seeds, frozen: this.frozen, loop: this.player.loop, level: this.player.level, takeaway: this.takeawayOpts };
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch {
      /* no storage: settings last for this visit */
    }
  }

  private show(b: Break): void {
    this.current = b;
    this.player.setBreak(b);
  }

  /** Re-bake the current seeds (after a recipe or kit change); the batch follows. */
  rebake(): void {
    const kit = this.ingredients.kit();
    this.show(bake(this.recipe, this.seeds, kit));
    this.batch = this.batch.map((c) => bake(this.recipe, c.seeds, kit));
    this.changed();
  }

  setRecipe(patch: Partial<Recipe>): void {
    this.recipe = sanitiseRecipe({ ...this.recipe, ...patch });
    this.rebake();
  }

  /** Choose a style: its defaults replace the controls (BPM too). */
  setStyle(style: Style): void {
    this.recipe = sanitiseRecipe({ ...defaultRecipe(style, this.recipe.bars) });
    this.rebake();
  }

  resetRecipe(): void {
    this.setStyle(this.recipe.style);
  }

  /** BAKE: new seeds for the layers that are not frozen. */
  bake(): void {
    this.seeds = reseed(this.seeds, this.frozen);
    this.picked = null;
    this.show(bake(this.recipe, this.seeds, this.ingredients.kit()));
    this.status = `Baked: ${STYLE_DEFS[this.recipe.style].label}, seed ${this.seeds.beat}.`;
    this.changed();
  }

  /** BATCH: several candidates from new seeds (frozen layers kept); the first becomes current. */
  bakeBatch(n = BATCH_SIZE): void {
    const kit = this.ingredients.kit();
    this.batch = [];
    for (let i = 0; i < n; i++) this.batch.push(bake(this.recipe, reseed(this.seeds, this.frozen), kit));
    this.pick(0);
    this.status = `A batch of ${n}: click one (or press 1–${n}) to audition it.`;
    this.changed();
  }

  pick(i: number): void {
    const b = this.batch[i];
    if (!b) return;
    this.picked = i;
    this.seeds = { ...b.seeds };
    this.show(b);
    this.changed();
  }

  setSeed(seed: number): void {
    this.seeds = seedsFrom(Math.max(0, Math.floor(seed)) >>> 0);
    this.picked = null;
    this.rebake();
  }

  toggleFreeze(l: Layer): void {
    this.frozen[l] = !this.frozen[l];
    this.changed();
  }

  get frozenCount(): number {
    return LAYERS.filter((l) => this.frozen[l]).length;
  }
}
