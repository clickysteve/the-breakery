/**
 * Seed history, favourites and DICE names: pure helpers, so they can be tested without a browser.
 *
 * A history entry or favourite stores everything that reproduces a break: the recipe (with its
 * engine), the four layer seeds and mutation lineage, the seed's name, and (favourites) the
 * sample-selection settings. Samples themselves are not stored: a favourite plays with whatever
 * kit is loaded, through the same selection settings.
 */
import { editsKey, hasEdits, sanitiseEdits, type Edits } from '../engine/edits';
import { sanitiseRecipe } from '../engine/generate';
import { sanitiseSampleSettings, type SampleSettings } from '../engine/samples';
import { STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, type Recipe, type Seeds } from '../engine/types';

export interface SeedEntry {
  recipe: Recipe;
  seeds: Seeds;
  /** the name typed or rolled, or null for a plain number */
  name: string | null;
  /** hand edits of this break (absent when there are none) */
  edits?: Edits;
}

export interface Favourite extends SeedEntry {
  id: string;
  samples: SampleSettings;
  savedAt: number;
}

export const HISTORY_MAX = 60;
export const FAVOURITES_MAX = 200;

/** What makes two entries the same break (hand edits included: an edited break is another break). */
export function entryKey(e: Pick<SeedEntry, 'recipe' | 'seeds'> & { edits?: Edits }): string {
  const r = sanitiseRecipe(e.recipe);
  const s = e.seeds;
  const k: unknown[] = [r.engine, r.style, r.bpm, r.bars, r.density, r.complexity, r.syncopation, r.ghosts, r.swing, r.humanise, r.variation, r.fills, s.beat, s.detail, s.feel, s.kit, (s.mut ?? []).map((m) => [m.seed, m.beat, m.detail])];
  if (hasEdits(e.edits)) k.push(editsKey(e.edits));
  return JSON.stringify(k);
}

/** A display label: "funky chicken +2 · JUNGLE 8 bars". */
export function entryLabel(e: SeedEntry): string {
  const n = e.seeds.mut?.length ?? 0;
  return `${e.name ?? e.seeds.beat}${n ? ` +${n}` : ''} · ${STYLE_DEFS[e.recipe.style]?.label ?? e.recipe.style} ${e.recipe.bars} bar${e.recipe.bars > 1 ? 's' : ''}${e.recipe.engine === 1 ? ' · engine 1' : ''}${hasEdits(e.edits) ? ' · edited' : ''}`;
}

/** History: a list with a cursor, like a browser's back and forward. */
export class SeedHistory {
  entries: SeedEntry[] = [];
  index = -1;

  /** Add an entry after the cursor (dropping any "forward" entries); repeats of the current one are ignored. */
  push(e: SeedEntry): void {
    const cur = this.entries[this.index];
    if (cur && entryKey(cur) === entryKey(e)) {
      this.entries[this.index] = clone(e); // same break: keep the newer name
      return;
    }
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(clone(e));
    if (this.entries.length > HISTORY_MAX) this.entries = this.entries.slice(this.entries.length - HISTORY_MAX);
    this.index = this.entries.length - 1;
  }

  /** The current entry heard with a changed recipe: update it in place (no new entry). */
  replaceCurrent(e: SeedEntry): void {
    if (this.index < 0) return this.push(e);
    this.entries[this.index] = clone(e);
  }

  get canBack(): boolean {
    return this.index > 0;
  }
  get canForward(): boolean {
    return this.index < this.entries.length - 1;
  }
  back(): SeedEntry | null {
    if (!this.canBack) return null;
    return clone(this.entries[--this.index]!);
  }
  forward(): SeedEntry | null {
    if (!this.canForward) return null;
    return clone(this.entries[++this.index]!);
  }
  go(i: number): SeedEntry | null {
    if (i < 0 || i >= this.entries.length) return null;
    this.index = i;
    return clone(this.entries[i]!);
  }

  toJSON(): { entries: SeedEntry[]; index: number } {
    return { entries: this.entries, index: this.index };
  }
  static from(v: unknown): SeedHistory {
    const h = new SeedHistory();
    const o = v as { entries?: unknown[]; index?: unknown } | null;
    if (o && Array.isArray(o.entries)) {
      h.entries = o.entries.map(sanitiseEntry).filter((e): e is SeedEntry => !!e).slice(-HISTORY_MAX);
      h.index = Math.min(h.entries.length - 1, Math.max(-1, Number(o.index ?? h.entries.length - 1) | 0));
    }
    return h;
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const isSeed = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function sanitiseEntry(v: unknown): SeedEntry | null {
  const o = v as Partial<SeedEntry> | null;
  if (!o || !o.recipe || !o.seeds) return null;
  const s = o.seeds;
  if (![s.beat, s.detail, s.feel, s.kit].every(isSeed)) return null;
  const mut = Array.isArray(s.mut) ? s.mut.filter((m) => m && isSeed(m.seed)).map((m) => ({ seed: m.seed >>> 0, beat: !!m.beat, detail: !!m.detail })) : [];
  const edits = sanitiseEdits(o.edits, CATEGORIES);
  return {
    recipe: sanitiseRecipe(o.recipe),
    seeds: { beat: s.beat >>> 0, detail: s.detail >>> 0, feel: s.feel >>> 0, kit: s.kit >>> 0, ...(mut.length ? { mut } : {}) },
    name: typeof o.name === 'string' && o.name ? o.name : null,
    ...(hasEdits(edits) ? { edits } : {}),
  };
}

export function sanitiseFavourite(v: unknown): Favourite | null {
  const e = sanitiseEntry(v);
  const o = v as Partial<Favourite>;
  if (!e) return null;
  return { ...e, id: typeof o.id === 'string' ? o.id : entryKey(e), samples: sanitiseSampleSettings(o.samples), savedAt: Number(o.savedAt) || 0 };
}

// ------------------------------------------------------------------ DICE

// prettier-ignore
const ADJ = ['dusty', 'broken', 'rainy', 'midnight', 'rusty', 'velvet', 'crooked', 'sunday', 'lost', 'sticky', 'heavy', 'loose', 'golden', 'wonky', 'secret', 'electric', 'tired', 'cosmic', 'paper', 'second-hand', 'borrowed', 'shaky', 'humid', 'concrete', 'neon', 'tin', 'last', 'early', 'basement', 'slow', 'restless', 'lucky'];
// prettier-ignore
const NOUN = ['crate', 'chicken', 'washing machine', 'staircase', 'bus stop', 'teapot', 'radiator', 'pigeon', 'cassette', 'kettle', 'lift', 'biscuit', 'puddle', 'jukebox', 'carpet', 'tram', 'fire escape', 'drum stool', 'cardigan', 'trolley', 'aerial', 'gasworks', 'chip shop', 'flyover', 'pressing plant', 'basement', 'ferry', 'pylon', 'turntable', 'laundrette', 'arcade', 'shed'];
// prettier-ignore
const PLACE = ['glasgow', 'bristol', 'leeds', 'detroit', 'the bronx', 'peckham', 'sheffield', 'croydon', 'harlesden', 'cardiff', 'belfast', 'nottingham'];

/** A random seed name ("rusty kettle", "bristol 1993"). Uses `random` (Math.random in the app). */
export function diceName(random: () => number = Math.random): string {
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)]!;
  if (random() < 0.2) return `${pick(PLACE)} ${1969 + Math.floor(random() * 32)}`;
  return `${pick(ADJ)} ${pick(NOUN)}`;
}
