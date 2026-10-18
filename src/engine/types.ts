/**
 * The Breakery's musical data. A break is structured event data: what plays (category and
 * sample), where in the bar (grid position), how (velocity), and with what feel (swing and
 * microtiming, kept separate from the grid position so the "score" and the "groove" can be
 * frozen, compared and bred independently, as in the Groove MIDI Dataset's representation).
 */

/** Drum categories, in display order. */
export const CATEGORIES = ['kick', 'snare', 'ghost', 'hat', 'open', 'ride', 'crash', 'perc'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  kick: 'KICK',
  snare: 'SNARE',
  ghost: 'GHOST',
  hat: 'HAT',
  open: 'OPEN HAT',
  ride: 'RIDE',
  crash: 'CRASH',
  perc: 'PERC',
};

/** General MIDI drum notes per category (for future MIDI output and MIDI file export). */
export const GM_NOTE: Record<Category, number> = { kick: 36, snare: 38, ghost: 38, hat: 42, open: 46, ride: 51, crash: 49, perc: 39 };

/** Sixteenth-note steps per 4/4 bar. */
export const STEPS = 16;
/** Grid ticks per sixteenth (allows 32nds = 6 and triplets = 4). */
export const TPS = 12;
/** Grid ticks per bar. */
export const TPB = STEPS * TPS;

export type Style = 'funk' | 'hiphop' | 'jungle' | 'broken';
export const STYLES: Style[] = ['funk', 'hiphop', 'jungle', 'broken'];

export type Bars = 1 | 2 | 4;

/** The user's generative parameters. All controls are 0..1 except bpm and bars. */
export interface Recipe {
  style: Style;
  bpm: number;
  bars: Bars;
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
}

export const RECIPE_KEYS = ['density', 'complexity', 'syncopation', 'ghosts', 'swing', 'humanise', 'variation', 'fills'] as const;
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
  | 'fill';

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
}

/** Role of each bar in the phrase. */
export type BarRole = 'A' | 'A2' | 'T';

/** The performer's consistent tendencies for one break (milliseconds). */
export interface Feel {
  kick: number;
  snare: number;
  hats: number;
  /** per-step accent idiosyncrasy of the timekeeper, repeating every two bars */
  accent: number[];
}

export interface Break {
  recipe: Recipe;
  seeds: Seeds;
  plan: BarRole[];
  feel: Feel;
  /** which timekeeper the generator chose */
  timekeeper: 'hat' | 'ride';
  events: BreakEvent[];
}

/** Grid ticks of an event from the start of the break. */
export function gridTick(e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>): number {
  return e.bar * TPB + e.step * TPS + e.sub;
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
