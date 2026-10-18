/**
 * Layer C (engine 2): performance. Turns the score into a performance with velocity, swing and
 * microtiming, following docs/BREAKBEAT_RESEARCH.md §3.3:
 *
 * - Velocity comes from each hit's role (backbeat > downbeat kick > other kicks > timekeeper
 *   accents > ghosts), the timekeeper's accent cycle (support.ts) and a two-bar idiosyncrasy,
 *   a small CORRELATED drift (never independent noise), and phrase dynamics: a section starts
 *   with a firmer downbeat, and the bar before the loop point grows towards it. PROGRAMMED
 *   recipes (BOOM BAP, GARAGE, ELECTRO) take velocity from the role alone, like a drum machine.
 * - Swing is Linn-style: the second sixteenth of each eighth is delayed (50 %..75 %). Classic
 *   breaks swing subtly (median ratio 1.2:1, about 54.5 %: Frane 2017), so the funk default is low.
 * - Microtiming is mostly CONSISTENT TENDENCIES chosen once per break: the snare laid back
 *   (never early) and more on beat 2 than on beat 4 (Frane 2017 found backbeat delay at beat 2 but
 *   not at 4), hats on or ahead, the kick near the grid, ghosts looser than accents, louder hat
 *   accents a touch later than soft strokes (laid-back strokes were played louder: Danielsen et
 *   al. 2015). On top: a small slow drift with short-range anticorrelation (Räsänen et al. 2015).
 *   Engine 1 capped everything at ±10 ms and its defaults averaged about 1 ms, judged possibly too
 *   subtle (EVALUATION.md). Engine 2 enlarges the TENDENCIES, not the noise: ±18 ms cap; at the
 *   recipe defaults the mean deviation is about 1–2.6 ms overall but the beat-2 snare sits 5–9 ms
 *   late in FUNK and HIP-HOP (docs/evaluation-report.md), still below the ±15–25 ms shifts that
 *   lowered groove ratings for a quantised pattern (Frühauf et al. 2013). HUMANISE 0 is exactly on the grid (plus swing).
 */
import { correlatedNoise, type Rng } from './rng';
import type { StyleDef } from './styles';
import { clamp, STEPS, TPS, type BarRole, type BreakEvent, type Category, type Feel, type Hit, type Recipe } from './types';

export const MAX_OFFSET_MS = 18;

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

export function chooseFeel(def: StyleDef, recipe: Recipe, rng: Rng, cycle?: string): Feel {
  const h = recipe.humanise * def.timingScale;
  const accent: number[] = [];
  const idio = def.programmed ? 0.2 : 1;
  for (let i = 0; i < STEPS * 2; i++) accent.push(rng.range(-0.05, 0.05) * (0.3 + recipe.humanise) * idio);
  return {
    kick: h * rng.range(-3, 3),
    snare: h * def.snareLag * rng.range(0.4, 1),
    hats: h * rng.range(-8, 2),
    accent,
    cycle,
  };
}

const isBackbeat = (e: Hit) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');

export function perform(bars: Hit[][], roles: BarRole[], def: StyleDef, recipe: Recipe, rng: Rng, cycle?: string): { events: BreakEvent[]; feel: Feel } {
  const feel = chooseFeel(def, recipe, rng, cycle);
  const h = recipe.humanise;
  const ts = def.timingScale;
  const events: BreakEvent[] = [];
  bars.forEach((hits, bar) => hits.forEach((hit) => events.push({ ...hit, bar, vel: 0, swing: 0, offsetMs: 0, sample: null })));
  events.sort((a, b) => a.bar * STEPS * TPS + a.step * TPS + a.sub - (b.bar * STEPS * TPS + b.step * TPS + b.sub));
  const backbeatAt = new Set(events.filter(isBackbeat).map((e) => `${e.bar}|${e.step}`));
  const n = roles.length;

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
        if (backbeatAt.has(`${e.bar}|${e.step}`)) level += 0.04;
      }
      // phrase dynamics: a new section's downbeat is firmer; the last bar grows into the loop point
      const role = roles[e.bar];
      if (e.step === 0 && e.bar > 0 && roles[e.bar - 1] === 'F' && (e.cat === 'kick' || e.cat === 'crash')) level += 0.05;
      if (n > 1 && e.bar === n - 1 && role === 'T' && e.role !== 'fill' && e.role !== 'roll') level *= 1 + 0.05 * (e.step / STEPS);
      const soft = e.cat === 'ghost';
      const drift = def.programmed ? 0.25 : 1;
      let vel = level * 127 + velDrift[i]! * h * (soft ? 3 : 6) * drift;
      if (isBackbeat(e) && feel.snare > 5) vel += 3; // laid back and louder
      e.vel = Math.round(clamp(vel, 1, 127));

      // ---- timing
      jitter = -0.45 * jitter + rng.gauss() * 0.9;
      let base = g === 'kick' ? feel.kick : g === 'snare' ? feel.snare : g === 'hats' ? feel.hats : g === 'perc' ? feel.hats * 0.5 : 0;
      if (g === 'snare') {
        if (soft) base *= 0.5;
        else if (isBackbeat(e)) base *= e.step >= 8 ? 0.45 : 1; // laid back on 2, nearer the grid on 4
        else base *= 0.7; // extra snares, fills, rolls
      }
      if (g === 'hats' && e.role === 'time') base += (level - 0.6) * 5 * h * ts; // accents a touch later
      const freedom = soft ? 1.6 : e.role === 'roll' ? 0.4 : 1;
      let off = base + (timeDrift[i]! * 3.2 + jitter * 1.4) * h * ts * freedom;
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
