/**
 * WILDCARD (Phase 13): one press re-imagines the break across the categories the user allows.
 * Each category draws from musically informed distributions, not uniform noise: the generation
 * controls scatter around the NEW recipe's own defaults (so a WILDCARD HIP-HOP is still a
 * HIP-HOP), the tempo comes from the recipe's TEMPO PROFILE, a personality, BREAK DNA, CHOP or
 * DESTROY is chosen only some of the time and at moderate strengths, the mixer moves levels a
 * little and pans the high voices gently.
 *
 * Pure and deterministic: everything is drawn from streams of one seed (the app passes a fresh
 * seed per press, as BAKE does), so a press can be replayed. What it may not touch:
 *   - TEMPO LOCK keeps the tempo (the TEMPO category then does nothing)
 *   - FREEZE: a frozen BEAT, DETAIL or FEEL keeps the recipe and the generation controls; FREEZE
 *     RHYTHM (all three) also keeps the personality, DNA, CHOP, ROLL EXPRESSION and DESTROY; a
 *     frozen KIT keeps the sample assignments
 *   - ROLL GENERATION off: no CHOP retriggers are chosen (the recipe keeps rollsOn as the app sets it)
 *   - the cymbals (Phase 14): GENERATION CONTROLS scatters CLOSED HAT, OPEN HAT, RIDE and CRASH
 *     ACTIVITY around the new recipe's own (CYM_DEFAULTS), mostly with AUTO subdivision and ACCENT
 *   - DESTROY draws the DESTROY tab's engine (destroy2.ts): usually off, sometimes a CHAOS take at
 *     a moderate MASTER AMOUNT; an earlier CHOP ▸ DESTROY (Phase 12) is switched off
 *   - samples are never downloaded or deleted: SAMPLE ASSIGNMENTS only draws a new KIT seed
 *   - SOLO and MUTE are never changed
 */
import { clamp, RECIPE_KEYS, SLICE_SIZES, STYLES, type Category, type Layer, type Recipe, type Style } from './types';
import { CYM_DEFAULTS, HAT_RELS, PRIMARY_RELS, SUBDIVISIONS } from './cymbals4';
import { chaosDestroy, defaultDestroy2 } from './destroy2';
import { DNA_IDS } from './dna';
import { PERSONALITIES } from './personality';
import { ROLL_PRESETS, presetExpr } from './rollExpr';
import { hashString, stream, type Rng } from './rng';
import { defaultRecipe, STYLE_DEFS } from './styles';
import { pickTempo } from './tempo';

export const WILDCARD_CATEGORIES = ['recipe', 'tempo', 'personality', 'dna', 'controls', 'chop', 'rollExpr', 'destroy', 'samples', 'mixer', 'output'] as const;
export type WildcardCategory = (typeof WILDCARD_CATEGORIES)[number];
export type WildcardSettings = Record<WildcardCategory, boolean>;

export const WILDCARD_LABEL: Record<WildcardCategory, string> = {
  recipe: 'RECIPE',
  tempo: 'TEMPO',
  personality: 'PERSONALITY',
  dna: 'BREAK DNA',
  controls: 'GENERATION CONTROLS',
  chop: 'CHOP',
  rollExpr: 'ROLL EXPRESSION',
  destroy: 'DESTROY',
  samples: 'SAMPLE ASSIGNMENTS',
  mixer: 'MIXER',
  output: 'OUTPUT EFFECTS',
};

export const WILDCARD_TIP: Record<WildcardCategory, string> = {
  recipe: 'A different recipe.',
  tempo: 'A tempo from the recipe’s range (not with TEMPO LOCK).',
  personality: 'Sometimes a personality, at a moderate intensity; otherwise NEUTRAL.',
  dna: 'Sometimes BREAK DNA, at a moderate influence; otherwise NONE.',
  controls: 'The recipe’s controls, scattered around its defaults (the four cymbal activities included).',
  chop: 'Sometimes CHOP, at a moderate amount; otherwise off.',
  rollExpr: 'A roll expression preset (CLASSIC most often).',
  destroy: 'Now and then a DESTROY take at a moderate amount; usually off.',
  samples: 'Another choice of samples from the kit (nothing is downloaded or deleted).',
  mixer: 'Levels and pans moved a little (solo and mute untouched).',
  output: 'An output chain preset (CLEAN included).',
};

/** ON by default: what the break is; OFF: the sound and the mix (they are the user's set-up). */
export const defaultWildcard = (): WildcardSettings => ({ recipe: true, tempo: true, personality: true, dna: true, controls: true, chop: true, rollExpr: true, destroy: true, samples: false, mixer: false, output: false });

export function sanitiseWildcard(v: unknown): WildcardSettings {
  const d = defaultWildcard();
  if (!v || typeof v !== 'object') return d;
  const o = v as Partial<Record<string, unknown>>;
  for (const k of WILDCARD_CATEGORIES) if (typeof o[k] === 'boolean') d[k] = o[k] as boolean;
  return d;
}

export interface WildcardContext {
  settings: WildcardSettings;
  frozen: Record<Layer, boolean>;
  tempoLock: boolean;
  rollGeneration: boolean;
}

export interface WildcardResult {
  recipe: Recipe;
  /** what changed, for the status line */
  changed: WildcardCategory[];
  /** what was asked for but kept (and why) */
  kept: string[];
}

const gaussAround = (rng: Rng, mean: number, sd: number) => clamp(mean + rng.gauss() * sd, 0, 1);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** The new recipe (and what it changed). Sample, mixer and output changes are drawn by `wildcardMix` and `wildcardOutput`. */
export function wildcardRecipe(cur: Recipe, ctx: WildcardContext, seed: number): WildcardResult {
  const S = ctx.settings;
  const r = (name: string) => stream(hashString(`wildcard:${name}`), String(seed >>> 0));
  const changed: WildcardCategory[] = [];
  const kept: string[] = [];
  const rhythmFrozen = ctx.frozen.beat || ctx.frozen.detail || ctx.frozen.feel;
  const allFrozen = ctx.frozen.beat && ctx.frozen.detail && ctx.frozen.feel;
  let out: Recipe = JSON.parse(JSON.stringify(cur)) as Recipe;

  // ---- the recipe (and the controls that come with it)
  let style: Style = cur.style;
  if (S.recipe) {
    if (rhythmFrozen) kept.push('RECIPE (frozen)');
    else {
      const others = STYLES.filter((s) => s !== cur.style);
      style = others[r('recipe').int(others.length)]!;
      changed.push('recipe');
    }
  }
  if (style !== cur.style || (S.controls && !rhythmFrozen)) {
    const d = defaultRecipe(style, cur.bars);
    const keep = { chop: out.chop, destroy: out.destroy, destroy2: out.destroy2, rollExpr: out.rollExpr, personality: out.personality, dna: out.dna };
    // a new recipe comes with its own defaults (its own cymbals too); GENERATION CONTROLS scatters them
    out = { ...out, ...d, ...keep, bpm: cur.bpm, bars: cur.bars, rollsOn: cur.rollsOn };
    if (style !== cur.style) delete out.cym;
    for (const k of ['chop', 'destroy', 'destroy2', 'rollExpr', 'personality', 'dna'] as const) if (out[k] === undefined) delete out[k];
    if (S.controls) {
      const rc = r('controls');
      for (const k of RECIPE_KEYS) {
        // the feel controls move less than the shape controls
        const sd = k === 'swing' || k === 'humanise' ? 0.08 : k === 'toms' || k === 'rolls' ? 0.1 : 0.15;
        out[k] = round2(gaussAround(rc, d[k], sd));
      }
      // the cymbals (revision 4): each activity near the recipe's own; AUTO and ACCENT most of the time
      const cd = CYM_DEFAULTS[style];
      const pick = <T>(xs: readonly T[], w: number[]) => xs[Math.max(0, rc.weighted(w))]!;
      out.cym = {
        closed: round2(gaussAround(rc, cd.closed, 0.15)),
        open: round2(gaussAround(rc, cd.open, 0.1)),
        ride: round2(gaussAround(rc, cd.ride, 0.15)),
        crash: round2(gaussAround(rc, cd.crash, 0.12)),
        sub: pick(SUBDIVISIONS, SUBDIVISIONS.map((x) => (x === 'auto' ? 6 : x === '32' ? 0.3 : 1))),
        rel: pick(PRIMARY_RELS, PRIMARY_RELS.map((x) => (x === 'accent' ? 4 : 1))),
        hatRel: pick(HAT_RELS, HAT_RELS.map((x) => (x === 'accent' ? 4 : 1))),
        choke: !rc.chance(0.15),
      };
      delete out.hats;
      delete out.ride;
      delete out.cymbals;
      changed.push('controls');
    }
  } else if (S.controls && rhythmFrozen) kept.push('GENERATION CONTROLS (frozen)');

  // ---- tempo
  if (S.tempo) {
    if (ctx.tempoLock) kept.push('TEMPO (TEMPO LOCK)');
    else {
      out.bpm = pickTempo(style, r('tempo'));
      if (out.bpm !== cur.bpm) changed.push('tempo');
    }
  } else if (style !== cur.style && !ctx.tempoLock) {
    // a new recipe outside its tempo range would not be that recipe: bring the tempo into it
    const [lo, hi] = STYLE_DEFS[style].bpm;
    if (cur.bpm < lo || cur.bpm > hi) out.bpm = pickTempo(style, r('tempo'));
  }

  // ---- how it is played and treated
  const treat = <K extends 'personality' | 'dna' | 'chop' | 'rollExpr' | 'destroy'>(k: K, fn: (rng: Rng) => Recipe[K] | undefined) => {
    if (!S[k]) return;
    if (allFrozen) return void kept.push(`${WILDCARD_LABEL[k]} (FREEZE RHYTHM)`);
    const v = fn(r(k));
    if (v) out[k] = v;
    else delete out[k];
    if (JSON.stringify(out[k] ?? null) !== JSON.stringify(cur[k] ?? null)) changed.push(k);
  };
  treat('personality', (g) => {
    if (g.chance(0.45)) return undefined;
    const ids = PERSONALITIES.filter((p) => p !== 'neutral');
    return { id: ids[g.int(ids.length)]!, amount: round2(g.range(0.35, 0.9)) };
  });
  treat('dna', (g) => (g.chance(0.6) ? undefined : { id: DNA_IDS[g.int(DNA_IDS.length)]!, amount: round2(g.range(0.3, 0.8)) }));
  treat('chop', (g) => {
    // the chop recipes chop more often, and in smaller pieces
    const chopper = STYLE_DEFS[style].chop >= 0.4;
    if (!g.chance(chopper ? 0.6 : 0.3)) return cur.chop ? { ...cur.chop, on: false } : undefined;
    const slice = SLICE_SIZES[Math.max(0, g.weighted(chopper ? [0.5, 1, 1, 0.4] : [1, 1, 0.5, 0.15]))]!;
    return { on: true, amount: round2(g.range(0.2, 0.7)), slice, retrigger: ctx.rollGeneration ? round2(g.range(0, 0.5)) : 0, variant: g.int(1000) };
  });
  treat('rollExpr', (g) => {
    const i = g.weighted(ROLL_PRESETS.map((p) => (p === 'classic' ? 4 : p === 'chaos' ? 0.4 : 1)));
    const p = ROLL_PRESETS[Math.max(0, i)]!;
    return p === 'classic' ? undefined : presetExpr(p, g.int(1000));
  });
  if (S.destroy) {
    if (allFrozen) kept.push(`${WILDCARD_LABEL.destroy} (FREEZE RHYTHM)`);
    else {
      const g = r('destroy');
      if (g.chance(0.8)) {
        if (cur.destroy2) out.destroy2 = { ...cur.destroy2, on: false };
        else delete out.destroy2;
      } else {
        const take = chaosDestroy(cur.destroy2 ?? defaultDestroy2(), g.int(0x7fffffff));
        out.destroy2 = { ...take, master: round2(g.range(0.3, 0.7)), take: g.int(1000) };
      }
      if (cur.destroy) out.destroy = { ...cur.destroy, on: false };
      if (JSON.stringify([out.destroy ?? null, out.destroy2 ?? null]) !== JSON.stringify([cur.destroy ?? null, cur.destroy2 ?? null])) changed.push('destroy');
    }
  }
  return { recipe: out, changed, kept };
}

/** MIXER: levels 60–100% and gentle pans for the high voices; solo and mute as they were. */
export function wildcardMix<M extends Record<Category, { solo: boolean; mute: boolean; gain: number; pan: number }>>(mix: M, seed: number): M {
  const g = stream(hashString('wildcard:mixer'), String(seed >>> 0));
  const out = JSON.parse(JSON.stringify(mix)) as M;
  for (const c of Object.keys(out) as Category[]) {
    const ch = out[c];
    ch.gain = round2(g.range(0.6, 1));
    const wide = c === 'hat' || c === 'open' || c === 'ride' || c === 'perc' || c === 'htom' || c === 'ltom';
    ch.pan = c === 'kick' || c === 'snare' || c === 'ghost' ? 0 : round2(wide ? g.range(-0.35, 0.35) : g.range(-0.15, 0.15));
  }
  return out;
}

/** OUTPUT EFFECTS: which of the presets (an index into the list the app offers). */
export const wildcardOutput = (count: number, seed: number): number => stream(hashString('wildcard:output'), String(seed >>> 0)).int(Math.max(1, count));
