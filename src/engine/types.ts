/**
 * The Breakery's musical data. A break is structured event data: what plays (category and
 * sample), where in the bar (grid position), how (velocity), and with what feel (swing and
 * microtiming, kept separate from the grid position so the "score" and the "groove" can be
 * frozen, compared and bred independently, as in the Groove MIDI Dataset's representation).
 */

import type { ApplyReport, Edits } from './edits';
import type { RollExpression } from './rollExpr';
import type { PersonalitySetting } from './personality';
import type { DnaSetting } from './dna';
import type { DestroySettings, DestroyReport } from './destroy';
import type { DestroySettings2, Destroy2Report } from './destroy2';
import type { CymbalSettings, CymbalReport } from './cymbals4';
import type { Regen, RegenReport } from './regen';

/**
 * Drum categories (tracks), in display order (toms high to low, as they sit on a kit). Thirteen
 * since Phase 15: CLAP and FX joined (PERC carried both roles before). Every map keyed by category
 * follows this list; data saved with the eleven earlier tracks gets the new ones empty.
 */
export const CATEGORIES = ['kick', 'snare', 'ghost', 'clap', 'htom', 'mtom', 'ltom', 'hat', 'open', 'ride', 'crash', 'perc', 'fx'] as const;
export type Category = (typeof CATEGORIES)[number];
/** The eleven tracks before Phase 15 (kept for migrations and tests). */
export const LEGACY_CATEGORIES = ['kick', 'snare', 'ghost', 'htom', 'mtom', 'ltom', 'hat', 'open', 'ride', 'crash', 'perc'] as const satisfies readonly Category[];

export const CATEGORY_LABEL: Record<Category, string> = {
  kick: 'KICK',
  snare: 'SNARE',
  ghost: 'GHOST',
  clap: 'CLAP',
  htom: 'HIGH TOM',
  mtom: 'MID TOM',
  ltom: 'LOW TOM',
  hat: 'HAT',
  open: 'OPEN HAT',
  ride: 'RIDE',
  crash: 'CRASH',
  perc: 'PERC',
  fx: 'FX',
};

/** The tom categories, high to low. */
export const TOMS = ['htom', 'mtom', 'ltom'] as const satisfies readonly Category[];
export const isTom = (c: Category): boolean => c === 'htom' || c === 'mtom' || c === 'ltom';

/**
 * General MIDI drum notes per category (MIDI file export and live MIDI defaults): toms are GM High
 * Tom, Low-Mid Tom and Low Tom; CLAP is GM Hand Clap (39). PERC played 39 while it was the clap
 * track; from Phase 15 its default is GM Side Stick (37), so the two never share a note (a stored
 * MIDI routing keeps the notes it has: see sanitiseMidiSettings). General MIDI has no effects drum:
 * FX defaults to 27 (High Q in GM2 and GS, outside GM1's 35–81), a documented convention to change
 * in the MIDI window, not a standard.
 */
export const GM_NOTE: Record<Category, number> = { kick: 36, snare: 38, ghost: 38, clap: 39, htom: 50, mtom: 47, ltom: 45, hat: 42, open: 46, ride: 51, crash: 49, perc: 37, fx: 27 };

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
 * Which version of GROOVE (the generation strategy) baked a break. 2 = GROOVE as it is now, the
 * only one offered for new breaks; 1 = The Breakery 0.1's generator, kept internally (LEGACY) so
 * breaks saved with it reproduce exactly from their seeds. Not a choice in the interface: a recipe
 * carries its engine, so favourites, history and saved state reproduce exactly.
 */
export type Engine = 1 | 2;
export const ENGINES: Engine[] = [1, 2];
export const CURRENT_ENGINE: Engine = 2;
/**
 * Revisions of GROOVE (engine 2) that change what a saved recipe bakes. A recipe carries its
 * revision, as it carries its engine, so a break saved before a revision reproduces exactly:
 *   0 (absent)  as released up to Phase 10
 *   1           TOM ACTIVITY plays tom phrases (toms.ts addTomPhrases); ROLL GENERATION off holds
 *               back every new roll: the ROLLS layer, the fills' rolls and retrigger bursts (played
 *               as plain fills instead) and CHOP's retriggers
 *   2           TOM ACTIVITY recalibrated (toms.ts tomCurve): more phrases, longer runs and more
 *               accent strokes as it rises, so the whole range is useful (docs/tom-report.md)
 *   3           RHYTHMIC VOCABULARY (Phase 13, approaches.ts and cymbals.ts): each seed chooses a
 *               groove approach (the kick and snare strategy), a phrase form and a motif
 *               development within the recipe; the cymbals are generated per bar from a cymbal
 *               approach, with HI-HAT ACTIVITY, RIDE ACTIVITY and their RELATIONSHIP
 *   4           BREAK DNA GRAMMAR and the CYMBAL ENGINE (Phase 14, dnaGrammar.ts and cymbals4.ts):
 *               nine BREAK DNA types built into the phrase before the cymbals; CLOSED HAT, OPEN
 *               HAT, RIDE and CRASH ACTIVITY as coverage of a chosen SUBDIVISION, with primary
 *               and open/closed relationships and OPEN-HAT CHOKE (Recipe.cym)
 *   5           CLAP and FX (Phase 15, clapfx.ts): two tracks generated after the toms and rolls
 *               from their own streams (CLAP ACTIVITY and FX ACTIVITY); every other track is the
 *               same as revision 4
 * New breaks are baked with the current revision.
 */
export const CURRENT_REVISION = 5;
/** The first revision with the Phase 13 rhythmic vocabulary. */
export const VOCAB_REVISION = 3;
/** The first revision with the Phase 14 BREAK DNA grammar and cymbal engine. */
export const CYMBAL_REVISION = 4;
/** The first revision with the CLAP and FX tracks. */
export const CLAPFX_REVISION = 5;

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
  /**
   * ROLL GENERATION (engine 2): false = no new rolls (absent = on, as every break saved before it
   * existed). From revision 1 that covers every new roll: the ROLLS layer, the fills' rolls and
   * CHOP's retriggers. Rolls already in a break are not deleted by it. The app sets it from the
   * user's ROLL GENERATION preference (off until switched on), never from a recipe's defaults.
   */
  rollsOn?: boolean;
  /** GROOVE revision (engine 2; absent = 0): see CURRENT_REVISION */
  revision?: number;
  /**
   * JUNGLE only: develop the phrase with fragments, displaced snares and retrigger bursts (jungle.ts).
   * Absent means the way JUNGLE developed before Phase 7, so JUNGLE breaks saved earlier reproduce exactly.
   */
  jungleCuts?: true;
  /** CHOP: the transformation applied to the GROOVE (absent = none: every recipe saved before CHOP) */
  chop?: ChopSettings;
  /** ROLLS ▸ EXPRESSION: how every roll moves (absent = CLASSIC: as generated; rollExpr.ts) */
  rollExpr?: RollExpression;
  /** PERSONALITY: who plays the break, and how strongly (absent = NEUTRAL; personality.ts) */
  personality?: PersonalitySetting;
  /** BREAK DNA: a construction vocabulary the break is built from (absent = NONE; dna.ts) */
  dna?: DnaSetting;
  /** CHOP ▸ DESTROY (Phase 12): event-level destruction after CHOP (absent = none; destroy.ts). Kept so saved breaks reproduce; the DESTROY tab offers to remove it */
  destroy?: DestroySettings;
  /** DESTROY (Phase 14, its own tab): the effect matrix, after the hand edits (absent = never used; destroy2.ts) */
  destroy2?: DestroySettings2;
  /**
   * HI-HAT ACTIVITY 0..1 (revision 3): how active the closed and open hats are. 0 = no generated
   * hats. Absent in recipes saved before revision 3 (they keep the old timekeeper).
   */
  hats?: number;
  /** RIDE ACTIVITY 0..1 (revision 3): how active the ride is. 0 = no generated ride. */
  ride?: number;
  /** CYMBAL RELATIONSHIP (revision 3): how hats and ride share the time (absent = ALTERNATE) */
  cymbals?: CymbalMode;
  /**
   * CYMBALS (revision 4): CLOSED HAT, OPEN HAT, RIDE and CRASH ACTIVITY, SUBDIVISION, the two
   * relationships and OPEN-HAT CHOKE (cymbals4.ts). Absent = the recipe's defaults. Revision 3
   * recipes keep hats / ride / cymbals and bake as they did.
   */
  cym?: CymbalSettings;
  /** CLAP ACTIVITY 0..1 (revision 5): how present the claps are (absent = the recipe's default; 0 = none) */
  clap?: number;
  /** FX ACTIVITY 0..1 (revision 5): how many structural effects (absent = the recipe's default; 0 = none) */
  fx?: number;
}

/**
 * How the hats and the ride share the timekeeping (revision 3). ALTERNATE: one of them keeps the
 * time and the other takes over for some bars or punctuates; LAYER: both may play together;
 * INDEPENDENT: each follows its own rhythmic approach.
 */
export const CYMBAL_MODES = ['alternate', 'layer', 'independent'] as const;
export type CymbalMode = (typeof CYMBAL_MODES)[number];
export const CYMBAL_MODE_LABEL: Record<CymbalMode, string> = { alternate: 'ALTERNATE', layer: 'LAYER', independent: 'INDEPENDENT' };

/** What the rhythmic vocabulary chose for a break (revision 3): shown in the status line and the pattern's tooltip. */
export interface Approach {
  /** the groove approach (kick and snare strategy) */
  groove: string;
  /** the phrase form, one letter per bar role */
  form: string;
  /** how the answer bars develop the motif */
  motif: string;
  /** the hats' approach ('' when there are none) */
  hats: string;
  /** the ride's approach ('' when there is none) */
  ride: string;
  /** how the cymbals develop through the phrase */
  development: string;
}

/** CHOP SLICE SIZE: the typical fragment, in sixteenths (recipes lengthen or shorten some of them). */
export const SLICE_SIZES = ['large', 'medium', 'small', 'micro'] as const;
export type SliceSize = (typeof SLICE_SIZES)[number];
export const SLICE_STEPS: Record<SliceSize, number> = { large: 8, medium: 4, small: 2, micro: 1 };

/**
 * CHOP (chopper.ts): rearranges fragments of the GROOVE. Non-destructive: the result is always
 * computed from the GROOVE baked from the seeds, never from an earlier result.
 */
export interface ChopSettings {
  /** ENABLED (off keeps the settings for later) */
  on: boolean;
  /** AMOUNT 0..1: how much of the phrase is edited (0 = the GROOVE exactly) */
  amount: number;
  slice: SliceSize;
  /** RETRIGGER 0..1: how often and how hard fragments are retriggered (0 = no new retriggers) */
  retrigger: number;
  /** RE-CHOP: another chop of the same GROOVE (0 = the first, from the BEAT seed) */
  variant: number;
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
  /**
   * REGEN TRACK: a lineage of track regenerations. Each step regenerates some tracks (and only
   * them) from a seed derived from the beat seed, the tracks and the step's number (regen.ts).
   */
  regen?: Regen[];
}

/** MUTATE styles: how a mutation varies the groove. */
export const MUTATION_STYLES = ['musical', 'subtle', 'rhythmic', 'fills', 'sparse', 'dense', 'wild'] as const;
export type MutationStyle = (typeof MUTATION_STYLES)[number];

/** MUTATE options. A mutation without them (every mutation made before they existed) replays exactly as it was made. */
export interface MutationOptions {
  style?: MutationStyle;
  /** how radically the groove changes, 0..1 */
  depth?: number;
  /** how much of the phrase may change, 0..1: the last part of it (FILLS: the fill bars) */
  range?: number;
  /** only these tracks change (absent: every track) */
  cats?: Category[];
}

/** One MUTATE step: its seed, which layers it may vary (frozen layers are left alone) and its options. */
export interface Mutation extends MutationOptions {
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
  /** a tom accent or a short tom answer between the kick and snare accents (TOM ACTIVITY) */
  | 'accent'
  /** a four-on-the-floor kick layered under the break (HARDCORE) */
  | 'floor kick'
  /** a hit copied from another place in the groove by a chop (event-level resequencing) */
  | 'chop'
  /** a fast retrigger of the same sound (a roll or stutter) */
  | 'roll'
  /** a repeat made by DESTROY ▸ STUTTER (a transformation the user chose: not a generated roll) */
  | 'stutter'
  /** a generated clap (CLAP track, revision 5): layered backbeat, off-beat accent, answer or phrase accent */
  | 'clap'
  /** a generated effect (FX track, revision 5): an impact, a reversed swell or a transition accent */
  | 'fx'
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
  /**
   * EXPRESSION: transposition in semitones, by sample playback rate as on a hardware sampler (the
   * sound gets shorter as it goes up; no time-stretch). -24..24; absent = 0, the sample as it is.
   */
  pitch?: number;
  /** EXPRESSION: the sample played backwards, starting at the hit's position (absent = forwards) */
  reverse?: true;
  /**
   * DESTROY ▸ REVERSE amount (with reverse): how much of the reversed sample plays, 0..1 (absent =
   * all of it). Less is a shorter swell into the hit's attack: the reversed copy is started later.
   */
  revFrac?: number;
  /** DESTROY ▸ PITCH: fine detune in cents, -100..100, on top of `pitch` (absent = 0) */
  detune?: number;
  /** DESTROY ▸ GATE: the sound is cut after `len` quarter notes, with a `fade` (quarters); `chop` > 0 = a rhythmic gate (on/off every `chop` quarters) */
  gate?: { len: number; fade: number; chop?: number };
  /**
   * DESTROY ▸ TAPE STOP (and a PITCH glide): the playback rate ramps from `from` (x the hit's own
   * rate, 1 = as pitched) to `to` over `len` quarter notes; then, with `back`, back up to 1 over
   * `back` quarters (RESUME), without it the sound stops (CUT; a glide's `to` is above 0.05 and
   * stays there instead: `hold`). A continuous ramp, the same live and rendered.
   */
  tape?: { len: number; from: number; to: number; back?: number; hold?: true };
  /** OPEN-HAT CHOKE off (revision 4): this closed hat does not cut a ringing open hat */
  free?: true;
}

/** EXPRESSION: the pitch range of a hit, semitones either way. */
export const MAX_PITCH = 24;
/** A hit's pitch made safe: a whole number of semitones within ±MAX_PITCH (0 for anything else). */
export const safePitch = (p: unknown): number => (Number.isFinite(Number(p)) ? clamp(Math.round(Number(p)), -MAX_PITCH, MAX_PITCH) : 0) || 0;

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
  /** what CHOP did to the GROOVE (absent when CHOP is off) */
  chop?: ChopReport;
  /** what DESTROY did (absent when it is off) */
  destroy?: DestroyReport;
  /** what the last REGEN TRACK step chose (absent without one) */
  regen?: RegenReport;
  /** what the rhythmic vocabulary chose (revision 3; absent before) */
  approach?: Approach;
  /** what DESTROY (Phase 14) did (absent when it did not run) */
  destroy2?: Destroy2Report;
  /** what the cymbal engine chose and what it could not give (revision 4; absent before) */
  cymReport?: CymbalReport;
  /** the seed's text, when the app knows it (exports and the batch show it) */
  seedName?: string;
}

/** What CHOP did: how many slices it edited, and how. */
export interface ChopReport {
  slices: number;
  edited: number;
  ops: Partial<Record<ChopOp, number>>;
}
export type ChopOp = 'recall' | 'swap' | 'repeat' | 'double' | 'retrigger' | 'gap';

/** Grid ticks of an event from the start of the break. */
export function gridTick(e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>): number {
  return e.bar * TPB + e.step * TPS + e.sub;
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
