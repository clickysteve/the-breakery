/**
 * SOLO and MUTE per drum category. They change what you HEAR, never the generated events.
 *
 * Precedence is Slop Factory Core's mixer rule, so live playback (Core's mute/solo gates) and
 * export filtering agree: if ANY category is soloed, exactly the soloed categories play (SOLO wins
 * over MUTE); otherwise every category plays except the muted ones. GHOST is its own category even
 * when it borrows SNARE samples, so muting SNARE leaves the ghosts playing.
 */
import { CATEGORIES, type Category } from '../engine/types';

export type MixState = Record<Category, { solo: boolean; mute: boolean }>;

export const emptyMix = (): MixState => Object.fromEntries(CATEGORIES.map((c) => [c, { solo: false, mute: false }])) as MixState;

export function anySolo(mix: MixState): boolean {
  return CATEGORIES.some((c) => mix[c].solo);
}

export function audible(mix: MixState, cat: Category): boolean {
  return anySolo(mix) ? mix[cat].solo : !mix[cat].mute;
}

/** Is anything silenced? (Then AUDIBLE MIX differs from FULL MIX.) */
export function mixActive(mix: MixState): boolean {
  return CATEGORIES.some((c) => !audible(mix, c));
}

export function audibleCategories(mix: MixState): Category[] {
  return CATEGORIES.filter((c) => audible(mix, c));
}

export function sanitiseMix(m: unknown): MixState {
  const out = emptyMix();
  if (m && typeof m === 'object') for (const c of CATEGORIES) {
    const v = (m as Record<string, { solo?: unknown; mute?: unknown }>)[c];
    if (v) out[c] = { solo: v.solo === true, mute: v.mute === true };
  }
  return out;
}
