/**
 * Metre: the strong/weak hierarchy of a 4/4 bar at sixteenth-note resolution, a
 * Longuet-Higgins & Lee style syncopation measure, and Euclidean rhythms.
 * See docs/BREAKBEAT_RESEARCH.md §3.1, §3.2 and §5.
 */
import { STEPS } from './types';

/**
 * Metrical weights (LHL convention: 0 = strongest). Downbeat 0, half-bar -1, beats 2 and 4
 * -2, eighth off-beats -3, sixteenth off-beats -4.
 */
export const METRIC_WEIGHT: readonly number[] = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4];

/** Metrical strength 1..5 (5 = downbeat), the positive form of METRIC_WEIGHT. */
export const strength = (step: number): number => 5 + METRIC_WEIGHT[((step % STEPS) + STEPS) % STEPS]!;

/** On the beat (0, 4, 8, 12). */
export const onBeat = (step: number): boolean => step % 4 === 0;
/** On an eighth off-beat ("and": 2, 6, 10, 14). */
export const onAnd = (step: number): boolean => step % 4 === 2;
/** On a sixteenth off-beat ("e" or "a": odd steps). */
export const onSixteenth = (step: number): boolean => step % 2 === 1;

/** Counting name of a step: "1", "1e", "1&", "1a", "2", … */
export function posName(step: number): string {
  return `${Math.floor(step / 4) + 1}${['', 'e', '&', 'a'][step % 4]}`;
}

/**
 * Syncopation of a cyclic onset pattern (any multiple of 16 steps). A syncopation is an onset on
 * a weaker position followed by silence on a stronger one before the next onset; its size is the
 * difference in weight (Longuet-Higgins & Lee, as described by later work; our implementation).
 * Downbeats of bars after the first weigh the same as the first.
 */
export function syncopation(onsets: readonly boolean[]): number {
  const n = onsets.length;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (onsets[i]) idx.push(i);
  if (idx.length === 0) return 0;
  let total = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]!;
    const j = k + 1 < idx.length ? idx[k + 1]! : idx[0]! + n;
    let rest = -Infinity;
    for (let p = i + 1; p < j; p++) rest = Math.max(rest, METRIC_WEIGHT[p % STEPS]!);
    const w = METRIC_WEIGHT[i % STEPS]!;
    if (rest > w) total += rest - w;
  }
  return total;
}

/** Onsets per step for a set of (step) positions within `length` steps. */
export function onsetArray(steps: Iterable<number>, length = STEPS): boolean[] {
  const a = new Array<boolean>(length).fill(false);
  for (const s of steps) if (s >= 0 && s < length) a[s] = true;
  return a;
}

/**
 * Euclidean rhythm E(k, n): k onsets spread as evenly as possible over n steps (Toussaint 2005),
 * rotated by `rotate` steps. Same onset sets as Bjorklund's algorithm up to rotation.
 */
export function euclid(k: number, n: number, rotate = 0): boolean[] {
  const out = new Array<boolean>(n).fill(false);
  if (k <= 0 || n <= 0) return out;
  const kk = Math.min(k, n);
  for (let i = 0; i < n; i++) {
    if (Math.floor((i * kk) / n) !== Math.floor(((i - 1) * kk) / n) || i === 0) {
      out[(((i + rotate) % n) + n) % n] = true;
    }
  }
  return out;
}
