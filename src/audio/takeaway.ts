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
 * OUTPUT (the master output chain) is rendered into the master file exactly where it plays live,
 * after the mixer and before master gain, by the same code; it never reaches the stems (dry or
 * not: stems are the tracks, the master is the processed mix).
 * Stems include every category (silent where muted), retaining all events for choking.
 * Dry stems bypass master gain and OUTPUT; if one would clip they share one gain reduction (below).
 *
 * Clipping: if the mix would exceed full scale, every file is turned down by the same amount
 * to -1 dBFS and the result says so. Dry stems get their own shared gain (the master is not part
 * of them), so their balance is untouched. Otherwise nothing is normalised. Non-finite samples
 * abort the render with a clear error instead of reaching the WAV encoder.
 */
import { createZip, encodeWav16, fileName, levelStats } from '@slopfactory/core/export';
import { EXPORT_SAMPLE_RATE, renderTimeline } from '@slopfactory/core/render';
import { audibleCategories, emptyMix, mixerStrips, safeGain, sanitiseMix, type MixState } from '../app/mix';
import { applyGain, headroomGain, reductionDb, samplePeak } from './headroom';
import { STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, CATEGORY_LABEL, type Break, type Category } from '../engine/types';
import { CHAIN_WORKLET_URL, OUTPUT_SEED, type ChainConfig } from './output';
import { breakMidi, type MidiMapping } from '../midi/breakMidi';
import { buildFileName, masterSuffix, stemFileNames, uniqueName, type NamingPrefs } from './exportName';
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
  /** when set, files are named from the EXPORT NAME preferences instead of the legacy scheme */
  naming?: NamingPrefs;
  /** STEMS ONLY: the ZIP holds the stems (and MIDI) without the master */
  stemsOnly?: boolean;
  /** the current kit's name, for the KIT NAME component */
  kitName?: string | null;
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
  /** dB every dry stem was turned down by one shared gain to avoid clipping (0 = not needed) */
  stemReducedDb: number;
  files: number;
  /** the OUTPUT chain was on but this browser could not run it: the master is unprocessed */
  outputSkipped?: boolean;
}

/** Fold everything after `frames` back onto the start (repeatedly, if the tail is longer). */
export function foldLoop(ch: Float32Array, frames: number): Float32Array {
  const out = ch.slice(0, frames);
  for (let i = frames; i < ch.length; i++) out[i % frames] = out[i % frames]! + ch[i]!;
  return out;
}

/** The seed in a file name: the named seed as shown (velvet-thunder-42), else seed<number>. */
function seedPart(b: Break): string {
  const named = b.seedName?.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return named || `seed${b.seeds.beat}`;
}

export function takeawayName(b: Break, opts: Pick<TakeawayOptions, 'mode'> & Partial<Pick<TakeawayOptions, 'mix'>>, ext: string): string {
  const r = b.recipe;
  const n = b.seeds.mut?.length ?? 0;
  return fileName(['breakery', STYLE_DEFS[r.style].label.toLowerCase(), `${r.bpm}bpm`, `${r.bars}bar`, `${seedPart(b)}${n ? `m${n}` : ''}`, r.engine === 1 ? 'e1' : '', opts.mode === 'loop' ? 'loop' : '', opts.mix === 'audible' ? 'audible' : ''], ext);
}

/** The break as a Standard MIDI File (always exactly the bars; there is no tail or loop fold in MIDI). `map`: each track's channel and note (MIDI window). */
export function midiTakeaway(b: Break, only?: readonly Category[], map?: MidiMapping, naming?: NamingPrefs, kitName?: string | null): { name: string; bytes: Uint8Array; type: string; notes: number } {
  const { bytes, notes } = breakMidi(b, only, map);
  return { name: naming ? buildFileName(naming, b, '', 'mid', kitName) : takeawayName(b, { mode: 'tail', mix: only ? 'audible' : 'full' }, 'mid'), bytes, type: 'audio/midi', notes };
}

/** Optional category mask for legacy callers; channel gain/pan comes from the mixer snapshot. `map`: the MIDI file's channel and note per track. `output`: the OUTPUT chain (master only). */
export async function takeaway(b: Break, ingredients: Ingredients, opts: TakeawayOptions, level: number, onProgress?: (f: number) => void, audibleCats?: readonly Category[], mix: MixState = emptyMix(), map?: MidiMapping, output?: ChainConfig): Promise<TakeawayResult> {
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
    masterChain: output,
    chainModuleUrl: CHAIN_WORKLET_URL,
    fxSeed: OUTPUT_SEED,
  });
  const outputSkipped = !res.chainProcessed;
  const loopFrames = Math.round(loopSeconds(b) * res.sampleRate);
  let outputs = res.outputs.map((o) => ({ voice: o.voice, channels: o.channels as Float32Array[] }));
  if (opts.mode === 'loop') outputs = outputs.map((o) => ({ ...o, channels: o.channels.map((c) => foldLoop(c, loopFrames)) }));

  // Core taps precede master gain. Dry stems keep channel gain/pan only.
  if (!dryStems) for (const o of outputs.slice(1)) for (const c of o.channels) for (let i = 0; i < c.length; i++) c[i] = c[i]! * safeGain(level);

  // Reject NaN/Infinity before anything is scaled or encoded.
  for (const o of outputs) samplePeak(o.channels, o.voice === outputs[0]!.voice ? 'the master mix' : `the ${o.voice} stem`);

  // Safety attenuation is one shared gain. Processed stems sum to the master, so one gain covers
  // master and stems. Dry stems bypass master gain and OUTPUT: the master is turned down on its
  // own, and the stems share a separate gain that keeps their mixer balance.
  const master = outputs[0]!;
  const stemOutputs = outputs.slice(1);
  let reducedDb = 0;
  let stemReducedDb = 0;
  if (dryStems) {
    const g = headroomGain(samplePeak(master.channels));
    reducedDb = reductionDb(g);
    applyGain(master.channels, g);
    const sg = headroomGain(Math.max(0, ...stemOutputs.map((o) => samplePeak(o.channels))));
    stemReducedDb = reductionDb(sg);
    for (const o of stemOutputs) applyGain(o.channels, sg);
  } else {
    const g = headroomGain(Math.max(...outputs.map((o) => samplePeak(o.channels))));
    reducedDb = reductionDb(g);
    for (const o of outputs) applyGain(o.channels, g);
  }
  const peakDb = levelStats(master.channels).peakDb;
  const frames = master.channels[0]!.length;
  const nm = opts.naming;
  const kit = opts.kitName ?? null;
  // the master: _LOOP as the LOOP SUFFIX preference says (by default only beside its stems)
  const masterName = nm ? buildFileName(nm, b, masterSuffix(nm, opts.stems && !opts.stemsOnly), 'wav', kit) : takeawayName(b, opts, 'wav');
  const masterBytes = await encodeWav16(master.channels, res.sampleRate);
  if (!opts.stems) return { name: masterName, bytes: masterBytes, type: 'audio/wav', seconds: frames / res.sampleRate, peakDb, reducedDb, stemReducedDb, files: 1, outputSkipped };

  const entries = opts.stemsOnly ? [] : [{ name: masterName, data: masterBytes }];
  const stemNames = nm ? stemFileNames(nm, b, outputs.slice(1).map((o) => CATEGORY_LABEL[o.voice as Category] ?? String(o.voice)), kit, entries.map((e) => e.name)) : [];
  for (const [i, o] of outputs.slice(1).entries()) entries.push({ name: nm ? stemNames[i]! : takeawayName(b, opts, 'wav').replace(/\.wav$/, `_${o.voice}.wav`), data: await encodeWav16(o.channels, res.sampleRate) });
  if (opts.midi) {
    const mid = midiTakeaway(b, only, map, nm, kit);
    entries.push({ name: mid.name, data: mid.bytes });
  }
  return { name: nm ? buildFileName(nm, b, 'STEMS', 'zip', kit) : takeawayName(b, opts, 'zip'), bytes: createZip(entries), type: 'application/zip', seconds: frames / res.sampleRate, peakDb, reducedDb, stemReducedDb, files: entries.length, outputSkipped };
}

/**
 * TAKEAWAY ALL (the BATCH): one WAV per candidate, each named from its own break with the export
 * name builder (unique within the ZIP), in a ZIP named after the current break with _BATCH.
 * Each candidate is rendered as a single TAKEAWAY would render it (tail or loop, mixer, OUTPUT).
 */
export async function takeawayBatch(breaks: readonly Break[], current: Break, ingredients: Ingredients, opts: TakeawayOptions & { naming: NamingPrefs }, level: number, onProgress?: (f: number) => void, mix: MixState = emptyMix(), output?: ChainConfig): Promise<TakeawayResult & { skipped: number }> {
  const seen = new Set<string>();
  const entries: { name: string; data: Uint8Array }[] = [];
  let seconds = 0;
  let peakDb = -Infinity;
  let reducedDb = 0;
  let skipped = 0;
  let outputSkipped = false;
  for (const [i, b] of breaks.entries()) {
    try {
      const r = await takeaway(b, ingredients, { ...opts, stems: false, stemsOnly: false, midi: false }, level, (f) => onProgress?.((i + f) / breaks.length), undefined, mix, undefined, output);
      entries.push({ name: uniqueName(r.name, seen, opts.naming), data: r.bytes });
      seconds = Math.max(seconds, r.seconds);
      peakDb = Math.max(peakDb, r.peakDb);
      reducedDb = Math.max(reducedDb, r.reducedDb);
      outputSkipped ||= !!r.outputSkipped;
    } catch {
      // a candidate with no playable hit is left out (the others are still useful)
      skipped++;
    }
  }
  if (!entries.length) throw new Error('Nothing to render: no candidate has a hit with a sample. Load some INGREDIENTS first.');
  return { name: buildFileName(opts.naming, current, 'BATCH', 'zip', opts.kitName ?? null), bytes: createZip(entries), type: 'application/zip', seconds, peakDb, reducedDb, stemReducedDb: 0, files: entries.length, outputSkipped, skipped };
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

