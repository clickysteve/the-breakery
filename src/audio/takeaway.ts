/**
 * TAKEAWAY: renders the break to WAV offline with Slop Factory Core (OfflineAudioContext, the
 * same instruments, voices and choke groups as live playback) and Core's 16-bit WAV encoder.
 *
 * Modes:
 * - TAIL: the bars plus a tail so the last hits ring out (nothing is truncated).
 * - LOOP: exactly the bars' length, with the tail folded back onto the start, so the file loops
 *   seamlessly in a sampler at the stated tempo.
 * Optionally one stem per drum category as well (a ZIP), all the same length and gain.
 *
 * Clipping: if the mix would exceed full scale, every file is turned down by the same amount
 * to -1 dBFS and the result says so. Otherwise nothing is normalised.
 */
import { createZip, encodeWav16, fileName, levelStats } from '@slopfactory/core/export';
import { EXPORT_SAMPLE_RATE, renderTimeline } from '@slopfactory/core/render';
import { STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, type Break } from '../engine/types';
import type { Ingredients } from './ingredients';
import { breakTimeline, hatChoke, loopSeconds } from './timeline';

export interface TakeawayOptions {
  mode: 'tail' | 'loop';
  tailSeconds: number;
  stems: boolean;
}

export const defaultTakeaway = (): TakeawayOptions => ({ mode: 'tail', tailSeconds: 2, stems: false });

export interface TakeawayResult {
  name: string;
  bytes: Uint8Array;
  type: string;
  seconds: number;
  peakDb: number;
  /** dB the export was turned down to avoid clipping (0 = not needed) */
  reducedDb: number;
  files: number;
}

/** Fold everything after `frames` back onto the start (repeatedly, if the tail is longer). */
export function foldLoop(ch: Float32Array, frames: number): Float32Array {
  const out = ch.slice(0, frames);
  for (let i = frames; i < ch.length; i++) out[i % frames] = out[i % frames]! + ch[i]!;
  return out;
}

export function takeawayName(b: Break, opts: TakeawayOptions, ext: string): string {
  const r = b.recipe;
  return fileName(['breakery', STYLE_DEFS[r.style].label.toLowerCase(), `${r.bpm}bpm`, `${r.bars}bar`, `seed${b.seeds.beat}`, opts.mode === 'loop' ? 'loop' : ''], ext);
}

export async function takeaway(b: Break, ingredients: Ingredients, opts: TakeawayOptions, level: number, onProgress?: (f: number) => void): Promise<TakeawayResult> {
  const timeline = breakTimeline(b);
  if (!timeline.events.length) throw new Error('Nothing to render: no hit in this break has a sample. Load some INGREDIENTS first.');
  const used = CATEGORIES.filter((c) => timeline.events.some((e) => e.voice === c));
  const tail = opts.mode === 'loop' ? Math.max(1, opts.tailSeconds) : Math.max(0, Math.min(10, opts.tailSeconds));
  const res = await renderTimeline({
    timeline,
    sampleRate: EXPORT_SAMPLE_RATE,
    tailSeconds: tail,
    master: true,
    stems: opts.stems ? used.map((voice) => ({ voice, processed: false })) : [],
    masterGain: level,
    resolve: (_voice, note) => ingredients.instrument(note.instrument),
    choke: hatChoke,
    maxPerVoice: 16,
    onProgress,
  });
  const loopFrames = Math.round(loopSeconds(b) * res.sampleRate);
  let outputs = res.outputs.map((o) => ({ voice: o.voice, channels: o.channels as Float32Array[] }));
  if (opts.mode === 'loop') outputs = outputs.map((o) => ({ ...o, channels: o.channels.map((c) => foldLoop(c, loopFrames)) }));

  // one gain for every file, so stems still add up to the master
  const master = outputs[0]!;
  const stats = levelStats(master.channels);
  let reducedDb = 0;
  if (stats.peak > 0.98) {
    const g = 0.891 / stats.peak;
    reducedDb = -20 * Math.log10(g);
    for (const o of outputs) for (const c of o.channels) for (let i = 0; i < c.length; i++) c[i] = c[i]! * g;
  }
  const peakDb = levelStats(master.channels).peakDb;
  const frames = master.channels[0]!.length;
  const masterName = takeawayName(b, opts, 'wav');
  const masterBytes = await encodeWav16(master.channels, res.sampleRate);
  if (!opts.stems) return { name: masterName, bytes: masterBytes, type: 'audio/wav', seconds: frames / res.sampleRate, peakDb, reducedDb, files: 1 };

  const entries = [{ name: masterName, data: masterBytes }];
  for (const o of outputs.slice(1)) entries.push({ name: takeawayName(b, opts, 'wav').replace(/\.wav$/, `_${o.voice}.wav`), data: await encodeWav16(o.channels, res.sampleRate) });
  return { name: takeawayName(b, opts, 'zip'), bytes: createZip(entries), type: 'application/zip', seconds: frames / res.sampleRate, peakDb, reducedDb, files: entries.length };
}

/** Offer bytes as a download. */
export function download(name: string, bytes: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

