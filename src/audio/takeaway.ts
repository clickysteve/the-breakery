/**
 * TAKEAWAY: renders the break to WAV offline with Slop Factory Core (OfflineAudioContext, the
 * same instruments, voices and choke groups as live playback) and Core's 16-bit WAV encoder.
 *
 * Modes:
 * - TAIL: the bars plus a tail so the last hits ring out (nothing is truncated).
 * - LOOP: exactly the bars' length, with the tail folded back onto the start, so the file loops
 *   seamlessly in a sampler at the stated tempo.
 * Optionally one stem per drum category as well (a ZIP), all the same length and gain, and a
 * MIDI file of the break (midi/breakMidi.ts; inside the ZIP when there are stems).
 *
 * Audio exports always respect mixer mute/solo, channel gain/pan and master gain.
 * Stems include every category (silent where muted), retaining all events for choking.
 * Dry stems bypass master gain and safety attenuation; excessive dry levels are rejected.
 *
 * Clipping: if the mix would exceed full scale, every file is turned down by the same amount
 * to -1 dBFS and the result says so. Otherwise nothing is normalised.
 */
import { createZip, encodeWav16, fileName, levelStats } from '@slopfactory/core/export';
import { EXPORT_SAMPLE_RATE, renderTimeline } from '@slopfactory/core/render';
import { audibleCategories, emptyMix, mixerStrips, safeGain, sanitiseMix, type MixState } from '../app/mix';
import { STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, type Break, type Category } from '../engine/types';
import { breakMidi } from '../midi/breakMidi';
import type { Ingredients } from './ingredients';
import { breakTimeline, hatChoke, loopSeconds } from './timeline';

export interface TakeawayOptions {
  mode: 'tail' | 'loop';
  tailSeconds: number;
  stems: boolean;
  /** also a Standard MIDI File of the break */
  midi: boolean;
  dryStems?: boolean;
  /** Legacy filename/MIDI selection; audio always follows mixer gates. */
  mix: 'full' | 'audible';
}

export const defaultTakeaway = (): TakeawayOptions => ({ mode: 'tail', tailSeconds: 2, stems: false, midi: false, dryStems: true, mix: 'full' });

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

export function takeawayName(b: Break, opts: Pick<TakeawayOptions, 'mode'> & Partial<Pick<TakeawayOptions, 'mix'>>, ext: string): string {
  const r = b.recipe;
  const n = b.seeds.mut?.length ?? 0;
  return fileName(['breakery', STYLE_DEFS[r.style].label.toLowerCase(), `${r.bpm}bpm`, `${r.bars}bar`, `seed${b.seeds.beat}${n ? `m${n}` : ''}`, r.engine === 1 ? 'e1' : '', opts.mode === 'loop' ? 'loop' : '', opts.mix === 'audible' ? 'audible' : ''], ext);
}

/** The break as a Standard MIDI File (always exactly the bars; there is no tail or loop fold in MIDI). */
export function midiTakeaway(b: Break, only?: readonly Category[]): { name: string; bytes: Uint8Array; type: string; notes: number } {
  const { bytes, notes } = breakMidi(b, only);
  return { name: takeawayName(b, { mode: 'tail', mix: only ? 'audible' : 'full' }, 'mid'), bytes, type: 'audio/midi', notes };
}

/** Optional category mask for legacy callers; channel gain/pan comes from the mixer snapshot. */
export async function takeaway(b: Break, ingredients: Ingredients, opts: TakeawayOptions, level: number, onProgress?: (f: number) => void, audibleCats?: readonly Category[], mix: MixState = emptyMix()): Promise<TakeawayResult> {
  const dryStems = opts.dryStems ?? true;
  const only = audibleCats ?? audibleCategories(sanitiseMix(mix));
  const timeline = breakTimeline(b);
  const strips = mixerStrips(sanitiseMix(mix));
  // Keep all events for shared choke groups and frame-identical silent stems.
  for (const c of CATEGORIES) strips[c]!.mute ||= !only.includes(c);
  if (!timeline.events.length) throw new Error('Nothing to render: no hit in this break has a sample. Load some INGREDIENTS first.');
  const used = [...CATEGORIES];
  const tail = opts.mode === 'loop' ? Math.max(1, opts.tailSeconds) : Math.max(0, Math.min(10, opts.tailSeconds));
  const res = await renderTimeline({
    timeline,
    sampleRate: EXPORT_SAMPLE_RATE,
    tailSeconds: tail,
    master: true,
    stems: opts.stems ? used.map((voice) => ({ voice, processed: false })) : [],
    strips,
    masterGain: safeGain(level),
    resolve: (_voice, note) => ingredients.instrument(note.instrument),
    choke: hatChoke,
    maxPerVoice: 16,
    onProgress,
  });
  const loopFrames = Math.round(loopSeconds(b) * res.sampleRate);
  let outputs = res.outputs.map((o) => ({ voice: o.voice, channels: o.channels as Float32Array[] }));
  if (opts.mode === 'loop') outputs = outputs.map((o) => ({ ...o, channels: o.channels.map((c) => foldLoop(c, loopFrames)) }));

  // Core taps precede master gain. Dry stems keep channel gain/pan only.
  if (!dryStems) for (const o of outputs.slice(1)) for (const c of o.channels) for (let i = 0; i < c.length; i++) c[i] = c[i]! * safeGain(level);

  // One safety attenuation preserves stem summation (dry stems bypass master attenuation).
  const master = outputs[0]!;
  const stats = levelStats(master.channels);
  let reducedDb = 0;
  const highestPeak = dryStems ? stats.peak : Math.max(...outputs.map(o => levelStats(o.channels).peak));
  if (highestPeak > 0.98) {
    const g = 0.891 / highestPeak;
    reducedDb = -20 * Math.log10(g);
    for (const o of (dryStems ? outputs.slice(0, 1) : outputs)) for (const c of o.channels) for (let i = 0; i < c.length; i++) c[i] = c[i]! * g;
  }
  if (dryStems) {
    const peak = Math.max(0, ...outputs.slice(1).map(o => levelStats(o.channels).peak));
    if (peak > 0.98) throw new Error('Dry stems exceed WAV headroom. Lower channel levels and export again.');
  }
  const peakDb = levelStats(master.channels).peakDb;
  const frames = master.channels[0]!.length;
  const masterName = takeawayName(b, opts, 'wav');
  const masterBytes = await encodeWav16(master.channels, res.sampleRate);
  if (!opts.stems) return { name: masterName, bytes: masterBytes, type: 'audio/wav', seconds: frames / res.sampleRate, peakDb, reducedDb, files: 1 };

  const entries = [{ name: masterName, data: masterBytes }];
  for (const o of outputs.slice(1)) entries.push({ name: takeawayName(b, opts, 'wav').replace(/\.wav$/, `_${o.voice}.wav`), data: await encodeWav16(o.channels, res.sampleRate) });
  if (opts.midi) {
    const mid = midiTakeaway(b, only);
    entries.push({ name: mid.name, data: mid.bytes });
  }
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

