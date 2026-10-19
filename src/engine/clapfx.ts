/**
 * CLAP and FX (GROOVE revision 5): two layers over the performed break, after the toms and rolls,
 * from their own streams, so every other track is exactly what revision 4 made.
 *
 * Both work the same way: every possible place gets a musical score (from the recipe's vocabulary
 * and the bar's role) and a seeded draw, the places are ranked by score × draw, and ACTIVITY takes
 * the first N of that ranking. The ranking never depends on ACTIVITY, so raising it only ever adds
 * hits (the hits at 40% are all still there at 60%).
 *
 * CLAP: layered on the backbeat first, then the recipe's own idiom (GARAGE's skippy off-beats,
 * ELECTRO's doubled backbeat, a call-and-response answer at the end of a bar, the phrase-end
 * accents, a clap flurry in a fill). 100% is the most a recipe plausibly plays, at most about four
 * or five a bar: never every sixteenth.
 *
 * FX: sparse and structural: an impact at the top of the phrase, at a new section and after a fill,
 * a transition accent in the turnaround, at most two a bar. No FX samples: the hits are silent.
 */
import { MAX_OFFSET_MS, swingDelay } from './performance';
import { hashString, stream } from './rng';
import type { StyleDef } from './styles';
import { clamp, CLAPFX_REVISION, STEPS, type BarRole, type BreakEvent, type Category, type Feel, type Recipe, type Seeds, type Style } from './types';

/** CLAP ACTIVITY when a recipe has none of its own (the style's default). */
export const CLAP_DEFAULT: Record<Style, number> = { funk: 0.15, hiphop: 0.35, jungle: 0.2, broken: 0.3, boombap: 0.3, hardcore: 0.4, dnb: 0.25, halftime: 0.3, garage: 0.5, electro: 0.6, breakcore: 0.3 };
/** FX ACTIVITY when a recipe has none of its own. */
export const FX_DEFAULT: Record<Style, number> = { funk: 0.1, hiphop: 0.2, jungle: 0.25, broken: 0.25, boombap: 0.15, hardcore: 0.3, dnb: 0.25, halftime: 0.25, garage: 0.2, electro: 0.3, breakcore: 0.35 };

/** Does this recipe generate CLAP and FX (revision 5)? */
export const usesClapFx = (r: Recipe): boolean => r.engine === 2 && (r.revision ?? 0) >= CLAPFX_REVISION;
export const clapActivity = (r: Recipe): number => (usesClapFx(r) ? clamp(r.clap ?? CLAP_DEFAULT[r.style], 0, 1) : 0);
export const fxActivity = (r: Recipe): number => (usesClapFx(r) ? clamp(r.fx ?? FX_DEFAULT[r.style], 0, 1) : 0);

/** How each style uses claps: the weight of each kind of place (0 = never). */
interface ClapIdiom {
  layer: number;
  offbeat: number;
  answer: number;
  push: number;
  fill: number;
  /** at most this many claps a bar at 100% */
  perBar: number;
}
const IDIOM: Record<Style, ClapIdiom> = {
  funk: { layer: 0.8, offbeat: 0.3, answer: 0.5, push: 0.2, fill: 0.4, perBar: 4 },
  hiphop: { layer: 1, offbeat: 0.2, answer: 0.35, push: 0.15, fill: 0.3, perBar: 4 },
  jungle: { layer: 0.9, offbeat: 0.2, answer: 0.4, push: 0.3, fill: 0.6, perBar: 4 },
  broken: { layer: 0.6, offbeat: 0.6, answer: 0.6, push: 0.4, fill: 0.4, perBar: 5 },
  boombap: { layer: 1, offbeat: 0.15, answer: 0.3, push: 0.1, fill: 0.3, perBar: 3 },
  hardcore: { layer: 1, offbeat: 0.5, answer: 0.4, push: 0.3, fill: 0.6, perBar: 5 },
  dnb: { layer: 1, offbeat: 0.25, answer: 0.4, push: 0.3, fill: 0.5, perBar: 4 },
  halftime: { layer: 1, offbeat: 0.3, answer: 0.5, push: 0.2, fill: 0.4, perBar: 3 },
  garage: { layer: 1, offbeat: 0.7, answer: 0.5, push: 0.3, fill: 0.4, perBar: 5 },
  electro: { layer: 1, offbeat: 0.45, answer: 0.4, push: 0.2, fill: 0.5, perBar: 4 },
  breakcore: { layer: 0.7, offbeat: 0.6, answer: 0.6, push: 0.5, fill: 0.8, perBar: 5 },
};

interface Place {
  bar: number;
  step: number;
  level: number;
  why: string;
  score: number;
  /** a backbeat this clap is layered on (its timing follows it) */
  on?: BreakEvent;
}

export interface ClapFxContext {
  def: StyleDef;
  recipe: Recipe;
  feel: Feel;
  roles: BarRole[];
  /** which bars each of the seeds' mutations reaches (mutationBars) */
  reach: boolean[][];
}

/**
 * The seed of a layer's placement in a bar: the beat seed, salted with every mutation that reaches
 * the bar and the track (one limited to SELECTED TRACKS without it leaves it alone; a RANGE leaves
 * the bars before it alone), so MUTATE varies claps and FX as it varies the rest. FX change only
 * with a mutation that selects the FX track: they follow the phrase's structure, which MUTATE keeps.
 */
function placementSeed(seeds: Seeds, cat: Category, bar: number, reach: readonly (readonly boolean[])[]): number {
  let s = seeds.beat >>> 0;
  (seeds.mut ?? []).forEach((m, k) => {
    if (!m.beat || !reach[k]?.[bar]) return;
    if (cat === 'fx' ? m.cats?.includes('fx') : !m.cats || m.cats.includes(cat)) s = hashString(`${s}:${m.seed}`);
  });
  return s;
}

/** The first `n` places of the ranking, at most `perBar` in a bar (a prefix for every n: monotonic). */
function take(ranked: Place[], n: number, perBar: number): Place[] {
  const count = new Map<number, number>();
  const out: Place[] = [];
  for (const p of ranked) {
    if (out.length >= n) break;
    const c = count.get(p.bar) ?? 0;
    if (c >= perBar) continue;
    count.set(p.bar, c + 1);
    out.push(p);
  }
  return out;
}

/** Bars of the same kind share their claps (a groove bar claps like the groove bar before it); FILLS at 0: every bar is a groove bar. */
const clapClass = (role: BarRole, recipe: Recipe): string => (recipe.fills > 0 && (role === 'F' || role === 'T') ? 'fill' : 'groove');

/** The clap places of one bar, scored by the recipe's idiom. */
function clapPlaces(events: BreakEvent[], ctx: ClapFxContext, bar: number): Place[] {
  const idiom = IDIOM[ctx.recipe.style];
  const fillBar = clapClass(ctx.roles[bar]!, ctx.recipe) === 'fill';
  const half = ctx.def.backbeat === 'three';
  const places: Place[] = [];
  const add = (p: Place) => {
    if (p.score > 0 && p.step >= 0 && p.step < STEPS && !places.some((q) => q.step === p.step)) places.push(p);
  };
  const backbeats = events.filter((e) => e.bar === bar && e.sub === 0 && e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat'));
  for (const b of backbeats) add({ bar, step: b.step, level: 0.85, why: 'clap layered on the backbeat', score: idiom.layer * (b.role === 'backbeat' ? 1 : 0.8), on: b });
  // where the backbeat would be when the groove moved it (a clap keeps the 2 and 4, or the 3)
  for (const s of half ? [8] : [4, 12]) add({ bar, step: s, level: 0.8, why: 'clap holding the backbeat', score: idiom.layer * 0.55 });
  // the recipe's idiom: off-beat claps (GARAGE's skip, ELECTRO's doubled backbeat)
  for (const s of half ? [14, 6] : [6, 14, 10]) add({ bar, step: s, level: 0.62, why: 'off-beat clap', score: idiom.offbeat * (s === 10 ? 0.6 : 1) });
  // a call-and-response answer at the end of the bar (more likely in a fill bar)
  add({ bar, step: 15, level: 0.66, why: 'clap answering the bar', score: idiom.answer * (fillBar ? 1 : 0.55) });
  add({ bar, step: 7, level: 0.58, why: 'clap pushing into the backbeat', score: idiom.push });
  add({ bar, step: 3, level: 0.55, why: 'clap pushing into the backbeat', score: idiom.push * 0.6 });
  // a clap flurry in a fill bar, building into the next downbeat
  if (fillBar) for (const [s, l] of [[13, 0.6], [14, 0.72], [11, 0.55]] as const) add({ bar, step: s, level: l, why: 'clap in the fill', score: idiom.fill * (s === 14 ? 0.9 : 0.7) });
  return places;
}

function fxPlaces(events: BreakEvent[], ctx: ClapFxContext): Place[] {
  const n = ctx.roles.length;
  const places: Place[] = [];
  const crashAt = (bar: number) => events.some((e) => e.bar === bar && e.step === 0 && e.cat === 'crash');
  ctx.roles.forEach((role, bar) => {
    const after = bar > 0 && ctx.roles[bar - 1] === 'F';
    if (bar === 0) places.push({ bar, step: 0, level: 0.85, why: 'FX impact at the top of the phrase', score: 1 });
    else if (bar % 4 === 0 || after) places.push({ bar, step: 0, level: 0.8, why: after ? 'FX impact: a new section after the fill' : 'FX impact: a new four-bar section', score: crashAt(bar) ? 0.9 : 0.75 });
    if (bar === n - 1) places.push({ bar, step: 12, level: 0.7, why: 'FX in the turnaround, into the top of the loop', score: 0.85 });
    if (role === 'F' || role === 'T') places.push({ bar, step: 14, level: 0.66, why: 'FX accent at the end of the fill', score: 0.6 });
    if (role === 'B') places.push({ bar, step: 8, level: 0.6, why: 'FX accent: the phrase turns', score: 0.4 });
    if (bar > 0 && bar % 4 !== 0 && !after) places.push({ bar, step: 0, level: 0.6, why: 'FX accent on the bar', score: 0.2 });
  });
  return places;
}

function perform(p: Place, cat: 'clap' | 'fx', ctx: ClapFxContext, feelSeed: number): BreakEvent {
  const { def, recipe, feel } = ctx;
  // each hit's feel from its own place, so it is the same whatever else the activity adds
  const frng = stream(feelSeed, `${cat}:${p.bar}:${p.step}`);
  const h = recipe.humanise * def.timingScale;
  const g1 = frng.gauss();
  const g2 = frng.gauss();
  const vel = p.on ? p.on.vel * 0.92 + (def.programmed ? 0 : g1 * 3 * h) : p.level * 127 + (def.programmed ? 0 : g1 * 4 * h);
  // a layered clap sits a hair behind its snare (a hand clap is never quite on the stick)
  let off = p.on ? clamp(p.on.offsetMs + (def.programmed ? 0 : (1.5 + Math.abs(g2) * 2) * h), -MAX_OFFSET_MS, MAX_OFFSET_MS) : clamp(feel.snare * 0.4 + (def.programmed ? 0 : g2 * 2 * h), -4, 12);
  if (cat === 'fx') off = def.programmed ? 0 : clamp(g2 * h, -2, 4);
  if (p.bar === 0 && p.step === 0) off = Math.max(0, off);
  return {
    cat,
    bar: p.bar,
    step: p.step,
    sub: 0,
    level: p.level,
    role: cat,
    why: p.why,
    vel: Math.round(clamp(vel, 1, 127)),
    swing: p.on ? p.on.swing : Math.round(swingDelay(p.step, recipe.swing) * 1000) / 1000 || 0,
    offsetMs: Math.round(off * 10) / 10 || 0,
    sample: null,
  };
}

/** The break with its CLAP and FX layers (revision 5; earlier revisions: the events as they are). */
export function addClapFx(events: BreakEvent[], ctx: ClapFxContext, seeds: Seeds): BreakEvent[] {
  if (!usesClapFx(ctx.recipe)) return events;
  const clapA = clapActivity(ctx.recipe);
  const fxA = fxActivity(ctx.recipe);
  if (clapA <= 0 && fxA <= 0) return events;
  const out: BreakEvent[] = [];
  const idiom = IDIOM[ctx.recipe.style];
  const bars = ctx.roles.length;
  {
    // per kind of bar (and its mutations): one draw per step and one for the count, made whatever the activity
    const draws = new Map<string, { noise: number[]; u: number }>();
    ctx.roles.forEach((role, bar) => {
      const key = `${clapClass(role, ctx.recipe)}:${placementSeed(seeds, 'clap', bar, ctx.reach)}`;
      let d = draws.get(key);
      if (!d) {
        const rng = stream(placementSeed(seeds, 'clap', bar, ctx.reach), `clap:${clapClass(role, ctx.recipe)}`);
        d = { noise: Array.from({ length: STEPS }, () => rng.next()), u: rng.next() };
        draws.set(key, d);
      }
      const ranked = clapPlaces(events, ctx, bar)
        .map((p) => ({ p, k: p.score * (0.35 + 0.65 * d.noise[p.step]!) }))
        .sort((a, b) => b.k - a.k || a.p.step - b.p.step)
        .map((x) => x.p);
      // CLAP ACTIVITY × the most this recipe claps in a bar (a prefix of the ranking: more activity only adds)
      const n = Math.min(ranked.length, Math.floor(clapA * idiom.perBar + (clapA > 0 ? d.u : 0)));
      for (const p of ranked.slice(0, n)) out.push(perform(p, 'clap', ctx, seeds.feel));
    });
  }
  {
    // FX: one ranking over the whole phrase (they are few and structural), each place with its own draw
    const ranked = fxPlaces(events, ctx)
      .map((p) => ({ p, k: p.score * (0.35 + 0.65 * stream(placementSeed(seeds, 'fx', p.bar, ctx.reach), `fx:${p.bar}:${p.step}`).next()) }))
      .sort((a, b) => b.k - a.k || a.p.bar - b.p.bar || a.p.step - b.p.step)
      .map((x) => x.p);
    const n = Math.round(fxA * Math.min(ranked.length, 2 * bars));
    for (const p of take(ranked, n, 2)) out.push(perform(p, 'fx', ctx, seeds.feel));
  }
  if (!out.length) return events;
  // each new hit goes in after every hit at or before its place (the other events keep their order)
  const merged = events.slice();
  const pos = (e: BreakEvent) => (e.bar * STEPS + e.step) * 100 + e.sub;
  for (const e of out.sort((a, b) => pos(a) - pos(b))) {
    let i = merged.length;
    while (i > 0 && pos(merged[i - 1]!) > pos(e)) i--;
    merged.splice(i, 0, e);
  }
  return merged;
}
