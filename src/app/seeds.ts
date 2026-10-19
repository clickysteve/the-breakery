/**
 * Seed history, favourites and DICE names: pure helpers, so they can be tested without a browser.
 *
 * A history entry or favourite stores everything that reproduces a break: the recipe (with its
 * engine), the four layer seeds and mutation lineage, the seed's name, and (favourites) the
 * sample-selection settings. Samples themselves are not stored: a favourite plays with whatever
 * kit is loaded, through the same selection settings.
 */
import { chopActive } from '../engine/chopper';
import { editsKey, hasEdits, sanitiseEdits, type Edits } from '../engine/edits';
import { sanitiseRecipe, sanitiseSeeds } from '../engine/generate';
import { destroyActive } from '../engine/destroy';
import { exprActive } from '../engine/rollExpr';
import { personaActive } from '../engine/personality';
import { dnaActive } from '../engine/dna';
import { destroy2Active } from '../engine/destroy2';
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
  const k: unknown[] = [r.engine, r.style, r.bpm, r.bars, r.density, r.complexity, r.syncopation, r.ghosts, r.swing, r.humanise, r.variation, r.fills, s.beat, s.detail, s.feel, s.kit, (s.mut ?? []).map((m) => (m.style ? [m.seed, m.beat, m.detail, m.style, m.depth, m.range, m.cats ?? null] : [m.seed, m.beat, m.detail]))];
  if (r.rollsOn === false) k.push('no rolls');
  if (r.jungleCuts) k.push('jungle cuts');
  if (r.revision) k.push(['revision', r.revision]);
  if (chopActive(r.chop)) k.push(['chop', r.chop!.amount, r.chop!.slice, r.chop!.retrigger, r.chop!.variant]);
  // Phase 12 (only when they change the break, so earlier keys are unchanged)
  if (exprActive(r.rollExpr)) k.push(['expr', r.rollExpr]);
  if (personaActive(r.personality)) k.push(['persona', r.personality!.id, r.personality!.amount]);
  if (dnaActive(r.dna)) k.push(['dna', r.dna!.id, r.dna!.amount]);
  if (destroyActive(r.destroy)) k.push(['destroy', r.destroy!.amount, r.destroy!.style, r.destroy!.variant]);
  if (s.regen?.length) k.push(['regen', s.regen.map((x) => [x.cats, x.n])]);
  // Phase 14 (absent before it, so earlier keys are unchanged)
  if (r.cym) k.push(['cym', r.cym]);
  if (destroy2Active(r.destroy2)) k.push(['destroy2', r.destroy2]);
  if (hasEdits(e.edits)) k.push(editsKey(e.edits));
  return JSON.stringify(k);
}

/** A display label: "funky chicken +2 · JUNGLE 8 bars". */
export function entryLabel(e: SeedEntry): string {
  const n = e.seeds.mut?.length ?? 0;
  return `${e.name ?? e.seeds.beat}${n ? ` +${n}` : ''} · ${STYLE_DEFS[e.recipe.style]?.label ?? e.recipe.style} ${e.recipe.bars} bar${e.recipe.bars > 1 ? 's' : ''}${e.recipe.engine === 1 ? ' · legacy' : ''}${chopActive(e.recipe.chop) ? ' · chopped' : ''}${hasEdits(e.edits) ? ' · edited' : ''}`;
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
  const edits = sanitiseEdits(o.edits, CATEGORIES);
  return {
    recipe: sanitiseRecipe(o.recipe),
    seeds: sanitiseSeeds({ ...s, mut: Array.isArray(s.mut) ? s.mut.filter((m) => m && isSeed(m.seed)) : [] }),
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

// Single, plain, family-friendly words (checked by hand: no slurs, no body parts, no brands, nothing
// that reads badly next to another word of the lists). Uppercase, joined by hyphens, with a number:
// VELVET-THUNDER-17. 128 x 128 x 90 = about 1.5 million names, so DICE and BAKE rarely repeat one.
// prettier-ignore
export const DICE_ADJ = ['VELVET', 'DUSTY', 'RUSTY', 'GOLDEN', 'NEON', 'COSMIC', 'MIDNIGHT', 'SUNDAY', 'CROOKED', 'HEAVY', 'LOOSE', 'WONKY', 'SECRET', 'ELECTRIC', 'PAPER', 'SHAKY', 'HUMID', 'CONCRETE', 'TIN', 'EARLY', 'SLOW', 'RESTLESS', 'LUCKY', 'BRASS', 'COPPER', 'SILVER', 'AMBER', 'COBALT', 'CRIMSON', 'INDIGO', 'SCARLET', 'VIOLET', 'EMERALD', 'IVORY', 'SMOKY', 'FOGGY', 'RAINY', 'SNOWY', 'SUNNY', 'WINDY', 'STORMY', 'MISTY', 'FROSTY', 'MOSSY', 'SANDY', 'SALTY', 'SPICY', 'SWEET', 'BITTER', 'CRISPY', 'FUZZY', 'GROOVY', 'FUNKY', 'JAZZY', 'BOUNCY', 'WOBBLY', 'TWISTED', 'TANGLED', 'HOLLOW', 'HIDDEN', 'DISTANT', 'ANCIENT', 'MODERN', 'ATOMIC', 'LUNAR', 'SOLAR', 'STELLAR', 'ORBITAL', 'MAGNETIC', 'ANALOG', 'DIGITAL', 'STATIC', 'SONIC', 'ROLLING', 'TUMBLING', 'SPINNING', 'DRIFTING', 'GLOWING', 'HUMMING', 'BUZZING', 'RATTLING', 'CLATTERING', 'SWINGING', 'STOMPING', 'SHUFFLING', 'SKIPPING', 'MELLOW', 'MIGHTY', 'GENTLE', 'WILD', 'QUIET', 'LOUD', 'BRIGHT', 'DARK', 'GIANT', 'TINY', 'SWIFT', 'LAZY', 'SLEEPY', 'DIZZY', 'CURIOUS', 'CLEVER', 'BRAVE', 'NOBLE', 'ROYAL', 'RUSTIC', 'URBAN', 'COASTAL', 'ALPINE', 'ARCTIC', 'TROPIC', 'DESERT', 'MARBLE', 'WOODEN', 'GLASS', 'IRON', 'STEEL', 'CHROME', 'PLASTIC', 'VINYL', 'CASSETTE', 'TAPE', 'RADIO', 'BASEMENT', 'ROOFTOP', 'BACKSTREET', 'SATURDAY', 'AUTUMN', 'WINTER'];
// prettier-ignore
export const DICE_NOUN = ['THUNDER', 'KETTLE', 'PIGEON', 'TEAPOT', 'RADIATOR', 'CASSETTE', 'JUKEBOX', 'PUDDLE', 'TRAM', 'FERRY', 'PYLON', 'TURNTABLE', 'ARCADE', 'SHED', 'CRATE', 'STAIRCASE', 'BISCUIT', 'CARDIGAN', 'TROLLEY', 'AERIAL', 'FLYOVER', 'LIGHTHOUSE', 'HARBOUR', 'GARDEN', 'ORCHARD', 'MEADOW', 'RIVER', 'CANYON', 'GLACIER', 'VOLCANO', 'COMET', 'NEBULA', 'GALAXY', 'PLANET', 'ROCKET', 'SATELLITE', 'ROBOT', 'ENGINE', 'MACHINE', 'GADGET', 'LANTERN', 'CANDLE', 'MIRROR', 'WINDOW', 'DOORWAY', 'BALCONY', 'CHIMNEY', 'TUNNEL', 'BRIDGE', 'TOWER', 'CASTLE', 'PALACE', 'TEMPLE', 'MARKET', 'BAKERY', 'DINER', 'CAFE', 'LIBRARY', 'MUSEUM', 'STUDIO', 'GARAGE', 'WAREHOUSE', 'FACTORY', 'STATION', 'AIRPORT', 'HIGHWAY', 'AVENUE', 'BOULEVARD', 'ALLEYWAY', 'COURTYARD', 'FOUNTAIN', 'STATUE', 'PENGUIN', 'PELICAN', 'FLAMINGO', 'PANTHER', 'TIGER', 'BADGER', 'OTTER', 'BEAVER', 'WALRUS', 'DOLPHIN', 'OCTOPUS', 'LOBSTER', 'BEETLE', 'HORNET', 'FALCON', 'RAVEN', 'SPARROW', 'HERON', 'MOTH', 'LIZARD', 'TORTOISE', 'MAMMOTH', 'DRAGON', 'PHOENIX', 'GRIFFIN', 'GOBLIN', 'WIZARD', 'PIRATE', 'SAILOR', 'DRUMMER', 'DANCER', 'BOXER', 'JUGGLER', 'ACROBAT', 'MAGICIAN', 'ASTRONAUT', 'DETECTIVE', 'PROFESSOR', 'MECHANIC', 'GARDENER', 'POSTMAN', 'BAKER', 'ENGINEER', 'BREAKBEAT', 'BASSLINE', 'RHYTHM', 'GROOVE', 'TEMPO', 'ECHO', 'SIGNAL', 'CIRCUIT', 'VOLTAGE', 'PULSE', 'ORBIT', 'MOMENTUM'];

/**
 * A random seed name from the word lists, "VELVET-THUNDER-17". Uses `random` (Math.random in the
 * app; a seeded stream for WILDCARD, so it is deterministic). A name only ever reproduces a break
 * together with its recipe and settings (and the layers FREEZE kept), never on its own.
 */
export function diceName(random: () => number = Math.random): string {
  const pick = <T>(xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))]!;
  return `${pick(DICE_ADJ)}-${pick(DICE_NOUN)}-${10 + Math.floor(random() * 90)}`;
}
