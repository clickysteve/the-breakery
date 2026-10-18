/**
 * The Breakery's musical data. A break is structured event data: what plays (category and
 * sample), where in the bar (grid position), how (velocity), and with what feel (swing and
 * microtiming, kept separate from the grid position so the "score" and the "groove" can be
 * frozen, compared and bred independently, as in the Groove MIDI Dataset's representation).
 */

import type { ApplyReport, Edits } from './edits';

/** Drum categories, in display order (toms high to low, as they sit on a kit). */
export const CATEGORIES = ['kick', 'snare', 'ghost', 'htom', 'mtom', 'ltom', 'hat', 'open', 'ride', 'crash', 'perc'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  kick: 'KICK',
  snare: 'SNARE',
  ghost: 'GHOST',
  htom: 'HIGH TOM',
  mtom: 'MID TOM',
  ltom: 'LOW TOM',
  hat: 'HAT',
  open: 'OPEN HAT',
  ride: 'RIDE',
  crash: 'CRASH',
  perc: 'PERC',
};

/** The tom categories, high to low. */
export const TOMS = ['htom', 'mtom', 'ltom'] as const satisfies readonly Category[];
export const isTom = (c: Category): boolean => c === 'htom' || c === 'mtom' || c === 'ltom';

/** General MIDI drum notes per category (MIDI file export): toms are GM High Tom, Low-Mid Tom and Low Tom. */
export const GM_NOTE: Record<Category, number> = { kick: 36, snare: 38, ghost: 38, htom: 50, mtom: 47, ltom: 45, hat: 42, open: 46, ride: 51, crash: 49, perc: 39 };

/** Sixteenth-note steps per 4/4 bar. */
export const STEPS = 16;
/** Grid ticks per sixteenth (allows 32nds = 6 and triplets = 4). */
export const TPS = 12;
/** Grid ticks per bar. */
export const TPB = STEPS * TPS;

export type Style = 'funk' | 'hiphop' | 'boombap' | 'jungle' | 'broken' | 'hardcore' | 'dnb' | 'halftime' | 'garage' | 'electro' | 'breakcore';
/** Recipes in display order: the four originals first. */
export const STYLES: Style[] = ['funk', 'hiphop', 'jungle', 'broken', 'boombap', 'hardcore', 'dnb', 'halftime', 'garage', 'electro', 'breakcore'];

/** Pattern length in bars. */
export type Bars = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const MIN_BARS = 1;
export const MAX_BARS = 8;

/**
 * The generation algorithm. 1 = The Breakery 0.1 (frozen, so its breaks stay reproducible from
 * their seeds), 2 = the current engine. A recipe carries its engine, so favourites, history and
 * links reproduce exactly.
 */
export type Engine = 1 | 2;
export const ENGINES: Engine[] = [1, 2];
export const CURRENT_ENGINE: Engine = 2;

/** ROLLS: subdivision of a roll's hits (grid ticks per hit: 12 a sixteenth, 3 a 64th). */
export const ROLL_SPEEDS = ['16', '16t', '32', '32t', '64'] as const;
export type RollSpeed = (typeof ROLL_SPEEDS)[number];
export const ROLL_TICKS: Record<RollSpeed, number> = { '16': 12, '16t': 8, '32': 6, '32t': 4, '64': 3 };
export const ROLL_SPEED_LABEL: Record<RollSpeed, string> = { '16': '1/16', '16t': '1/16T', '32': '1/32', '32t': '1/32T', '64': '1/64' };
/** ROLLS: the velocity shape across a roll. */
export const ROLL_DYNAMICS = ['even', 'crescendo', 'decrescendo', 'alternating', 'human'] as const;
export type RollDynamics = (typeof ROLL_DYNAMICS)[number];
/** ROLLS: where rolls go. accent = leading into a strong hit; phrase = the end of the phrase (and of its sections); fills = inside the fill bars; anywhere = any of these, in any bar. */
export const ROLL_PLACES = ['accent', 'phrase', 'fills', 'anywhere'] as const;
export type RollPlace = (typeof ROLL_PLACES)[number];
/** ROLLS: which drums may roll. hat = the timekeeper (hat or ride); tom = the three toms. */
export const ROLL_TARGETS = ['snare', 'hat', 'perc', 'tom', 'kick'] as const;
export type RollTarget = (typeof ROLL_TARGETS)[number];

/** The user's generative parameters. All controls are 0..1 except bpm, bars and the roll settings. */
export interface Recipe {
  style: Style;
  bpm: number;
  bars: Bars;
  engine: Engine;
  /** how many hits overall */
  density: number;
  /** how far the generator strays from the plain backbeat (extra snares, odd kicks, drags) */
  complexity: number;
  /** target amount of syncopation in the kick/snare foundation */
  syncopation: number;
  /** how many ghost notes */
  ghosts: number;
  /** 0 = straight (50 %), 1 = 75 % sixteenth swing */
  swing: number;
  /** size of the performer's timing and dynamics tendencies */
  humanise: number;
  /** how much later bars differ from the first */
  variation: number;
  /** length and intensity of the turnaround fill */
  fills: number;
  /** TOMS: how much the toms take part in fills and phrase development (0 = never) */
  toms: number;
  /** ROLLS: how many rolls (0 = none) */
  rolls: number;
  /** ROLLS: hits per roll */
  rollLength: number;
  rollSpeed: RollSpeed;
  rollDynamics: RollDynamics;
  rollPlace: RollPlace;
  rollTargets: RollTarget[];
}

/** The 0..1 controls (a missing one is 0: TOMS and ROLLS are 0 in recipes saved before they existed). */
export const RECIPE_KEYS = ['density', 'complexity', 'syncopation', 'ghosts', 'swing', 'humanise', 'variation', 'fills', 'toms', 'rolls'] as const;
/** The recipe fields added with TOMS and ROLLS (recipes saved before them have none). */
export type FlourishKey = 'toms' | 'rolls' | 'rollLength' | 'rollSpeed' | 'rollDynamics' | 'rollPlace' | 'rollTargets';
export const MIN_ROLL = 2;
export const MAX_ROLL = 16;
export type RecipeKey = (typeof RECIPE_KEYS)[number];

/**
 * One seed per layer. FREEZE keeps a layer's seed while the others change.
 * beat = kick and snare (and their development across bars), detail = ghosts, timekeeping,
 * percussion and cymbals, feel = velocity and timing performance, kit = sample choices.
 */
export interface Seeds {
  beat: number;
  detail: number;
  feel: number;
  kit: number;
  /**
   * MUTATE (engine 2): a lineage of mutation seeds. Each one applies a few small variation
   * operations to the groove cell, so the whole phrase changes with it but stays related.
   */
  mut?: Mutation[];
}

/** One MUTATE step: its seed, and which layers it may vary (frozen layers are left alone). */
export interface Mutation {
  seed: number;
  beat: boolean;
  detail: boolean;
}
export const LAYERS = ['beat', 'detail', 'feel', 'kit'] as const;
export type Layer = (typeof LAYERS)[number];

/** What a hit does musically (shown in the pattern view; kept for slicing and MIDI later). */
export type Role =
  | 'downbeat'
  | 'kick'
  | 'syncopated kick'
  | 'pickup kick'
  | 'backbeat'
  | 'displaced backbeat'
  | 'extra snare'
  | 'ghost'
  | 'drag'
  | 'time'
  | 'lift'
  | 'crash'
  | 'perc'
  | 'fill'
  /** a four-on-the-floor kick layered under the break (HARDCORE) */
  | 'floor kick'
  /** a hit copied from another place in the groove by a chop (event-level resequencing) */
  | 'chop'
  /** a fast retrigger of the same sound (a roll or stutter) */
  | 'roll'
  /** placed (or moved) by hand: not generated */
  | 'manual';

/** A hit in the score, before performance. `level` is its nominal dynamic, 0..1. */
export interface Hit {
  cat: Category;
  /** sixteenth step within the bar, 0..15 */
  step: number;
  /** grid ticks after the step (0 = on the step, 6 = the following 32nd) */
  sub: number;
  level: number;
  role: Role;
  /** why the generator placed it (shown as a tooltip) */
  why: string;
}

/** A performed hit. */
export interface BreakEvent extends Hit {
  bar: number;
  /** 1..127 */
  vel: number;
  /** swing delay, in sixteenths */
  swing: number;
  /** microtiming, milliseconds (negative = early) */
  offsetMs: number;
  /** sample id, or null when no sample is available for the category */
  sample: string | null;
  /** why that sample (sample-selection mode), for the pattern view */
  sampleWhy?: string;
  /** identity for editing: the generated hit's key ("snare|1|4|0"), or "m:<id>" for a hand-placed hit */
  ref?: string;
  /** edited by hand: added, moved (a generated hit placed elsewhere) or edited (velocity, timing, sample) */
  manual?: 'added' | 'moved' | 'edited';
  /** what was changed by hand (shown with the generator's explanation) */
  editWhy?: string;
  /** a sample chosen by hand for this hit */
  pinned?: string;
}

/**
 * Role of each bar in the phrase. A groove (the motif), A2 answer (the groove varied), B
 * development (the motif developed further: more variation, chops in some recipes), F half-way
 * fill (a short fill ending a four-bar section inside a longer phrase), T turnaround (variation
 * and the main fill, pushing back into the top of the loop).
 */
export type BarRole = 'A' | 'A2' | 'B' | 'F' | 'T';

/** The performer's consistent tendencies for one break (milliseconds). */
export interface Feel {
  kick: number;
  snare: number;
  hats: number;
  /** per-step accent idiosyncrasy of the timekeeper, repeating every two bars */
  accent: number[];
  /** engine 2: the hats' accent cycle (see performance.ts) */
  cycle?: string;
}

export interface Break {
  recipe: Recipe;
  seeds: Seeds;
  plan: BarRole[];
  feel: Feel;
  /** which timekeeper the generator chose */
  timekeeper: 'hat' | 'ride';
  events: BreakEvent[];
  /** the hand edits applied to the generated events (absent when there are none) */
  edits?: Edits;
  /** edits that could not apply to this break (kept, not dropped) */
  editReport?: ApplyReport;
}

/** Grid ticks of an event from the start of the break. */
export function gridTick(e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>): number {
  return e.bar * TPB + e.step * TPS + e.sub;
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
