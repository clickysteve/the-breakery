/**
 * Export headroom: sample-peak measurement and the one shared attenuation that keeps WAV files
 * from clipping. Transparent gain only: no limiter, no per-file normalisation.
 */

/** A file whose sample peak is above this is turned down (just under full scale). */
export const CLIP_THRESHOLD = 0.98;
/** The peak a turned-down export lands on: -1 dBFS. */
export const EXPORT_CEILING = 0.891;

/** Highest absolute sample over every channel. Throws on NaN or Infinity so bad audio never reaches the WAV encoder. */
export function samplePeak(channels: readonly Float32Array[], label = 'audio'): number {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]!);
      if (!Number.isFinite(a)) throw new Error(`The render failed: ${label} contains a non-finite sample (${ch[i]}) at frame ${i}. Nothing was exported.`);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

/** The gain that brings `peak` down to the export ceiling, or 1 when it is already within headroom. */
export function headroomGain(peak: number): number {
  return peak > CLIP_THRESHOLD ? EXPORT_CEILING / peak : 1;
}

/** Multiply every sample by `gain`, in place (no-op for 1). */
export function applyGain(channels: readonly Float32Array[], gain: number): void {
  if (gain === 1) return;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] = ch[i]! * gain;
}

/** dB of attenuation for a gain (0 for no reduction). */
export const reductionDb = (gain: number): number => (gain < 1 ? -20 * Math.log10(gain) : 0);
