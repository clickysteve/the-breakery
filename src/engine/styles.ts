/**
 * Recipes (engine 2). Each is a set of default control values plus the tendencies and MECHANISMS
 * the generator uses: where the backbeat sits, which kicks are fixed, whether a four-on-the-floor
 * kick is layered under the break, which ghost-note figures and hat accent cycles the style
 * favours, how bars develop (exact loops, answers, chopped resequencing, rolls), and the feel.
 * They are generative strategies, not collections of patterns; genre names are tendencies, not
 * guarantees of authenticity.
 *
 * Every number is a DESIGN HYPOTHESIS (docs/BREAKBEAT_RESEARCH.md, part 7), set by musical
 * judgement and by inspecting generated output, not fitted to data. The structure is from the
 * research: backbeat as anchor, kick as the syncopating voice, ghosts around the backbeat, a
 * continuous timekeeper with a repeating accent cycle, variation late in the phrase, subtle swing
 * (classic breaks: median 16th swing ratio 1.2:1, about 54.5 %), chops and end-of-phrase rolls
 * for the UK breakbeat styles.
 *
 * Engine 1 keeps its own frozen copy of the original four (v1/styles.ts).
 */
import { STYLE_DEFS as V1_DEFS, type V1Style } from './v1/styles';
import { CURRENT_ENGINE, type Bars, type Engine, type FlourishKey, type Recipe, type RollTarget, type Style } from './types';

export type FillKind = 'run' | 'displace' | 'drop' | 'stutter' | 'chop' | 'roll';
/** Ghost-note figures around a backbeat b (see support.ts). */
export type GhostFigure = 'anticipate' | 'rebound' | 'pickup' | 'inner' | 'rolling';
/** Timekeeper accent cycles (see support.ts). */
export type AccentCycle = 'beats' | 'offbeats' | 'alternate' | 'backbeat' | 'tresillo';

export interface StyleDef {
  style: Style;
  label: string;
  /** one line: the recipe's musical identity (tooltip) */
  blurb: string;
  /** min, max, default */
  bpm: [number, number, number];
  defaults: Omit<Recipe, 'style' | 'bpm' | 'bars' | 'engine' | FlourishKey>;
  // ---- foundation
  /** 'two-four': snares on 2 and 4; 'three': one backbeat on 3 (half-time feel) */
  backbeat: 'two-four' | 'three';
  /** kick preference per sixteenth (step 0 is always taken; backbeat steps are excluded) */
  kickWeights: number[];
  /** kicks that are always there besides the downbeat (D&B two-step: the "and" of 3) */
  fixedKicks: number[];
  /** kicks per bar at density 0 and 1 (including the downbeat and fixed kicks) */
  kickCount: [number, number];
  /** how much kick pairs (doubles) are preferred, 0..1 */
  kickPairs: number;
  /** chance that a four-on-the-floor kick is layered under the break */
  floor: number;
  /** foundation syncopation (per bar) at SYNCOPATION 0 and 1 */
  syncRange: [number, number];
  /** chance per bar that a backbeat moves (scaled by complexity) */
  displaceP: number;
  /** extra (non-backbeat) snares: chance scale and candidate steps with weights */
  extraSnare: { p: number; steps: Record<number, number> };
  // ---- supporting voices
  /** ghost notes per bar at GHOSTS = 1 */
  ghostMax: number;
  /** nominal ghost level 0..1 */
  ghostLevel: number;
  ghostFigures: Record<GhostFigure, number>;
  /** 32nd-note drags into ghosts and backbeats (scaled by complexity) */
  dragP: number;
  /** density above which the timekeeper plays sixteenths */
  sixteenthsAbove: number;
  /** chance the timekeeper is the ride */
  rideP: number;
  hatAccents: Record<AccentCycle, number>;
  /** open-hat lifts per bar at complexity 1 */
  openMax: number;
  /** open-hat candidate steps with weights */
  openSteps: Record<number, number>;
  /** chance percussion plays at all (scaled by density) */
  percP: number;
  // ---- phrase development
  /** longest fill in sixteenths at FILLS = 1 */
  fillMax: number;
  fillKinds: Record<FillKind, number>;
  /** how much development bars are chopped (event-level resequencing of the groove), 0..1 */
  chop: number;
  /** rolls and stutters anywhere in a chop, not only at its end (BREAKCORE), 0..1 */
  warp: number;
  /** programmed loop: answer bars repeat the groove exactly unless VARIATION is high */
  loop: boolean;
  /** variation also allowed in the first half of answer bars */
  restless: boolean;
  crashP: number;
  // ---- performance
  /** snare lateness on the beat-2 backbeat in ms at HUMANISE = 1 (never early; beat 4 less) */
  snareLag: number;
  /** overall timing deviation scale */
  timingScale: number;
  /** programmed dynamics: velocities from roles, little drift (drum-machine programming) */
  programmed: boolean;
}

const NO_GHOSTS: Record<GhostFigure, number> = { anticipate: 0, rebound: 0, pickup: 0, inner: 0, rolling: 0 };

// prettier-ignore
export const STYLE_DEFS: Record<Style, StyleDef> = {
  funk: {
    style: 'funk', label: 'FUNK', blurb: 'A live funk drummer: sixteenth hats, ghost notes around the backbeat, kicks that syncopate, light swing.',
    bpm: [84, 118, 100],
    defaults: { density: 0.6, complexity: 0.45, syncopation: 0.55, ghosts: 0.65, swing: 0.18, humanise: 0.4, variation: 0.45, fills: 0.35 },
    backbeat: 'two-four',
    //           1    e    &    a    2    e    &    a    3    e    &    a    4    e    &    a
    kickWeights: [0, 0.15, 0.9, 0.45, 0, 0.3, 0.55, 0.75, 0.55, 0.2, 0.95, 0.6, 0, 0.3, 0.55, 0.4],
    fixedKicks: [], kickCount: [2, 6], kickPairs: 0.6, floor: 0,
    syncRange: [1, 9], displaceP: 0.12,
    extraSnare: { p: 0.25, steps: { 7: 1, 9: 0.6, 15: 0.8, 10: 0.3 } },
    ghostMax: 6, ghostLevel: 0.24, ghostFigures: { anticipate: 1, rebound: 0.7, pickup: 0.6, inner: 0.5, rolling: 0.1 }, dragP: 0.15,
    sixteenthsAbove: 0.45, rideP: 0.12, hatAccents: { beats: 1, offbeats: 0.1, alternate: 0.6, backbeat: 1, tresillo: 0.1 },
    openMax: 2, openSteps: { 14: 1, 6: 0.8, 10: 0.55, 2: 0.35 }, percP: 0.35,
    fillMax: 6, fillKinds: { run: 0.4, displace: 0.3, drop: 0.15, stutter: 0.15, chop: 0, roll: 0 },
    chop: 0, warp: 0, loop: false, restless: false, crashP: 0.35,
    snareLag: 18, timingScale: 1, programmed: false,
  },
  hiphop: {
    style: 'hiphop', label: 'HIP-HOP', blurb: 'A sampled break under a rap: space, strong accents, a laid-back snare, more swing.',
    bpm: [76, 100, 90],
    defaults: { density: 0.38, complexity: 0.3, syncopation: 0.45, ghosts: 0.3, swing: 0.32, humanise: 0.45, variation: 0.3, fills: 0.2 },
    backbeat: 'two-four',
    kickWeights: [0, 0.05, 0.55, 0.25, 0, 0.1, 0.2, 0.55, 0.45, 0.2, 0.85, 0.35, 0, 0.1, 0.35, 0.35],
    fixedKicks: [], kickCount: [2, 5], kickPairs: 0.7, floor: 0,
    syncRange: [0, 7], displaceP: 0.05,
    extraSnare: { p: 0.1, steps: { 15: 1, 7: 0.5 } },
    ghostMax: 3, ghostLevel: 0.2, ghostFigures: { anticipate: 1, rebound: 0.4, pickup: 0.3, inner: 0.3, rolling: 0 }, dragP: 0.04,
    sixteenthsAbove: 0.72, rideP: 0.05, hatAccents: { beats: 1, offbeats: 0.2, alternate: 0.3, backbeat: 0.8, tresillo: 0 },
    openMax: 1, openSteps: { 14: 1, 6: 0.6, 10: 0.5 }, percP: 0.25,
    fillMax: 4, fillKinds: { run: 0.15, displace: 0.2, drop: 0.5, stutter: 0.15, chop: 0, roll: 0 },
    chop: 0, warp: 0, loop: false, restless: false, crashP: 0.15,
    snareLag: 24, timingScale: 1, programmed: false,
  },
  jungle: {
    style: 'jungle', label: 'JUNGLE', blurb: 'A break sped up and resequenced: the groove, then chopped and rearranged bars, snare displacements and rolls into the top.',
    bpm: [150, 180, 165],
    defaults: { density: 0.62, complexity: 0.6, syncopation: 0.6, ghosts: 0.6, swing: 0.08, humanise: 0.3, variation: 0.65, fills: 0.6 },
    backbeat: 'two-four',
    kickWeights: [0, 0.1, 0.85, 0.3, 0, 0.25, 0.25, 0.35, 0.3, 0.2, 0.9, 0.85, 0, 0.2, 0.3, 0.35],
    fixedKicks: [], kickCount: [2, 5], kickPairs: 0.7, floor: 0,
    syncRange: [2, 10], displaceP: 0.25,
    extraSnare: { p: 0.35, steps: { 7: 1, 9: 0.9, 15: 0.7, 10: 0.3, 14: 0.4 } },
    ghostMax: 4, ghostLevel: 0.24, ghostFigures: { anticipate: 1, rebound: 0.5, pickup: 1, inner: 0.15, rolling: 0.35 }, dragP: 0.4,
    sixteenthsAbove: 0.8, rideP: 0.5, hatAccents: { beats: 0.7, offbeats: 0.1, alternate: 0.5, backbeat: 1, tresillo: 0.3 },
    openMax: 1, openSteps: { 14: 1, 6: 0.6, 10: 0.5 }, percP: 0.2,
    fillMax: 8, fillKinds: { run: 0.25, displace: 0.2, drop: 0.05, stutter: 0.15, chop: 0.6, roll: 0.5 },
    chop: 0.75, warp: 0.1, loop: false, restless: true, crashP: 0.45,
    snareLag: 9, timingScale: 0.7, programmed: false,
  },
  broken: {
    style: 'broken', label: 'BROKEN', blurb: 'Our own label: displaced accents and odd groupings around a pulse that never quite settles.',
    bpm: [110, 140, 126],
    defaults: { density: 0.5, complexity: 0.65, syncopation: 0.7, ghosts: 0.45, swing: 0.2, humanise: 0.35, variation: 0.55, fills: 0.3 },
    backbeat: 'two-four',
    kickWeights: [0, 0.4, 0.55, 0.6, 0.2, 0.5, 0.6, 0.5, 0.45, 0.5, 0.55, 0.6, 0.2, 0.55, 0.5, 0.5],
    fixedKicks: [], kickCount: [2, 6], kickPairs: 0.3, floor: 0,
    syncRange: [3, 13], displaceP: 0.8,
    extraSnare: { p: 0.35, steps: { 3: 0.6, 7: 0.7, 10: 0.7, 13: 0.6, 15: 0.5 } },
    ghostMax: 5, ghostLevel: 0.23, ghostFigures: { anticipate: 1, rebound: 0.8, pickup: 0.4, inner: 0.6, rolling: 0.2 }, dragP: 0.2,
    sixteenthsAbove: 0.35, rideP: 0.2, hatAccents: { beats: 0.5, offbeats: 0.4, alternate: 0.6, backbeat: 0.4, tresillo: 1 },
    openMax: 2, openSteps: { 14: 1, 6: 0.8, 10: 0.55, 3: 0.4, 11: 0.4 }, percP: 0.5,
    fillMax: 5, fillKinds: { run: 0.25, displace: 0.35, drop: 0.2, stutter: 0.2, chop: 0.15, roll: 0 },
    chop: 0.2, warp: 0, loop: false, restless: true, crashP: 0.2,
    snareLag: 10, timingScale: 0.9, programmed: false,
  },
  boombap: {
    style: 'boombap', label: 'BOOM BAP', blurb: 'Programmed on a sampler: a hard snare on 2 and 4, doubled kicks, MPC-style swing, a loop that repeats exactly until the turnaround.',
    bpm: [84, 98, 92],
    defaults: { density: 0.42, complexity: 0.3, syncopation: 0.5, ghosts: 0.2, swing: 0.36, humanise: 0.1, variation: 0.25, fills: 0.25 },
    backbeat: 'two-four',
    kickWeights: [0, 0.05, 0.75, 0.35, 0, 0.05, 0.15, 0.6, 0.35, 0.15, 0.9, 0.55, 0, 0.05, 0.3, 0.45],
    fixedKicks: [], kickCount: [2, 5], kickPairs: 1, floor: 0,
    syncRange: [1, 7], displaceP: 0.02,
    extraSnare: { p: 0.08, steps: { 15: 1, 7: 0.4 } },
    ghostMax: 2, ghostLevel: 0.22, ghostFigures: { anticipate: 1, rebound: 0.2, pickup: 0.2, inner: 0.2, rolling: 0 }, dragP: 0,
    sixteenthsAbove: 0.8, rideP: 0, hatAccents: { beats: 1, offbeats: 0.6, alternate: 0.2, backbeat: 0.3, tresillo: 0 },
    openMax: 1, openSteps: { 14: 1, 6: 0.4 }, percP: 0.15,
    fillMax: 4, fillKinds: { run: 0.05, displace: 0.15, drop: 0.6, stutter: 0.1, chop: 0.1, roll: 0 },
    chop: 0.05, warp: 0, loop: true, restless: false, crashP: 0.05,
    snareLag: 8, timingScale: 0.6, programmed: true,
  },
  hardcore: {
    style: 'hardcore', label: 'HARDCORE', blurb: 'Breakbeat hardcore: a looped funk break pitched up over a four-on-the-floor kick, chopped into the turnarounds.',
    bpm: [130, 150, 140],
    defaults: { density: 0.6, complexity: 0.5, syncopation: 0.5, ghosts: 0.5, swing: 0.1, humanise: 0.25, variation: 0.5, fills: 0.55 },
    backbeat: 'two-four',
    kickWeights: [0, 0.1, 0.8, 0.4, 0, 0.2, 0.4, 0.5, 0.3, 0.2, 0.9, 0.6, 0, 0.2, 0.4, 0.4],
    fixedKicks: [], kickCount: [2, 5], kickPairs: 0.6, floor: 0.85,
    syncRange: [1, 8], displaceP: 0.1,
    extraSnare: { p: 0.25, steps: { 7: 1, 15: 0.8, 9: 0.5 } },
    ghostMax: 5, ghostLevel: 0.24, ghostFigures: { anticipate: 1, rebound: 0.6, pickup: 0.6, inner: 0.4, rolling: 0.4 }, dragP: 0.2,
    sixteenthsAbove: 0.5, rideP: 0.1, hatAccents: { beats: 0.6, offbeats: 1, alternate: 0.4, backbeat: 0.6, tresillo: 0.1 },
    openMax: 2, openSteps: { 2: 1, 6: 1, 10: 1, 14: 1 }, percP: 0.3,
    fillMax: 8, fillKinds: { run: 0.3, displace: 0.15, drop: 0.1, stutter: 0.2, chop: 0.5, roll: 0.4 },
    chop: 0.4, warp: 0, loop: false, restless: false, crashP: 0.6,
    snareLag: 8, timingScale: 0.7, programmed: false,
  },
  dnb: {
    style: 'dnb', label: 'D&B', blurb: 'Drum & bass two-step: kick on 1 and the "and" of 3, snares on 2 and 4, tight and straight, ghosts kept sparse.',
    bpm: [168, 178, 174],
    defaults: { density: 0.5, complexity: 0.4, syncopation: 0.4, ghosts: 0.4, swing: 0.04, humanise: 0.2, variation: 0.45, fills: 0.4 },
    backbeat: 'two-four',
    kickWeights: [0, 0.05, 0.5, 0.25, 0, 0.05, 0.2, 0.3, 0.05, 0.1, 0, 0.5, 0, 0.05, 0.2, 0.3],
    fixedKicks: [10], kickCount: [2, 4], kickPairs: 0.4, floor: 0,
    syncRange: [1, 6], displaceP: 0.05,
    extraSnare: { p: 0.2, steps: { 7: 1, 15: 0.6, 9: 0.4 } },
    ghostMax: 4, ghostLevel: 0.2, ghostFigures: { anticipate: 1, rebound: 0.4, pickup: 0.6, inner: 0.2, rolling: 0.6 }, dragP: 0.25,
    sixteenthsAbove: 0.45, rideP: 0.35, hatAccents: { beats: 0.4, offbeats: 1, alternate: 0.6, backbeat: 0.5, tresillo: 0 },
    openMax: 1, openSteps: { 14: 1, 6: 0.7 }, percP: 0.25,
    fillMax: 6, fillKinds: { run: 0.3, displace: 0.2, drop: 0.2, stutter: 0.15, chop: 0.3, roll: 0.3 },
    chop: 0.3, warp: 0, loop: false, restless: false, crashP: 0.4,
    snareLag: 6, timingScale: 0.5, programmed: false,
  },
  halftime: {
    style: 'halftime', label: 'HALF-TIME', blurb: 'One backbeat per bar, on 3: the tempo stays fast but the groove feels half as fast; hats keep the fast grid.',
    bpm: [140, 176, 170],
    defaults: { density: 0.45, complexity: 0.4, syncopation: 0.5, ghosts: 0.45, swing: 0.12, humanise: 0.25, variation: 0.4, fills: 0.35 },
    backbeat: 'three',
    kickWeights: [0, 0.1, 0.6, 0.5, 0.3, 0.2, 0.55, 0.6, 0, 0.15, 0.6, 0.55, 0.3, 0.2, 0.55, 0.45],
    fixedKicks: [], kickCount: [1, 4], kickPairs: 0.5, floor: 0,
    syncRange: [1, 8], displaceP: 0.06,
    extraSnare: { p: 0.25, steps: { 15: 1, 14: 0.5, 6: 0.3 } },
    ghostMax: 4, ghostLevel: 0.22, ghostFigures: { anticipate: 1, rebound: 0.6, pickup: 0.7, inner: 0.4, rolling: 0.3 }, dragP: 0.2,
    sixteenthsAbove: 0.35, rideP: 0.1, hatAccents: { beats: 0.6, offbeats: 0.6, alternate: 1, backbeat: 0.6, tresillo: 0.3 },
    openMax: 1, openSteps: { 6: 1, 14: 0.8 }, percP: 0.3,
    fillMax: 6, fillKinds: { run: 0.3, displace: 0.15, drop: 0.3, stutter: 0.1, chop: 0.2, roll: 0.25 },
    chop: 0.15, warp: 0, loop: false, restless: false, crashP: 0.35,
    snareLag: 10, timingScale: 0.8, programmed: false,
  },
  garage: {
    style: 'garage', label: 'GARAGE', blurb: 'UK garage two-step: kicks that skip beats 2 and 4, snares on 2 and 4, heavily shuffled hats and off-beat percussion.',
    bpm: [128, 138, 132],
    defaults: { density: 0.5, complexity: 0.45, syncopation: 0.55, ghosts: 0.3, swing: 0.55, humanise: 0.15, variation: 0.4, fills: 0.25 },
    backbeat: 'two-four',
    kickWeights: [0, 0.05, 0.4, 0.55, 0, 0.1, 0.2, 0.7, 0.45, 0.2, 0.75, 0.5, 0, 0.1, 0.25, 0.35],
    fixedKicks: [], kickCount: [2, 4], kickPairs: 0.4, floor: 0,
    syncRange: [2, 9], displaceP: 0.05,
    extraSnare: { p: 0.2, steps: { 15: 1, 7: 0.6, 14: 0.4 } },
    ghostMax: 3, ghostLevel: 0.24, ghostFigures: { anticipate: 0.6, rebound: 0.6, pickup: 0.2, inner: 0.6, rolling: 0 }, dragP: 0.05,
    sixteenthsAbove: 0.4, rideP: 0, hatAccents: { beats: 0.2, offbeats: 1.2, alternate: 0.4, backbeat: 0.2, tresillo: 0.6 },
    openMax: 2, openSteps: { 2: 0.8, 6: 0.8, 10: 0.8, 14: 1 }, percP: 0.75,
    fillMax: 4, fillKinds: { run: 0.1, displace: 0.3, drop: 0.4, stutter: 0.2, chop: 0, roll: 0.1 },
    chop: 0, warp: 0, loop: true, restless: false, crashP: 0.1,
    snareLag: 5, timingScale: 0.5, programmed: true,
  },
  electro: {
    style: 'electro', label: 'ELECTRO', blurb: 'A drum machine, not a drummer: straight sixteenths, claps on 2 and 4, syncopated kicks, no swing, no ghosts, no humanising.',
    bpm: [108, 132, 120],
    defaults: { density: 0.55, complexity: 0.45, syncopation: 0.6, ghosts: 0, swing: 0, humanise: 0, variation: 0.3, fills: 0.25 },
    backbeat: 'two-four',
    kickWeights: [0, 0.2, 0.5, 0.6, 0, 0.3, 0.5, 0.7, 0.2, 0.3, 0.8, 0.6, 0, 0.3, 0.5, 0.5],
    fixedKicks: [], kickCount: [2, 5], kickPairs: 0.3, floor: 0,
    syncRange: [3, 10], displaceP: 0,
    extraSnare: { p: 0.15, steps: { 15: 1, 7: 0.5 } },
    ghostMax: 0, ghostLevel: 0.25, ghostFigures: NO_GHOSTS, dragP: 0,
    sixteenthsAbove: 0.3, rideP: 0, hatAccents: { beats: 0.4, offbeats: 0.8, alternate: 1, backbeat: 0.3, tresillo: 0.4 },
    openMax: 1, openSteps: { 14: 1, 6: 0.6, 2: 0.4 }, percP: 0.6,
    fillMax: 4, fillKinds: { run: 0.2, displace: 0.1, drop: 0.3, stutter: 0.4, chop: 0, roll: 0.2 },
    chop: 0, warp: 0, loop: true, restless: false, crashP: 0.05,
    snareLag: 0, timingScale: 0.2, programmed: true,
  },
  breakcore: {
    style: 'breakcore', label: 'BREAKCORE', blurb: 'A break cut to pieces at high speed: chops in every development bar, rolls and accelerating stutters anywhere.',
    bpm: [160, 220, 190],
    defaults: { density: 0.7, complexity: 0.8, syncopation: 0.7, ghosts: 0.5, swing: 0, humanise: 0.15, variation: 0.85, fills: 0.8 },
    backbeat: 'two-four',
    kickWeights: [0, 0.3, 0.8, 0.4, 0, 0.3, 0.4, 0.5, 0.4, 0.3, 0.9, 0.7, 0, 0.3, 0.4, 0.5],
    fixedKicks: [], kickCount: [2, 6], kickPairs: 0.5, floor: 0,
    syncRange: [3, 12], displaceP: 0.3,
    extraSnare: { p: 0.4, steps: { 7: 1, 9: 0.8, 15: 0.7, 10: 0.4, 14: 0.4 } },
    ghostMax: 5, ghostLevel: 0.24, ghostFigures: { anticipate: 1, rebound: 0.5, pickup: 0.8, inner: 0.3, rolling: 1 }, dragP: 0.5,
    sixteenthsAbove: 0.6, rideP: 0.3, hatAccents: { beats: 0.5, offbeats: 0.3, alternate: 0.6, backbeat: 0.8, tresillo: 0.6 },
    openMax: 1, openSteps: { 14: 1, 6: 0.6 }, percP: 0.2,
    fillMax: 8, fillKinds: { run: 0.2, displace: 0.1, drop: 0.1, stutter: 0.3, chop: 0.8, roll: 0.8 },
    chop: 1, warp: 0.6, loop: false, restless: true, crashP: 0.5,
    snareLag: 4, timingScale: 0.4, programmed: false,
  },
};

/** The recipe's defaults as engine 1 shipped them (only the original four exist there). */
function v1Defaults(style: Style): StyleDef['defaults'] | null {
  const d = V1_DEFS[style as V1Style];
  return d ? d.defaults : null;
}

/** A fresh recipe with the style's defaults (engine 1 uses its own, as released, with no TOMS or ROLLS). */
export function defaultRecipe(style: Style = 'funk', bars: Bars = 2, engine: Engine = CURRENT_ENGINE): Recipe {
  const d = STYLE_DEFS[style];
  const old = engine === 1 ? v1Defaults(style) : null;
  const fl = FLOURISH[style].defaults;
  return { style, bpm: d.bpm[2], bars, engine: old ? 1 : 2, ...(old ? { ...old, ...fl, toms: 0, rolls: 0 } : { ...d.defaults, ...fl }) };
}

// ------------------------------------------------------------------ TOMS and ROLLS (engine 2)

/** Tom figures (toms.ts). */
export type TomFigure = 'descend' | 'ascend' | 'alternate' | 'answer' | 'linear';

/**
 * Each recipe's toms and rolls: the defaults of the TOMS and ROLLS controls, how readily the toms
 * join fills (tomP) and which figures they play, how readily rolls appear (rollP) and which drums
 * tend to roll. Design hypotheses like the rest of the recipes: funk and half-time drummers go
 * round the toms; hip-hop, boom bap and garage barely touch them (an answer at most); jungle, D&B
 * and breakcore roll the snare at 32nds and faster; garage and hip-hop roll the hats.
 */
export interface Flourish {
  defaults: Pick<Recipe, FlourishKey>;
  tomP: number;
  tomFigures: Record<TomFigure, number>;
  rollP: number;
  rollWeights: Record<RollTarget, number>;
}

// prettier-ignore
export const FLOURISH: Record<Style, Flourish> = {
  funk:      { defaults: { toms: 0.35, rolls: 0.15, rollLength: 4, rollSpeed: '32', rollDynamics: 'crescendo', rollPlace: 'accent', rollTargets: ['snare', 'tom'] },
               tomP: 1, tomFigures: { descend: 1, ascend: 0.3, alternate: 0.6, answer: 0.5, linear: 0.4 }, rollP: 0.5, rollWeights: { snare: 1, hat: 0.4, perc: 0.3, tom: 0.6, kick: 0.1 } },
  hiphop:    { defaults: { toms: 0.2, rolls: 0.2, rollLength: 3, rollSpeed: '32', rollDynamics: 'even', rollPlace: 'accent', rollTargets: ['hat', 'snare'] },
               tomP: 0.6, tomFigures: { descend: 0.6, ascend: 0.2, alternate: 0.3, answer: 1, linear: 0.2 }, rollP: 0.5, rollWeights: { snare: 0.6, hat: 1, perc: 0.3, tom: 0.3, kick: 0.2 } },
  jungle:    { defaults: { toms: 0.3, rolls: 0.45, rollLength: 6, rollSpeed: '32', rollDynamics: 'crescendo', rollPlace: 'accent', rollTargets: ['snare', 'hat', 'tom'] },
               tomP: 0.7, tomFigures: { descend: 0.8, ascend: 0.3, alternate: 0.6, answer: 0.4, linear: 0.6 }, rollP: 1, rollWeights: { snare: 1, hat: 0.5, perc: 0.3, tom: 0.5, kick: 0.2 } },
  broken:    { defaults: { toms: 0.35, rolls: 0.3, rollLength: 4, rollSpeed: '32', rollDynamics: 'human', rollPlace: 'anywhere', rollTargets: ['snare', 'perc', 'tom'] },
               tomP: 0.9, tomFigures: { descend: 0.5, ascend: 0.5, alternate: 0.7, answer: 0.6, linear: 0.8 }, rollP: 0.7, rollWeights: { snare: 0.8, hat: 0.5, perc: 0.8, tom: 0.6, kick: 0.3 } },
  boombap:   { defaults: { toms: 0.15, rolls: 0.1, rollLength: 3, rollSpeed: '32', rollDynamics: 'even', rollPlace: 'phrase', rollTargets: ['snare'] },
               tomP: 0.5, tomFigures: { descend: 0.5, ascend: 0.1, alternate: 0.3, answer: 1, linear: 0.1 }, rollP: 0.35, rollWeights: { snare: 1, hat: 0.5, perc: 0.2, tom: 0.3, kick: 0.1 } },
  hardcore:  { defaults: { toms: 0.25, rolls: 0.4, rollLength: 8, rollSpeed: '32', rollDynamics: 'crescendo', rollPlace: 'phrase', rollTargets: ['snare', 'kick'] },
               tomP: 0.6, tomFigures: { descend: 1, ascend: 0.2, alternate: 0.4, answer: 0.2, linear: 0.5 }, rollP: 0.9, rollWeights: { snare: 1, hat: 0.3, perc: 0.1, tom: 0.4, kick: 0.6 } },
  dnb:       { defaults: { toms: 0.3, rolls: 0.4, rollLength: 4, rollSpeed: '32', rollDynamics: 'crescendo', rollPlace: 'accent', rollTargets: ['snare', 'hat', 'tom'] },
               tomP: 0.7, tomFigures: { descend: 0.8, ascend: 0.3, alternate: 0.5, answer: 0.3, linear: 0.7 }, rollP: 0.9, rollWeights: { snare: 1, hat: 0.6, perc: 0.3, tom: 0.5, kick: 0.2 } },
  halftime:  { defaults: { toms: 0.4, rolls: 0.3, rollLength: 6, rollSpeed: '32t', rollDynamics: 'crescendo', rollPlace: 'phrase', rollTargets: ['snare', 'hat', 'tom'] },
               tomP: 1, tomFigures: { descend: 1, ascend: 0.4, alternate: 0.5, answer: 0.5, linear: 0.6 }, rollP: 0.8, rollWeights: { snare: 1, hat: 0.7, perc: 0.3, tom: 0.6, kick: 0.2 } },
  garage:    { defaults: { toms: 0.1, rolls: 0.25, rollLength: 3, rollSpeed: '16t', rollDynamics: 'alternating', rollPlace: 'accent', rollTargets: ['hat', 'perc'] },
               tomP: 0.4, tomFigures: { descend: 0.3, ascend: 0.2, alternate: 0.3, answer: 1, linear: 0.2 }, rollP: 0.7, rollWeights: { snare: 0.5, hat: 1, perc: 0.8, tom: 0.2, kick: 0.1 } },
  electro:   { defaults: { toms: 0.3, rolls: 0.2, rollLength: 4, rollSpeed: '16', rollDynamics: 'even', rollPlace: 'phrase', rollTargets: ['snare', 'tom'] },
               tomP: 0.8, tomFigures: { descend: 1, ascend: 0.5, alternate: 0.3, answer: 0.4, linear: 0.3 }, rollP: 0.6, rollWeights: { snare: 1, hat: 0.6, perc: 0.3, tom: 0.7, kick: 0.3 } },
  breakcore: { defaults: { toms: 0.3, rolls: 0.7, rollLength: 8, rollSpeed: '64', rollDynamics: 'crescendo', rollPlace: 'anywhere', rollTargets: ['snare', 'kick', 'hat', 'tom'] },
               tomP: 0.7, tomFigures: { descend: 0.7, ascend: 0.5, alternate: 0.6, answer: 0.3, linear: 0.8 }, rollP: 1.3, rollWeights: { snare: 1, hat: 0.5, perc: 0.4, tom: 0.5, kick: 0.7 } },
};
