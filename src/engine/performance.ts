/**
 * Layer C: performance. Turns the score into a performance with velocity, swing and
 * microtiming, following docs/BREAKBEAT_RESEARCH.md §1.2–1.4:
 *
 * - Velocity comes from each hit's role (backbeat > downbeat kick > other kicks > timekeeper
 *   accents > ghosts), a timekeeper accent contour that repeats every two bars, and a small
 *   CORRELATED drift, never independent noise.
 * - Swing is Linn-style: the second sixteenth of each eighth is delayed (50 %..75 %).
 * - Microtiming is mainly a per-voice tendency chosen once per break (the snare a little late,
 *   never early; hats on or slightly ahead; the kick on the grid), plus a small slow drift with
 *   short-range anticorrelation. Everything scales with HUMANISE and is capped at ±10 ms.
 */
import { correlatedNoise, type Rng } from './rng';
import type { StyleDef } from './styles';
import { clamp, STEPS, TPS, type BreakEvent, type Category, type Feel, type Hit, type Recipe } from './types';

export const MAX_OFFSET_MS = 10;

/** Swing percentage (50..75) for a SWING control value. */
export const swingPercent = (swing: number): number => 50 + 25 * clamp(swing, 0, 1);

/** Swing delay, in sixteenths, of a position (in sixteenths from the bar start). */
export function swingDelay(pos16: number, swing: number): number {
  const d = (2 * swingPercent(swing)) / 100 - 1;
  const pair = Math.floor(pos16 / 2) * 2;
  const p = pos16 - pair;
  const warped = p <= 1 ? p * (1 + d) : 1 + d + (p - 1) * (1 - d);
  return warped - p;
}

type Group = 'kick' | 'snare' | 'hats' | 'perc' | 'crash';
const GROUP: Record<Category, Group> = { kick: 'kick', snare: 'snare', ghost: 'snare', hat: 'hats', open: 'hats', ride: 'hats', crash: 'crash', perc: 'perc' };

export function chooseFeel(def: StyleDef, recipe: Recipe, rng: Rng): Feel {
  const h = recipe.humanise * def.timingScale;
  const accent: number[] = [];
  for (let i = 0; i < STEPS * 2; i++) accent.push(rng.range(-0.06, 0.06) * (0.3 + recipe.humanise));
  return {
    kick: h * rng.range(-2, 2),
    snare: h * def.snareLag * rng.range(0.25, 1),
    hats: h * rng.range(-5, 1.5),
    accent,
  };
}

export function perform(bars: Hit[][], def: StyleDef, recipe: Recipe, rng: Rng): { events: BreakEvent[]; feel: Feel } {
  const feel = chooseFeel(def, recipe, rng);
  const h = recipe.humanise;
  const ts = def.timingScale;
  const events: BreakEvent[] = [];
  bars.forEach((hits, bar) => hits.forEach((hit) => events.push({ ...hit, bar, vel: 0, swing: 0, offsetMs: 0, sample: null })));
  events.sort((a, b) => a.bar * STEPS * TPS + a.step * TPS + a.sub - (b.bar * STEPS * TPS + b.step * TPS + b.sub));

  const groups: Group[] = ['kick', 'snare', 'hats', 'perc', 'crash'];
  for (const g of groups) {
    const evs = events.filter((e) => GROUP[e.cat] === g);
    const velDrift = correlatedNoise(rng, evs.length, 0.75);
    const timeDrift = correlatedNoise(rng, evs.length, 0.92);
    let jitter = 0;
    evs.forEach((e, i) => {
      // ---- velocity
      let level = e.level;
      if (e.role === 'time') {
        level *= 1 + feel.accent[(e.bar % 2) * STEPS + e.step]!;
        if (events.some((o) => o.bar === e.bar && o.step === e.step && o.cat === 'snare' && (o.role === 'backbeat' || o.role === 'displaced backbeat'))) level += 0.06;
      }
      const soft = e.cat === 'ghost';
      let vel = level * 127 + velDrift[i]! * h * (soft ? 3 : 6);
      if (e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat') && feel.snare > 4) vel += 3; // laid back and louder
      e.vel = Math.round(clamp(vel, 1, 127));

      // ---- timing
      jitter = -0.45 * jitter + rng.gauss() * 0.9;
      const base = g === 'kick' ? feel.kick : g === 'snare' ? feel.snare * (soft ? 0.8 : 1) : g === 'hats' ? feel.hats : g === 'perc' ? feel.hats * 0.5 : 0;
      const freedom = soft ? 1.4 : 1;
      let off = base + (timeDrift[i]! * 2.5 + jitter * 1.2) * h * ts * freedom;
      off = clamp(off, -MAX_OFFSET_MS, MAX_OFFSET_MS);
      if (e.cat === 'snare') off = Math.max(off, -1); // early snares are heard as mistakes
      if (e.bar === 0 && e.step === 0 && e.sub === 0) off = Math.max(off, 0); // nothing before the loop starts
      e.offsetMs = Math.round(off * 10) / 10 || 0; // no negative zero

      // ---- swing
      e.swing = Math.round(swingDelay(e.step + e.sub / TPS, recipe.swing) * 1000) / 1000 || 0;
    });
  }
  return { events, feel };
}
