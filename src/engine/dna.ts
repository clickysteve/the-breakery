/**
 * BREAK DNA: a break built from the construction vocabulary of a famous break or a drumming
 * tradition, not a copy of it. It is not a personality (who plays) but what is played: which
 * figures the kick, snare, ghosts and percussion use, how the four-bar phrase is built and where it
 * breaks, and which way its cymbals lean. INFLUENCE blends the vocabulary into the recipe's own
 * GROOVE (0 = the GROOVE exactly), so an AMEN-influenced HIP-HOP break is still HIP-HOP. Nothing
 * here is audio: no recording is sampled, copied or shipped. Research: docs/break-dna-research.md.
 *
 * GROOVE revision 4 (Phase 14) builds every DNA from its grammar (dnaGrammar.ts): AMEN, FUNKY
 * DRUMMER, APACHE, THINK, IMPEACH, ROACHCLIP (recordings), BOOGIE and MOTORIK (traditions), blended
 * before the cymbals so the cymbal engine hears the DNA's kicks and snares.
 *
 * Revision 3 and earlier (Phase 12) knew AMEN only, blended after the cymbals with the tables
 * below (dnaBars); breaks saved with them are rebuilt with exactly those tables:
 *   - a four-bar unit, A A A' B: two bars of the same funk pattern, a third that shifts its last
 *     backbeat (a gap), a fourth that leaves out its downbeat for a syncopated figure, an early
 *     crash and a turnaround
 *   - kicks on 1 and the "and" of 1, a kick pair on the "and" and "a" of 3
 *   - snares on 2 and 4 with the syncopated snares on the "a" of 2, the "e" of 3 and the "a" of 4
 *   - a steady eighth-note timekeeper
 *
 * A DNA never adds a tom or a roll (TOM ACTIVITY 0 and ROLL GENERATION off keep their meaning), and
 * HALFTIME keeps its own backbeat on 3. With CHOP on, a DNA leans the chop (dnaChopStyle): AMEN
 * towards the way the Amen was cut up in jungle, the others by their own leans.
 */
import type { ChopStyle } from './chopper';
import { stream } from './rng';
import { tidy } from './phrase';
import { DNA_DEFS, type GrammarId } from './dnaGrammar';
import { clamp, STEPS, type BarRole, type Category, type Hit, type Role } from './types';

export const DNA_IDS = ['amen', 'funky', 'apache', 'think', 'impeach', 'roachclip', 'boogie', 'motorik'] as const satisfies readonly GrammarId[];
export type DnaId = (typeof DNA_IDS)[number];
/** The BREAK DNA selector's choices (NONE = no DNA). */
export const DNA_CHOICES = ['none', ...DNA_IDS] as const;
export const DNA_LABEL = { none: 'NONE', ...Object.fromEntries(DNA_IDS.map((id) => [id, DNA_DEFS[id].label])) } as Record<(typeof DNA_CHOICES)[number], string>;
/** The selector's groups: specific recordings, broader traditions. */
export const DNA_GROUPS: { label: string; ids: DnaId[] }[] = [
  { label: 'RECORDINGS', ids: DNA_IDS.filter((id) => DNA_DEFS[id].kind === 'recording') },
  { label: 'TRADITIONS', ids: DNA_IDS.filter((id) => DNA_DEFS[id].kind === 'tradition') },
];
export const dnaBlurb = (id: DnaId): string => DNA_DEFS[id].blurb;
export const dnaSource = (id: DnaId): string => DNA_DEFS[id].source;

export interface DnaSetting {
  id: DnaId;
  /** INFLUENCE 0..1 */
  amount: number;
}

export const dnaActive = (d: DnaSetting | undefined | null): d is DnaSetting => !!d && (DNA_IDS as readonly string[]).includes(d.id) && d.amount > 0;

export function sanitiseDna(v: unknown): DnaSetting | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<DnaSetting>;
  if (!(DNA_IDS as readonly string[]).includes(String(o.id))) return undefined;
  return { id: o.id!, amount: clamp(Number(o.amount) || 0, 0, 1) };
}

/** One element of a vocabulary bar: a hit and how essential it is to the identity (0..1). */
interface Figure {
  cat: Category;
  step: number;
  level: number;
  role: Role;
  /** how essential: 1 = the identity of the break, lower = colour */
  core: number;
  what: string;
}
const F = (cat: Category, step: number, level: number, role: Role, core: number, what: string): Figure => ({ cat, step, level, role, core, what });

/** Where a bar sits in the A A A' B unit. */
type Slot = 'A' | 'G' | 'B';

const AMEN_A: Figure[] = [
  F('kick', 0, 0.95, 'downbeat', 1, 'the downbeat kick'),
  F('kick', 2, 0.8, 'kick', 0.9, 'the kick on the "and" of 1'),
  F('snare', 4, 0.92, 'backbeat', 1, 'the backbeat on 2'),
  F('snare', 7, 0.62, 'extra snare', 0.85, 'the syncopated snare on the "a" of 2'),
  F('snare', 9, 0.6, 'extra snare', 0.85, 'the syncopated snare on the "e" of 3'),
  F('kick', 10, 0.82, 'syncopated kick', 0.95, 'the kick pair on the "and" of 3'),
  F('kick', 11, 0.74, 'syncopated kick', 0.9, 'the kick pair on the "a" of 3'),
  F('snare', 12, 0.92, 'backbeat', 1, 'the backbeat on 4'),
  F('snare', 15, 0.58, 'extra snare', 0.8, 'the syncopated snare on the "a" of 4'),
];
/** A' variants: the last backbeat shifted (a gap where it was). */
const AMEN_G: Figure[][] = [
  [...AMEN_A.filter((f) => f.step !== 12 && f.step !== 15), F('snare', 14, 0.9, 'displaced backbeat', 1, 'the backbeat delayed to the "and" of 4')],
  [...AMEN_A.filter((f) => f.step !== 12 && f.step !== 11), F('snare', 13, 0.85, 'displaced backbeat', 0.95, 'the backbeat pushed to the "e" of 4'), F('snare', 15, 0.6, 'extra snare', 0.7, 'the snare on the "a" of 4')],
];
/** B variants: the downbeat left out, a syncopated figure, an early crash, a turnaround. */
const AMEN_B: Figure[][] = [
  [F('snare', 1, 0.6, 'extra snare', 0.85, 'the snare on the "e" of 1'), F('kick', 2, 0.85, 'kick', 0.95, 'the kick on the "and" of 1'), F('kick', 3, 0.7, 'kick', 0.8, 'the kick on the "a" of 1'),
    F('snare', 4, 0.92, 'backbeat', 1, 'the backbeat on 2'), F('snare', 7, 0.62, 'extra snare', 0.8, 'the snare on the "a" of 2'), F('snare', 9, 0.6, 'extra snare', 0.8, 'the snare on the "e" of 3'),
    F('kick', 10, 0.85, 'syncopated kick', 0.95, 'the kick on the "and" of 3'), F('crash', 10, 0.8, 'crash', 0.9, 'the early crash'), F('snare', 14, 0.88, 'displaced backbeat', 0.95, 'the turnaround snare on the "and" of 4')],
  [F('kick', 0, 0.95, 'downbeat', 0.6, 'the downbeat kick'), F('kick', 2, 0.8, 'kick', 0.9, 'the kick on the "and" of 1'), F('snare', 4, 0.92, 'backbeat', 1, 'the backbeat on 2'),
    F('snare', 7, 0.62, 'extra snare', 0.8, 'the snare on the "a" of 2'), F('kick', 10, 0.82, 'syncopated kick', 0.9, 'the kick on the "and" of 3'), F('snare', 12, 0.7, 'fill', 0.9, 'the turnaround run'),
    F('snare', 13, 0.76, 'fill', 0.9, 'the turnaround run'), F('snare', 14, 0.82, 'fill', 0.9, 'the turnaround run'), F('snare', 15, 0.9, 'fill', 0.9, 'the turnaround run')],
  [F('crash', 0, 0.85, 'crash', 0.85, 'the crash where the downbeat was'), F('kick', 2, 0.85, 'kick', 0.95, 'the kick on the "and" of 1'), F('snare', 4, 0.92, 'backbeat', 1, 'the backbeat on 2'),
    F('snare', 7, 0.6, 'extra snare', 0.8, 'the snare on the "a" of 2'), F('snare', 9, 0.6, 'extra snare', 0.8, 'the snare on the "e" of 3'), F('kick', 10, 0.85, 'syncopated kick', 0.95, 'the kick on the "and" of 3'),
    F('snare', 12, 0.9, 'backbeat', 1, 'the backbeat on 4'), F('snare', 14, 0.7, 'extra snare', 0.85, 'the turnaround snare on the "and" of 4')],
];

/** Each bar's place in the A A A' B unit: a short phrase still ends on its B, and its A' comes before it. */
export function amenSlots(roles: readonly BarRole[]): Slot[] {
  const n = roles.length;
  return roles.map((_, i) => {
    if (n === 1) return 'A';
    if (i === n - 1) return 'B';
    const p = i % 4;
    if (p === 3) return 'B';
    if (p === 2 || (n >= 3 && i === n - 2 && p !== 0)) return 'G';
    return 'A';
  });
}

/** The DNA's bars blended into the developed bars at its INFLUENCE (before personality and performance). */
export function dnaBars(bars: Hit[][], roles: BarRole[], d: DnaSetting | undefined, ctx: { beatSeed: number; halftime: boolean }): Hit[][] {
  // revision 3 and earlier knew AMEN only (a later DNA on such a recipe moves it to revision 4: App.fresh)
  if (!dnaActive(d) || d.id !== 'amen') return bars;
  const a = d.amount;
  const rng = stream(ctx.beatSeed, `dna:${d.id}`);
  const gVariant = rng.int(AMEN_G.length);
  const bVariant = rng.int(AMEN_B.length);
  // each figure's own threshold, the same in every bar of a slot: the A bars stay one motif
  const thresholds = new Map<string, number>();
  const threshold = (slot: Slot, f: Figure) => {
    const k = `${slot}|${f.cat}|${f.step}`;
    if (!thresholds.has(k)) thresholds.set(k, stream(ctx.beatSeed, `dna:${d.id}:${k}`).next());
    return thresholds.get(k)!;
  };
  const slots = amenSlots(roles);
  return bars.map((hits, i) => {
    const slot = slots[i]!;
    let figs = slot === 'A' ? AMEN_A : slot === 'G' ? AMEN_G[gVariant]! : AMEN_B[bVariant]!;
    // HALFTIME keeps its backbeat on 3: the Amen's backbeats there are left to the recipe, its syncopations kept
    if (ctx.halftime) figs = figs.filter((f) => !(f.cat === 'snare' && (f.role === 'backbeat' || f.role === 'displaced backbeat')));
    const chosen = figs.filter((f) => threshold(slot, f) < a * (0.45 + 0.55 * f.core) * 1.15);
    const amenAt = new Set(figs.map((f) => `${f.cat}|${f.step}`));
    // what the recipe played on the kick and snare that the Amen would not: given up as the influence grows
    const keepOwn = (h: Hit) => {
      if (h.cat !== 'kick' && h.cat !== 'snare') return true;
      if (amenAt.has(`${h.cat}|${h.step}`) && h.sub === 0) return true;
      if (h.role === 'floor kick') return true;
      if (ctx.halftime && h.cat === 'snare' && (h.role === 'backbeat' || h.role === 'displaced backbeat')) return true;
      return stream(ctx.beatSeed, `dna:${d.id}:own:${slot}|${h.cat}|${h.step}|${h.sub}`).next() >= a * 0.85;
    };
    let out = hits.filter(keepOwn);
    // B leaves out the downbeat kick (where its variant does) once the influence is strong
    if (slot === 'B' && !figs.some((f) => f.cat === 'kick' && f.step === 0) && a > 0.5 && i > 0) out = out.filter((h) => !(h.cat === 'kick' && h.step === 0 && h.sub === 0));
    for (const f of chosen) {
      if (out.some((h) => h.cat === f.cat && h.step === f.step && h.sub === 0)) continue;
      out.push({ cat: f.cat, step: f.step, sub: 0, level: f.level, role: f.role, why: `AMEN DNA ${Math.round(a * 100)}%: ${f.what}` });
    }
    // the steady eighth-note timekeeper: strong influence thins the timekeeper's sixteenths to eighths
    if (a >= 0.6) out = out.filter((h) => !(h.role === 'time' && (h.cat === 'hat' || h.cat === 'ride') && h.step % 2 === 1 && stream(ctx.beatSeed, `dna:${d.id}:tk:${i}|${h.step}`).next() < (a - 0.5) * 1.6));
    // after an early crash the timekeeper rests (the crash rings)
    const crash = out.find((h) => h.cat === 'crash' && h.why.startsWith('AMEN'));
    if (crash) out = out.filter((h) => !(h.role === 'time' && h.step >= crash.step && h.step < crash.step + 2));
    return tidy(out.filter((h) => h.step >= 0 && h.step < STEPS));
  });
}

/**
 * CHOP with a BREAK DNA. AMEN leans the way jungle producers cut the Amen (snare-led edits,
 * repeated motifs, gaps, turnarounds) and its retriggers grow only when ROLL GENERATION is on (the
 * Phase 12 formula, unchanged); the others add their own leans (dnaGrammar.ts DNA_DEFS chop),
 * scaled by INFLUENCE, and leave the retriggers as the recipe has them.
 */
export function dnaChopStyle(cs: ChopStyle, d: DnaSetting | undefined, rollsOn: boolean): ChopStyle {
  if (!dnaActive(d)) return cs;
  const a = d.amount;
  if (d.id === 'amen') return { ...cs, snareLed: cs.snareLed + a * 0.7, motif: cs.motif + a * 0.8, gap: cs.gap + a * 0.25, tail: cs.tail + a * 0.6, swap: cs.swap + a * 0.3, retrigger: rollsOn ? cs.retrigger * (1 + 0.5 * a) : cs.retrigger };
  const lean = DNA_DEFS[d.id].chop;
  const out = { ...cs };
  for (const [k, x] of Object.entries(lean) as [keyof typeof lean, number][]) out[k] = cs[k] + a * x;
  return out;
}

/** One line on the DNA (the PERSONALITY tab). */
export function describeDna(d: DnaSetting | undefined): string {
  if (!dnaActive(d)) return 'BREAK DNA: NONE. The recipe builds its own phrase.';
  return `${DNA_DEFS[d.id].label} ${Math.round(d.amount * 100)}%: ${DNA_DEFS[d.id].blurb}`;
}
