import { CATEGORIES, type Category } from '../engine/types';

export type MixState = Record<Category, { solo: boolean; mute: boolean; gain: number; pan: number }>;

export const emptyMix = (): MixState => Object.fromEntries(CATEGORIES.map((c) => [c, { solo: false, mute: false, gain: 1, pan: 0 }])) as MixState;

export function anySolo(mix: MixState): boolean {
  return CATEGORIES.some((c) => mix[c].solo);
}

export function audible(mix: MixState, cat: Category): boolean {
  return !mix[cat].mute && (!anySolo(mix) || mix[cat].solo);
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
    const v = (m as Record<string, { solo?: unknown; mute?: unknown; gain?: unknown; pan?: unknown }>)[c];
    if (v) out[c] = { solo: v.solo === true, mute: v.mute === true, gain: safeGain(v.gain), pan: safePan(v.pan) };
  }
  return out;
}

export function safeGain(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1.5, v)) : 1; }
export function safePan(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }
/** Resolve gates ourselves: Core gives solo priority over mute. */
export function mixerStrips(mix: MixState, gates = true) {
  return Object.fromEntries(CATEGORIES.map(c => [c, { gain: mix[c].gain, pan: mix[c].pan, solo: false, mute: gates && !audible(mix, c) }]));
}
