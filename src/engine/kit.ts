/**
 * Sample choice: which of the user's samples each hit plays. One main sample per category per
 * break (from the KIT seed); occasional alternates for ghosts, hats, percussion and fill snares
 * when several samples are loaded; fallbacks when a category is empty (GHOST plays the main
 * SNARE quietly, HAT and RIDE stand in for each other). The pattern itself never depends on the
 * kit: the same seeds give the same rhythm with any samples.
 */
import { stream } from './rng';
import { CATEGORIES, type BreakEvent, type Category } from './types';

/** Sample ids assigned to each category. */
export type KitIndex = Record<Category, string[]>;

export const emptyKit = (): KitIndex => Object.fromEntries(CATEGORIES.map((c) => [c, []])) as unknown as KitIndex;

export const FALLBACK: Record<Category, Category[]> = {
  kick: ['kick'],
  snare: ['snare'],
  ghost: ['ghost', 'snare'],
  // CLAP and FX never borrow PERC's sounds (PERC may hold shakers or rims): without their own samples they are silent
  clap: ['clap'],
  // toms never borrow another category's sounds: without tom samples, tom hits are silent
  htom: ['htom'],
  mtom: ['mtom'],
  ltom: ['ltom'],
  hat: ['hat', 'ride'],
  open: ['open'],
  ride: ['ride', 'hat'],
  crash: ['crash'],
  perc: ['perc'],
  fx: ['fx'],
};

/** Which category actually supplies a category's sounds (null = none, it is silent). */
export function sourceOf(kit: KitIndex, cat: Category): Category | null {
  for (const c of FALLBACK[cat]) if (kit[c].length) return c;
  return null;
}

export type KitChoice = Record<Category, string | null>;

/** The main sample of each category for a kit seed. */
export function chooseMain(kit: KitIndex, kitSeed: number): KitChoice {
  const out = {} as KitChoice;
  for (const c of CATEGORIES) {
    const ids = kit[c];
    out[c] = ids.length ? ids[stream(kitSeed, `main:${c}`).int(ids.length)]! : null;
  }
  return out;
}

export function assignSamples(events: BreakEvent[], kit: KitIndex, kitSeed: number): KitChoice {
  const main = chooseMain(kit, kitSeed);
  const rng = stream(kitSeed, 'alternates');
  for (const e of events) {
    const src = sourceOf(kit, e.cat);
    // the rng is consumed for every event, so the choices do not shift when the kit changes
    const alt = rng.next();
    const altIndex = rng.next();
    if (!src) {
      e.sample = null;
      continue;
    }
    const ids = kit[src];
    let id = main[src]!;
    const altP = e.cat === 'ghost' || e.cat === 'hat' || e.cat === 'perc' ? 0.25 : e.role === 'fill' ? 0.3 : 0;
    if (ids.length > 1 && src === e.cat && alt < altP) {
      const others = ids.filter((x) => x !== id);
      id = others[Math.floor(altIndex * others.length)]!;
    }
    e.sample = id;
  }
  return main;
}
