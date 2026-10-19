/**
 * DILLA: controlled rhythmic asymmetry, after the way J Dilla's programmed beats are described
 * (Charnas, Dilla Time, 2022; docs/EXPRESSIVE_RESEARCH.md): several feels at once, the kick, the
 * snare and the hats each in their own relation to the grid, consistent (programmed, so the same
 * figure repeats identically) but in conflict with each other. Not one formula: each break takes
 * one of four STRATEGIES from its FEEL seed, and each strategy has its own two-bar table of
 * per-position deviations, so two DILLA breaks are not the same feel.
 *
 *   PUSH-PULL   the kick late, the snare rushed, the hats straight
 *   POLYSWING   the kick swung hard, the snare a little, the hats straight
 *   DRAG        the hats dragging behind and swung, the snare laid back, the kick early
 *   DRUNK KICK  the kick placed by a repeating two-bar table of large deviations
 *
 * How it combines with the rest, so nothing is applied twice:
 *   SWING       DILLA replaces the swing of each drum (from the recipe's SWING towards the
 *               strategy's), it does not add to it
 *   HUMANISE    the performance's own deviations are kept but scaled down (DILLA is programmed:
 *               less random looseness the stronger it is: a fifth of it is left at 100 %)
 *   CHOP        DILLA runs after CHOP, on each hit's new place, so a chopped hit takes the feel of
 *               where it now sits
 *   ROLLS       a roll moves as a whole: every stroke takes its first stroke's offset
 *   HAND EDITS  run after: a TIME set by hand replaces the offset (the swing stays DILLA's)
 * INTENSITY scales every deviation (the largest about 9 ms at 30 %, 21 ms at 70 %, 30 ms at 100 %)
 * and 0 is the baseline exactly. The tempo never changes, and nothing here is a lo-fi effect.
 */
import { swingDelay } from './performance';
import { hashString, stream } from './rng';
import { clamp, lerp, TPB, TPS, type BarRole, type BreakEvent, type Category } from './types';

export const DILLA_STRATEGIES = ['pushpull', 'polyswing', 'drag', 'drunkkick'] as const;
export type DillaStrategy = (typeof DILLA_STRATEGIES)[number];
export const DILLA_STRATEGY_LABEL: Record<DillaStrategy, string> = { pushpull: 'PUSH-PULL', polyswing: 'POLYSWING', drag: 'DRAG', drunkkick: 'DRUNK KICK' };

type Voice = 'kick' | 'snare' | 'hats';
interface Strategy {
  /** each drum's swing (0..1, the SWING control's scale) at full intensity */
  swing: Record<Voice, number>;
  /** each drum's lean, ms (negative = early) */
  lean: Record<Voice, number>;
  /** the size of each drum's two-bar table of deviations, ms */
  table: Record<Voice, number>;
}
const STRATEGY: Record<DillaStrategy, Strategy> = {
  pushpull: { swing: { kick: 0.35, snare: 0.15, hats: 0 }, lean: { kick: 14, snare: -10, hats: 1 }, table: { kick: 6, snare: 3, hats: 2 } },
  polyswing: { swing: { kick: 0.6, snare: 0.3, hats: 0 }, lean: { kick: 4, snare: -3, hats: 0 }, table: { kick: 4, snare: 3, hats: 2 } },
  drag: { swing: { kick: 0.1, snare: 0.25, hats: 0.4 }, lean: { kick: -4, snare: 6, hats: 12 }, table: { kick: 3, snare: 3, hats: 5 } },
  drunkkick: { swing: { kick: 0.3, snare: 0.1, hats: 0.15 }, lean: { kick: 6, snare: -6, hats: 0 }, table: { kick: 20, snare: 3, hats: 2 } },
};
const VOICE: Record<Category, Voice> = { kick: 'kick', snare: 'snare', ghost: 'snare', htom: 'kick', mtom: 'kick', ltom: 'kick', hat: 'hats', open: 'hats', ride: 'hats', crash: 'kick', perc: 'hats' };

/** -1..1 from a seed and a key: the same key always gives the same value. */
export const hnoise = (seed: number, key: string): number => hashString(`${seed}|${key}`) / 2147483648 - 1;

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;

/** For each roll stroke after the first: the roll's first stroke (rolls move as a whole). */
export function rollLeads(events: readonly BreakEvent[]): Map<BreakEvent, BreakEvent> {
  const leads = new Map<BreakEvent, BreakEvent>();
  // per drum (the toms together: a roll round the toms is one roll), so one track's rolls never move another's
  const prev = new Map<string, BreakEvent>();
  for (const e of [...events].sort((x, y) => tickOf(x) - tickOf(y))) {
    if (e.role !== 'roll') continue;
    const k = e.cat === 'htom' || e.cat === 'mtom' || e.cat === 'ltom' ? 'toms' : e.cat;
    const p = prev.get(k);
    if (p && p.bar === e.bar && tickOf(e) - tickOf(p) <= TPS) leads.set(e, leads.get(p) ?? p);
    prev.set(k, e);
  }
  return leads;
}

/** Which strategy a break plays (from its FEEL seed). */
export const dillaStrategy = (feelSeed: number): DillaStrategy => DILLA_STRATEGIES[stream(feelSeed, 'dilla').int(DILLA_STRATEGIES.length)]!;

/** The largest deviation at an intensity, ms. */
export const dillaCap = (a: number): number => Math.max(4, 30 * a);

export interface DillaContext {
  plan: BarRole[];
  feelSeed: number;
  swing: number;
}

export function dillaPerform(events: BreakEvent[], a: number, ctx: DillaContext): BreakEvent[] {
  if (a <= 0) return events;
  const strat = dillaStrategy(ctx.feelSeed);
  const st = STRATEGY[strat];
  const seed = ctx.feelSeed ^ hashString(`dilla:${strat}`);
  const cap = dillaCap(a);
  const leads = rollLeads(events);
  const placed = new Map<BreakEvent, { off: number; swing: number }>();
  const feel = (e: BreakEvent) => {
    const had = placed.get(e);
    if (had) return had;
    const v = VOICE[e.cat];
    // the two-bar table repeats; the turnaround plays a variation of it (phrase-level variation)
    const varied = ctx.plan[e.bar] === 'T' ? 'T' : '';
    const pos = (e.bar % 2) * 16 + e.step;
    const table = hnoise(seed, `${v}|${pos}|${e.sub}${varied}`) * st.table[v];
    // every four bars the kick leans a little further (the phrase breathes)
    const phrase = v === 'kick' && e.bar % 4 === 3 ? 3 : 0;
    const off = clamp(e.offsetMs * (1 - 0.8 * a) + a * (st.lean[v] + table + phrase), -cap, cap);
    const swing = Math.round(swingDelay(e.step + e.sub / TPS, lerp(ctx.swing, st.swing[v], a)) * 1000) / 1000 || 0;
    const r = { off, swing };
    placed.set(e, r);
    return r;
  };
  return events.map((e) => {
    const f = feel(leads.get(e) ?? e);
    let off = f.off;
    if (tickOf(e) === 0) off = Math.max(0, off);
    return { ...e, offsetMs: Math.round(off * 10) / 10 || 0, swing: f.swing };
  });
}
