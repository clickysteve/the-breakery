/**
 * BREAK DNA grammar (GROOVE revision 4, Phase 14): what each BREAK DNA builds a break from.
 * Research, sources and how they shaped these tables: docs/break-dna-research.md.
 *
 * A DNA is a VOCABULARY, not a pattern. Each one defines:
 *   - per-beat CELLS: small kick figures (and the syncopated snares that go with them) that the
 *     DNA uses on each beat of the bar, weighted; a seed picks one cell per beat, so the motif bar
 *     is one of hundreds of combinations
 *   - the BACKBEAT and the GHOST and PERCUSSION figures around it
 *   - a phrase UNIT (A A V B, A V A V …): how its bars relate, and the DEVELOPMENT operations its
 *     V (variation), B (break) and T (turnaround) bars use (a delayed backbeat, a dropped downbeat,
 *     a shifted kick, a pull-out, a percussion burst …), chosen per break by the seed
 *   - CYMBAL LEANS: which subdivision and figure its timekeeping favours, where its open hats
 *     and crashes go. They lean the cymbal engine's choices; they never decide how many cymbal
 *     hits there are (CLOSED HAT, OPEN HAT, RIDE and CRASH ACTIVITY do)
 *   - CHOP LEANS: how CHOP cuts it (dna.ts dnaChopStyle)
 *
 * INFLUENCE blends the DNA into the recipe's own phrase. Every DNA figure has a fixed threshold
 * drawn from the BEAT seed, and is used when INFLUENCE (scaled by how essential the figure is,
 * and by GHOSTS for ghost figures) passes it; every recipe kick or snare the DNA would not play
 * has its own threshold for being given up. Thresholds do not move with INFLUENCE, so a higher
 * INFLUENCE is the same break with more of the DNA in it (monotonic), and 0 is the recipe
 * exactly. The DNA never adds toms, rolls or cymbals, never moves HALFTIME's backbeat off 3, and
 * keeps a recipe's four-on-the-floor kicks.
 */
import { stream, type Rng } from './rng';
import { posName } from './meter';
import type { CymbalId } from './approaches';
import type { ChopStyle } from './chopper';
import { clamp, STEPS, type BarRole, type Category, type Hit, type Recipe, type Role } from './types';

/** A kick figure inside one beat (offsets 0 = on the beat, 1 = "e", 2 = "&", 3 = "a"), with the syncopated snares that go with it. */
export interface Cell {
  k: number[];
  s?: number[];
  w: number;
}
/** How a bar of the DNA's unit develops the motif. */
export type Slot = 'A' | 'V' | 'B' | 'T';
export type DevOp = 'delayBackbeat' | 'pushBackbeat' | 'dropDownbeat' | 'kickShift' | 'kickAdd' | 'kickDrop' | 'snareSync' | 'pull' | 'echo' | 'percBurst' | 'doubleKick' | 'run' | 'ghostShift';
/** The subdivisions a DNA's timekeeping leans to (cymbals4.ts). */
export type GridLean = Partial<Record<'4' | '8' | '16' | '32' | 't', number>>;

export interface DnaDef {
  label: string;
  /** a specific recording, or a broader tradition */
  kind: 'recording' | 'tradition';
  /** the recording or tradition it is informed by */
  source: string;
  /** one line on its musical character (the PERSONALITY tab) */
  blurb: string;
  /** kick cells per beat */
  beats: [Cell[], Cell[], Cell[], Cell[]];
  /** the backbeat steps (snares) */
  backbeat: number[];
  /** ghost candidates (step: weight) and how many at most per bar at GHOSTS 100% */
  ghosts: { steps: Record<number, number>; max: number };
  /** a percussion part (the DNA's own: hand percussion, tambourine, claps) */
  perc?: { steps: Record<number, number>; count: [number, number]; core: number; what: string };
  /** the phrase unit, one slot per bar of a four-bar unit */
  unit: [Slot, Slot, Slot, Slot];
  /** development operations of the V and B bars (weights) */
  dev: { V: Partial<Record<DevOp, number>>; B: Partial<Record<DevOp, number>> };
  /** turnaround operations of the T bar (weights) */
  turn: Partial<Record<DevOp, number>>;
  /** cymbal leans: subdivision, figure, open-hat steps (per slot), crash steps, how much the ride keeps time */
  cym: { grid: GridLean; figure: Partial<Record<CymbalId, number>>; open: Partial<Record<Slot, number[]>>; crash: { slot: Slot; step: number }[]; ride: number };
  /** CHOP leans (added to the recipe's chop style, scaled by INFLUENCE) */
  chop: Partial<Pick<ChopStyle, 'snareLed' | 'motif' | 'gap' | 'tail' | 'swap'>>;
}

const C = (k: number[], w: number, s?: number[]): Cell => (s ? { k, s, w } : { k, w });

// prettier-ignore
export const DNA_DEFS = {
  amen: {
    label: 'AMEN', kind: 'recording', source: 'The Winstons, “Amen, Brother” (1969; drums Gregory C. Coleman)',
    blurb: 'Four-bar A A A′ B unit: a funk bar twice, a delayed backbeat, then a bar without its downbeat, syncopated snares, an early crash.',
    beats: [
      [C([0, 2], 3), C([0], 1), C([0, 3], 0.6)],
      [C([], 2, [3]), C([], 0.8), C([2], 0.4, [3])],
      [C([2, 3], 3, [1]), C([2], 1, [1]), C([0, 2], 0.6)],
      [C([], 2, [3]), C([], 1), C([2], 0.4)],
    ],
    backbeat: [4, 12], ghosts: { steps: { 5: 0.5, 13: 0.4, 11: 0.3 }, max: 2 },
    unit: ['A', 'A', 'V', 'B'],
    dev: { V: { delayBackbeat: 3, pushBackbeat: 1 }, B: { dropDownbeat: 3, run: 0.8, snareSync: 1 } },
    turn: { run: 1, delayBackbeat: 1, snareSync: 1 },
    cym: { grid: { 8: 3, 16: 0.6 }, figure: { eighths: 2.5, broken: 1 }, open: {}, crash: [{ slot: 'B', step: 10 }], ride: 1.6 },
    chop: { snareLed: 0.7, motif: 0.8, gap: 0.25, tail: 0.6, swap: 0.3 },
  },
  funky: {
    label: 'FUNKY DRUMMER', kind: 'recording', source: 'James Brown, “Funky Drummer” (1970; drums Clyde Stubblefield)',
    blurb: 'Repetitive funk pocket: kick on the first two eighths, syncopated answers, ghost-note detail, offbeat open hats, hypnotic two-bar phrasing.',
    beats: [
      [C([0, 2], 3), C([0, 2, 3], 1), C([0, 3], 0.5)],
      [C([], 2), C([3], 1.2), C([], 0.6, [3])],
      [C([2], 2), C([1, 2], 0.8), C([3], 1), C([0, 2], 0.5)],
      [C([], 2), C([2], 0.8), C([], 0.5, [3])],
    ],
    backbeat: [4, 12], ghosts: { steps: { 1: 0.4, 3: 0.5, 5: 0.7, 6: 0.4, 7: 0.8, 9: 0.6, 11: 0.7, 13: 0.7, 15: 0.6 }, max: 5 },
    unit: ['A', 'V', 'A', 'V'],
    dev: { V: { kickShift: 2, kickAdd: 1, ghostShift: 1.5, pull: 1 }, B: { kickShift: 1, pull: 1.5 } },
    turn: { pull: 1, kickShift: 1, snareSync: 0.6 },
    cym: { grid: { 16: 3, 8: 0.5 }, figure: { sixteenths: 3, eighths: 0.6 }, open: { A: [14], V: [10, 14] }, crash: [], ride: 0.3 },
    chop: { motif: 0.6, swap: 0.2 },
  },
  apache: {
    label: 'APACHE', kind: 'recording', source: 'Incredible Bongo Band, “Apache” (1973)',
    blurb: 'A percussion-led break: interlocking bongo and conga figures on the sixteenths over a plain, heavy kick and snare.',
    beats: [
      [C([0], 2), C([0, 2], 1.5), C([0, 3], 0.5)],
      [C([], 2), C([2], 1), C([3], 0.6)],
      [C([0], 1), C([2], 1.5), C([], 1), C([0, 2], 0.6)],
      [C([], 2), C([2], 0.7)],
    ],
    backbeat: [4, 12], ghosts: { steps: { 7: 0.4, 15: 0.4 }, max: 1 },
    perc: { steps: { 0: 0.4, 2: 0.8, 3: 0.9, 6: 0.7, 7: 0.8, 10: 0.8, 11: 0.9, 14: 0.7, 15: 0.8, 1: 0.3, 5: 0.3, 9: 0.3, 13: 0.3 }, count: [4, 8], core: 0.75, what: 'bongo' },
    unit: ['A', 'A', 'A', 'V'],
    dev: { V: { percBurst: 2, kickShift: 1 }, B: { percBurst: 2, kickDrop: 1 } },
    turn: { percBurst: 2, kickAdd: 0.6 },
    cym: { grid: { 8: 2, 16: 1.5 }, figure: { eighths: 2, broken: 1.2 }, open: {}, crash: [], ride: 0.5 },
    chop: { motif: 0.5, gap: 0.2 },
  },
  think: {
    label: 'THINK', kind: 'recording', source: 'Lyn Collins, “Think (About It)” (1972)',
    blurb: 'Driving and bright: kicks pushing into the backbeats, a busy tambourine layer, a syncopated turnaround. A jungle and D&B staple.',
    beats: [
      [C([0], 1.5), C([0, 3], 1.2), C([0, 2], 1)],
      [C([], 1), C([2], 1.5), C([2, 3], 0.6)],
      [C([0], 0.6), C([2], 1.2), C([], 1), C([3], 1)],
      [C([], 1.5), C([2], 0.6), C([], 0.5, [3])],
    ],
    backbeat: [4, 12], ghosts: { steps: { 3: 0.4, 7: 0.6, 9: 0.5, 11: 0.4, 15: 0.6 }, max: 3 },
    perc: { steps: { 2: 1, 6: 1, 10: 1, 14: 1, 0: 0.5, 4: 0.5, 8: 0.5, 12: 0.5, 1: 0.3, 3: 0.3, 5: 0.3, 7: 0.3, 9: 0.3, 11: 0.3, 13: 0.3, 15: 0.3 }, count: [4, 8], core: 0.55, what: 'tambourine' },
    unit: ['A', 'A', 'V', 'T'],
    dev: { V: { kickShift: 1, snareSync: 1, kickAdd: 0.6 }, B: { snareSync: 1.5, dropDownbeat: 0.5 } },
    turn: { snareSync: 1.5, run: 1, kickAdd: 0.8 },
    cym: { grid: { 16: 2, 8: 2 }, figure: { sixteenths: 2, eighths: 1.5, gallop: 0.6 }, open: { T: [14], A: [6] }, crash: [{ slot: 'A', step: 0 }], ride: 0.6 },
    chop: { snareLed: 0.5, motif: 0.4, tail: 0.4 },
  },
  impeach: {
    label: 'IMPEACH', kind: 'recording', source: 'The Honey Drippers, “Impeach the President” (1973)',
    blurb: 'A tight, spare two-bar hip-hop backbone: kick on 1 and around 3, plain backbeats, and the hi-hat lift near the end of the pattern.',
    beats: [
      [C([0], 2.5), C([0, 2], 0.8)],
      [C([], 1.5), C([3], 1.5)],
      [C([0], 1.5), C([0, 2], 1), C([2], 0.6)],
      [C([], 2), C([2], 0.5)],
    ],
    backbeat: [4, 12], ghosts: { steps: { 7: 0.3, 15: 0.3 }, max: 1 },
    unit: ['A', 'V', 'A', 'V'],
    dev: { V: { kickShift: 1.5, kickAdd: 1 }, B: { kickShift: 1 } },
    turn: { kickAdd: 1, pull: 0.5 },
    cym: { grid: { 8: 3, 16: 0.5 }, figure: { eighths: 3 }, open: { V: [14], A: [] }, crash: [], ride: 0.2 },
    chop: { motif: 0.4, gap: 0.3 },
  },
  roachclip: {
    label: 'ROACHCLIP', kind: 'recording', source: 'The Soul Searchers, “Ashley’s Roachclip” (1974)',
    blurb: 'Single-stroke eighth hats with a tambourine filling the double feel, an even kick and snare, a double kick ending the phrase.',
    beats: [
      [C([0], 1.5), C([0, 2], 1.5)],
      [C([], 2), C([2], 0.8)],
      [C([0], 1), C([2], 1.2), C([0, 2], 0.8)],
      [C([], 2), C([2], 0.6)],
    ],
    backbeat: [4, 12], ghosts: { steps: { 7: 0.4, 9: 0.3, 15: 0.4 }, max: 2 },
    perc: { steps: { 1: 0.8, 3: 0.8, 5: 0.8, 7: 0.8, 9: 0.8, 11: 0.8, 13: 0.8, 15: 0.8, 0: 0.5, 2: 0.5, 4: 0.5, 6: 0.5, 8: 0.5, 10: 0.5, 12: 0.5, 14: 0.5 }, count: [6, 12], core: 0.6, what: 'tambourine' },
    unit: ['A', 'A', 'A', 'T'],
    dev: { V: { kickShift: 1 }, B: { kickShift: 1, ghostShift: 1 } },
    turn: { doubleKick: 3 },
    cym: { grid: { 8: 3, 16: 0.3 }, figure: { eighths: 3 }, open: { T: [6, 10, 14] }, crash: [], ride: 0.2 },
    chop: { tail: 0.3, motif: 0.3 },
  },
  boogie: {
    label: 'BOOGIE', kind: 'tradition', source: 'Disco and boogie-funk drumming (a tradition, not one recording)',
    blurb: 'Four on the floor under the backbeat, sixteenth pickups into the beats, open hats on the “and”s, claps on 2 and 4.',
    beats: [
      [C([0], 3), C([0, 3], 0.6), C([0, 2], 0.3)],
      [C([0], 3), C([0, 3], 0.4)],
      [C([0], 3), C([0, 3], 0.6), C([0, 2], 0.3)],
      [C([0], 3), C([0, 3], 0.5)],
    ],
    backbeat: [4, 12], ghosts: { steps: { 6: 0.3, 14: 0.3 }, max: 1 },
    perc: { steps: { 4: 0.9, 12: 0.9, 2: 0.4, 6: 0.4, 10: 0.4, 14: 0.4 }, count: [2, 4], core: 0.5, what: 'clap and shaker' },
    unit: ['A', 'A', 'A', 'V'],
    dev: { V: { kickAdd: 1, percBurst: 0.6 }, B: { kickAdd: 1 } },
    turn: { snareSync: 1, run: 0.6 },
    cym: { grid: { 16: 2, 8: 2 }, figure: { offbeats: 3, eighths: 1.5 }, open: { A: [2, 6, 10, 14], V: [2, 6, 10, 14], T: [2, 6, 10, 14], B: [2, 6, 10, 14] }, crash: [{ slot: 'A', step: 0 }], ride: 0.3 },
    chop: { motif: 0.3 },
  },
  motorik: {
    label: 'MOTORIK', kind: 'tradition', source: 'Motorik (Can, Neu!: a tradition, not one recording)',
    blurb: 'The endless straight beat: kick on the eighths around the snares, straight eighth hats, no ghosts, almost no development.',
    beats: [
      [C([0, 2], 3), C([0], 0.6)],
      [C([2], 2), C([], 1)],
      [C([0, 2], 3), C([0], 0.6)],
      [C([2], 2), C([], 1)],
    ],
    backbeat: [4, 12], ghosts: { steps: {}, max: 0 },
    unit: ['A', 'A', 'A', 'A'],
    dev: { V: {}, B: {} },
    turn: { snareSync: 0.3 },
    cym: { grid: { 8: 4 }, figure: { eighths: 4 }, open: {}, crash: [{ slot: 'A', step: 0 }], ride: 0.2 },
    chop: { motif: 0.2 },
  },
} satisfies Record<string, DnaDef>;

export type GrammarId = keyof typeof DNA_DEFS;

/** A figure of the DNA bar: a hit and how essential it is to the identity (0..1). */
export interface Figure {
  cat: Category;
  step: number;
  level: number;
  role: Role;
  core: number;
  what: string;
}
const F = (cat: Category, step: number, level: number, role: Role, core: number, what: string): Figure => ({ cat, step, level, role, core, what });

/** Each bar's slot in the DNA's unit. A phrase longer than one bar ends on its unit's last slot (where the development is). */
export function dnaSlots(roles: readonly BarRole[], unit: readonly Slot[]): Slot[] {
  const n = roles.length;
  return roles.map((r, i) => {
    if (n === 1) return 'A';
    if (i === n - 1) return unit[3] === 'A' ? (r === 'T' ? 'T' : 'A') : unit[3]!;
    // a half-way fill bar takes the unit's last slot, so each four-bar section ends developed
    if (r === 'F') return unit[3]!;
    return unit[i % 4]!;
  });
}

const kickRole = (step: number): Role => (step === 0 ? 'downbeat' : step % 4 === 3 ? 'pickup kick' : step % 2 === 1 || step % 4 === 2 ? 'syncopated kick' : 'kick');

/** The motif bar: one cell per beat, the backbeats, the ghosts and the percussion. */
function motifBar(def: DnaDef, rng: Rng): Figure[] {
  const out: Figure[] = [];
  def.beats.forEach((cells, b) => {
    const i = Math.max(0, rng.weighted(cells.map((c) => c.w)));
    const cell = cells[i]!;
    const maxW = Math.max(...cells.map((c) => c.w));
    const core = 0.55 + 0.4 * (cell.w / maxW);
    for (const k of cell.k) {
      const step = b * 4 + k;
      const floor = def.backbeat.includes(step);
      out.push(F('kick', step, step === 0 ? 0.95 : k === 0 ? 0.86 : 0.78, floor ? 'floor kick' : kickRole(step), step === 0 ? 1 : core, `the kick on ${posName(step)}`));
    }
    for (const s of cell.s ?? []) out.push(F('snare', b * 4 + s, 0.6, 'extra snare', core * 0.9, `the syncopated snare on ${posName(b * 4 + s)}`));
  });
  for (const s of def.backbeat) out.push(F('snare', s, 0.92, 'backbeat', 1, `the backbeat on ${posName(s)}`));
  // ghosts: the DNA's own ghost places, chosen once for the phrase
  const g = Object.entries(def.ghosts.steps).map(([s, w]) => [Number(s), w] as const);
  const ws = g.map(([, w]) => w);
  const n = def.ghosts.max ? 1 + rng.int(def.ghosts.max) : 0;
  for (let j = 0; j < n; j++) {
    const i = rng.weighted(ws);
    if (i < 0) break;
    ws[i] = 0;
    const s = g[i]![0];
    out.push(F('ghost', s, 0.24, 'ghost', 0.35 + 0.3 * g[i]![1], `a ghost note on ${posName(s)}`));
  }
  if (def.perc) {
    const p = Object.entries(def.perc.steps).map(([s, w]) => [Number(s), w] as const);
    const pw = p.map(([, w]) => w);
    const m = def.perc.count[0] + rng.int(def.perc.count[1] - def.perc.count[0] + 1);
    for (let j = 0; j < m; j++) {
      const i = rng.weighted(pw);
      if (i < 0) break;
      pw[i] = 0;
      const s = p[i]![0];
      out.push(F('perc', s, s % 4 === 0 ? 0.66 : s % 2 === 0 ? 0.58 : 0.48, 'perc', def.perc.core * (0.7 + 0.3 * p[i]![1]), `the ${def.perc.what} on ${posName(s)}`));
    }
  }
  return sortFigs(out);
}

const sortFigs = (fs: Figure[]): Figure[] => {
  const m = new Map<string, Figure>();
  for (const f of fs) if (f.step >= 0 && f.step < STEPS) m.set(`${f.cat}|${f.step}`, f);
  return [...m.values()].sort((a, b) => a.step - b.step || a.cat.localeCompare(b.cat));
};

/** One development operation on a bar of figures (from the break's own stream, so every V bar of a phrase develops the same way). */
function develop(figs: Figure[], op: DevOp, rng: Rng): Figure[] {
  let out = figs.map((f) => ({ ...f }));
  const has = (cat: Category, s: number) => out.some((f) => f.cat === cat && f.step === s);
  switch (op) {
    case 'delayBackbeat': {
      const to = rng.chance(0.65) ? 14 : 13;
      out = out.filter((f) => !(f.cat === 'snare' && f.step >= 12) && !(f.cat === 'kick' && f.step === to));
      out.push(F('snare', to, 0.9, 'displaced backbeat', 1, `the last backbeat delayed to ${posName(to)}`));
      break;
    }
    case 'pushBackbeat': {
      out = out.filter((f) => !(f.cat === 'snare' && f.step === 12));
      out.push(F('snare', 11, 0.88, 'displaced backbeat', 0.95, 'the last backbeat pushed early, to 3a'));
      break;
    }
    case 'dropDownbeat':
      out = out.filter((f) => !(f.cat === 'kick' && f.step === 0));
      if (!has('kick', 2)) out.push(F('kick', 2, 0.85, 'syncopated kick', 0.95, 'the kick on 1& (the downbeat left out)'));
      if (!has('snare', 1) && rng.chance(0.6)) out.push(F('snare', 1, 0.6, 'extra snare', 0.85, 'the snare on 1e'));
      break;
    case 'kickShift': {
      const ks = out.filter((f) => f.cat === 'kick' && f.step !== 0);
      if (!ks.length) break;
      const k = ks[rng.int(ks.length)]!;
      const to = k.step + (rng.chance(0.5) ? 1 : -1);
      if (to <= 0 || to >= STEPS || has('kick', to) || has('snare', to)) break;
      k.step = to;
      k.role = kickRole(to);
      k.what = `the kick moved to ${posName(to)}`;
      break;
    }
    case 'kickAdd': {
      const free = [3, 6, 7, 10, 11, 14, 15].filter((s) => !has('kick', s) && !has('snare', s));
      if (free.length) {
        const s = free[rng.int(free.length)]!;
        out.push(F('kick', s, 0.74, kickRole(s), 0.8, `an added kick on ${posName(s)}`));
      }
      break;
    }
    case 'kickDrop': {
      const ks = out.filter((f) => f.cat === 'kick' && f.step !== 0);
      if (ks.length) out = out.filter((f) => f !== ks[rng.int(ks.length)]);
      break;
    }
    case 'snareSync': {
      const free = [7, 9, 11, 13, 15].filter((s) => !has('snare', s) && !has('kick', s));
      if (free.length) {
        const s = free[rng.int(free.length)]!;
        out.push(F('snare', s, 0.62, 'extra snare', 0.85, `a syncopated snare on ${posName(s)}`));
      }
      break;
    }
    case 'pull':
      // a pull-out: the hands and feet leave a gap late in the bar (the backbeat stays)
      out = out.filter((f) => !(f.step >= 11 && f.step <= 13 && f.cat !== 'snare') && !(f.cat === 'snare' && f.role === 'extra snare' && f.step >= 11));
      break;
    case 'echo': {
      const first = out.filter((f) => f.step < 8 && (f.cat === 'kick' || f.cat === 'perc'));
      out = out.filter((f) => !(f.step >= 8 && (f.cat === 'kick' || f.cat === 'perc')) || f.role === 'floor kick');
      for (const f of first) if (!has(f.cat, f.step + 8) && !(f.cat === 'kick' && has('snare', f.step + 8))) out.push({ ...f, step: f.step + 8, what: `${f.what}, echoed in the second half` });
      break;
    }
    case 'percBurst':
      for (let s = 12; s < STEPS; s++) if (!has('perc', s)) out.push(F('perc', s, 0.5 + 0.06 * (s - 12), 'perc', 0.7, 'a percussion burst into the next bar'));
      break;
    case 'doubleKick':
      for (const s of [14, 15]) if (!has('kick', s)) out.push(F('kick', s, 0.82, kickRole(s), 0.95, `the double kick ending the phrase (${posName(s)})`));
      out = out.filter((f) => !(f.cat === 'snare' && f.role === 'extra snare' && f.step >= 13));
      break;
    case 'run':
      out = out.filter((f) => !(f.step >= 12 && (f.cat === 'ghost' || (f.cat === 'snare' && f.role !== 'backbeat'))));
      for (const s of [13, 14, 15]) out.push(F('snare', s, 0.66 + 0.08 * (s - 12), 'fill', 0.9, 'the turnaround run'));
      break;
    case 'ghostShift': {
      const gs = out.filter((f) => f.cat === 'ghost');
      if (!gs.length) break;
      const g = gs[rng.int(gs.length)]!;
      const to = g.step + (rng.chance(0.5) ? 2 : -2);
      if (to > 0 && to < STEPS && !has('snare', to) && !has('ghost', to)) g.step = to;
      break;
    }
  }
  return sortFigs(out);
}

const pickOps = (w: Partial<Record<DevOp, number>>, rng: Rng, n: number): DevOp[] => {
  const ops = Object.keys(w) as DevOp[];
  const ws = ops.map((o) => w[o]!);
  const out: DevOp[] = [];
  for (let i = 0; i < n; i++) {
    const j = rng.weighted(ws);
    if (j < 0) break;
    out.push(ops[j]!);
    ws[j] = 0;
  }
  return out;
};

/** The DNA's bars for a phrase (one per role), before blending. Deterministic from the BEAT seed. */
export function grammarBars(id: GrammarId, roles: readonly BarRole[], beatSeed: number, variation: number): { bars: Figure[][]; slots: Slot[]; ops: Record<Slot, DevOp[]> } {
  const def: DnaDef = DNA_DEFS[id];
  const rng = stream(beatSeed, `dna4:${id}`);
  const motif = motifBar(def, rng);
  // how much the V and B bars develop: VARIATION adds an operation
  const nV = 1 + (rng.chance(variation) ? 1 : 0);
  const ops: Record<Slot, DevOp[]> = { A: [], V: pickOps(def.dev.V, rng, nV), B: pickOps(def.dev.B, rng, 1 + (rng.chance(0.5) ? 1 : 0)), T: pickOps(def.turn, rng, 1) };
  const slots = dnaSlots(roles, def.unit);
  const made = new Map<Slot, Figure[]>();
  const opRng = (s: Slot) => stream(beatSeed, `dna4:${id}:${s}`);
  const bars = slots.map((s) => {
    if (!made.has(s)) {
      const r = opRng(s);
      made.set(s, ops[s].reduce((fs, op) => develop(fs, op, r), motif));
    }
    return made.get(s)!.map((f) => ({ ...f }));
  });
  return { bars, slots, ops };
}

export interface BlendContext {
  beatSeed: number;
  /** HALFTIME: the backbeat on 3 stays the recipe's */
  halftime: boolean;
  recipe: Recipe;
}

/**
 * The DNA blended into the recipe's bars at INFLUENCE `a` (revision 4). Kick, snare, ghost and
 * percussion only: the cymbals are the cymbal engine's (with the DNA's leans) and toms and rolls
 * are never added.
 */
export function blendGrammar(bars: Hit[][], roles: BarRole[], id: GrammarId, a: number, ctx: BlendContext): Hit[][] {
  if (a <= 0) return bars;
  const { bars: dna, slots } = grammarBars(id, roles, ctx.beatSeed, ctx.recipe.variation);
  const label = DNA_DEFS[id].label;
  const r = ctx.recipe;
  // the user's controls scale the figures they govern (fixed per break, so INFLUENCE stays monotonic)
  const scale = (f: Figure): number => {
    if (f.cat === 'ghost') return clamp(0.2 + 1.4 * r.ghosts, 0, 1.3);
    if (f.cat === 'perc') return clamp(0.4 + r.density, 0, 1.2);
    if (f.cat === 'snare' && f.role === 'extra snare') return clamp(0.5 + 0.8 * r.complexity, 0, 1.2);
    if (f.cat === 'kick' && f.core < 1) return clamp(0.55 + 0.6 * r.syncopation, 0, 1.2);
    return 1;
  };
  const th = (k: string) => stream(ctx.beatSeed, `dna4:${id}:t:${k}`).next();
  return bars.map((hits, i) => {
    const slot = slots[i]!;
    let figs = dna[i]!;
    if (ctx.halftime) figs = figs.filter((f) => !(f.cat === 'snare' && (f.role === 'backbeat' || f.role === 'displaced backbeat')));
    const chosen = figs.filter((f) => th(`${slot}|${f.cat}|${f.step}`) < a * (0.45 + 0.55 * f.core) * 1.15 * scale(f));
    const at = new Set(figs.map((f) => `${f.cat}|${f.step}`));
    const percDna = figs.some((f) => f.cat === 'perc');
    // the recipe's own kick, snare, ghost and percussion parts the DNA would not play: given up as INFLUENCE grows
    const keepOwn = (h: Hit) => {
      if (h.role === 'floor kick' || h.cat === 'crash') return true;
      if (ctx.halftime && h.cat === 'snare' && (h.role === 'backbeat' || h.role === 'displaced backbeat')) return true;
      const give = h.cat === 'kick' || h.cat === 'snare' ? 0.92 : h.cat === 'ghost' ? 0.6 : h.cat === 'perc' && percDna ? 0.75 : 0;
      if (!give) return true;
      if (at.has(`${h.cat}|${h.step}`) && h.sub === 0) return true;
      return th(`own:${slot}|${h.cat}|${h.step}|${h.sub}`) >= a * give;
    };
    let out = hits.filter(keepOwn);
    // a bar the DNA builds without its downbeat leaves it out once the influence is strong
    if (!figs.some((f) => f.cat === 'kick' && f.step === 0) && a > 0.5 && i > 0) out = out.filter((h) => !(h.cat === 'kick' && h.step === 0 && h.sub === 0 && h.role !== 'floor kick'));
    // a moved backbeat replaces the recipe's backbeat it moved from
    if (chosen.some((f) => f.role === 'displaced backbeat')) out = out.filter((h) => !(h.cat === 'snare' && h.role === 'backbeat' && h.step >= 8 && !figs.some((f) => f.cat === 'snare' && f.step === h.step)));
    for (const f of chosen) {
      if (out.some((h) => h.cat === f.cat && h.step === f.step && h.sub === 0)) continue;
      if (f.cat === 'ghost' && out.some((h) => h.cat === 'snare' && h.step === f.step)) continue;
      out.push({ cat: f.cat, step: f.step, sub: 0, level: f.level, role: f.role, why: `${label} DNA ${Math.round(a * 100)}%: ${f.what}` });
    }
    return out;
  });
}

/** The DNA's cymbal leans at INFLUENCE `a` (1 = no lean): subdivision and figure weights, open-hat and crash places per bar. */
export function grammarCymbals(id: GrammarId, a: number, roles: readonly BarRole[]): { grid: GridLean; figure: Partial<Record<CymbalId, number>>; open: number[][]; crash: number[][]; ride: number } {
  const def: DnaDef = DNA_DEFS[id];
  const lean = (w: number) => 1 + a * (w - 1);
  const grid: GridLean = {};
  for (const [g, w] of Object.entries(def.cym.grid)) grid[g as keyof GridLean] = lean(w);
  const figure: Partial<Record<CymbalId, number>> = {};
  for (const [f, w] of Object.entries(def.cym.figure)) figure[f as CymbalId] = lean(w);
  const slots = dnaSlots(roles, def.unit);
  return {
    grid,
    figure,
    open: slots.map((s) => (a >= 0.25 ? (def.cym.open[s] ?? []) : [])),
    crash: slots.map((s) => (a >= 0.25 ? def.cym.crash.filter((c) => c.slot === s).map((c) => c.step) : [])),
    ride: lean(def.cym.ride),
  };
}
