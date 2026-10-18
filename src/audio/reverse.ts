/**
 * EXPRESSION: reversed samples. A reversed hit plays its sample backwards from the hit's position,
 * so the swell into the attack starts on the grid where the hit is (the way a reversed slice is
 * triggered on a sampler). The quiet tail of a one-shot would otherwise come first as silence and
 * push the sound late, so it is trimmed before reversing: everything after the last sample above
 * TAIL_FLOOR_DB of the peak goes. The original sample is never changed; the reversed copy is a
 * new buffer.
 */

/** A sample's tail below this level relative to its peak is trimmed before reversing (dB). */
export const TAIL_FLOOR_DB = -60;
/** Fade at the reversed sound's start (the trimmed tail), seconds: no click where the tail was cut. */
export const REVERSE_FADE_IN = 0.002;

/** The channels played backwards, the silent tail trimmed first, with a short fade where it was cut. Pure: new arrays. */
export function reverseChannels(channels: readonly Float32Array[], sampleRate: number, floorDb = TAIL_FLOOR_DB): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(ch[i]!));
  let end = len;
  if (peak > 0) {
    const floor = peak * 10 ** (floorDb / 20);
    end = 0;
    for (const ch of channels) for (let i = len - 1; i >= end; i--) if (Math.abs(ch[i]!) > floor) { end = i + 1; break; }
  }
  end = Math.max(1, end);
  const fade = Math.min(end, Math.round(sampleRate * REVERSE_FADE_IN));
  return channels.map((ch) => {
    const out = new Float32Array(end);
    for (let i = 0; i < end; i++) out[i] = ch[end - 1 - i]! * (i < fade ? (i + 1) / fade : 1);
    return out;
  });
}
