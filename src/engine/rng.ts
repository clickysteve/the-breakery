/**
 * Seeded randomness. Every decision the generator makes comes from one of these streams, so a
 * break is reproduced exactly by its seeds and recipe. Each layer draws from its own named
 * stream (see `stream`), so changing one layer's seed never disturbs another layer's choices.
 */

export interface Rng {
  /** uniform in [0, 1) */
  next(): number;
  /** integer in [0, n) */
  int(n: number): number;
  /** uniform in [a, b) */
  range(a: number, b: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** index chosen with probability proportional to its weight (-1 if all weights are 0) */
  weighted(weights: readonly number[]): number;
  /** standard normal (Box–Muller) */
  gauss(): number;
}

/** 32-bit FNV-1a hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** SplitMix32-style mixing so nearby seeds give unrelated streams. */
function mix(x: number): number {
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Mulberry32: small, fast, good enough for music. */
export function makeRng(seed: number): Rng {
  let a = mix(seed >>> 0);
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    weighted(weights) {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return -1;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i]!);
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    gauss() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      const u = Math.max(1e-12, next());
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
  };
}

/** An independent stream for one named purpose, derived from a seed. */
export function stream(seed: number, name: string): Rng {
  return makeRng(mix((seed >>> 0) ^ hashString(name)));
}

/** A new random seed (UI only: never used inside generation). */
export function freshSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) % 1000000;
}

/**
 * A smooth, correlated random sequence (first-order autoregressive, unit variance). Used for
 * drifts in velocity and timing, instead of independent noise: research on human timing finds
 * correlated fluctuations, and listeners prefer them to uncorrelated "humanize" jitter
 * (see docs/BREAKBEAT_RESEARCH.md §3.3).
 */
export function correlatedNoise(rng: Rng, n: number, rho: number): number[] {
  const out: number[] = [];
  const k = Math.sqrt(1 - rho * rho);
  let x = rng.gauss();
  for (let i = 0; i < n; i++) {
    out.push(x);
    x = rho * x + k * rng.gauss();
  }
  return out;
}
