/**
 * INGREDIENTS: the sample library. User samples are decoded by Slop Factory Core, kept as their
 * original bytes in this browser's IndexedDB (Core's content-addressed store) and never leave
 * the browser. Category assignments live in localStorage. The demo kit is synthesised, so only
 * its assignments are stored.
 */
import { decodeSample, defaultZone, SampleInstrument, toAudioBuffer, type DecodedSample } from '@slopfactory/core/sampler';
import { encodeWav16 } from '@slopfactory/core/export';
import { sampleFromBytes, type StoredSample, type SampleStore } from '@slopfactory/core/storage';
import { emptyKit, type KitIndex } from '../engine/kit';
import { CATEGORIES } from '../engine/types';
import { guessCategory, importable, suggestCategory, type Slot } from './categorise';
import { demoKit, DEMO_RATE, NEW_DEMO_IDS } from './demoKit';

export { guessCategory, type Slot };
export const SLOTS: Slot[] = [...CATEGORIES, 'unsorted'];

/** A file to import, with its path inside a dropped or chosen folder ("" for a loose file). */
export interface ImportEntry {
  file: File;
  path: string;
}

export interface ImportReport {
  added: { id: string; name: string; path: string; cat: Slot; reason: string }[];
  duplicates: number;
  skipped: string[];
  hidden: number;
  errors: string[];
}

/** Loudness of a one-shot: RMS of its first 150 ms in dB (any monotonic measure would do). */
export function loudnessDb(channels: Float32Array[], sampleRate: number): number {
  const n = Math.min(channels[0]?.length ?? 0, Math.round(sampleRate * 0.15));
  let sum = 0;
  for (const ch of channels) for (let i = 0; i < n; i++) sum += ch[i]! * ch[i]!;
  const rms = Math.sqrt(sum / Math.max(1, n * channels.length));
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

export interface Ingredient {
  id: string;
  name: string;
  cat: Slot;
  source: 'demo' | 'user';
  status: 'loading' | 'ready' | 'missing' | 'error';
  message: string;
  duration: number;
  instrument: SampleInstrument | null;
  /** RMS loudness, dB (VELOCITY sample selection orders by it) */
  loud: number;
  /** folder path it was imported from, if any */
  path?: string;
}

interface SavedItem {
  id: string;
  name: string;
  cat: Slot;
  source: 'demo' | 'user';
  path?: string;
}

const META_KEY = 'breakery.ingredients.v1';
/** set once the demo toms have been offered, so a removed one never comes back */
const DEMO_TOMS_KEY = 'breakery.demo-toms.v1';

function flag(key: string, set = false): boolean {
  try {
    if (set) localStorage.setItem(key, '1');
    return localStorage.getItem(key) === '1';
  } catch {
    return set;
  }
}

function loadMeta(): SavedItem[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    const v = raw ? (JSON.parse(raw) as SavedItem[]) : null;
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && SLOTS.includes(x.cat)) : [];
  } catch {
    return [];
  }
}

export class Ingredients {
  items: Ingredient[] = [];
  onChange: () => void = () => {};
  private bytes = new Map<string, StoredSample>();
  private retired = new Map<string, SampleInstrument>();

  constructor(private store: SampleStore | null) {}

  private changed(save = true): void {
    if (save) this.save();
    this.onChange();
  }

  save(): void {
    try {
      const meta: SavedItem[] = this.items.map(({ id, name, cat, source, path }) => ({ id, name, cat, source, ...(path ? { path } : {}) }));
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
      /* storage unavailable: assignments last for this visit only */
    }
  }

  private makeInstrument(audio: { sampleRate: number; channels: Float32Array[] }): SampleInstrument {
    return new SampleInstrument(toAudioBuffer(audio), { ...defaultZone(), mode: 'oneshot', velocitySens: 1 });
  }

  /** Restore the previous visit's ingredients; loads the demo kit on a first visit. */
  async restore(): Promise<void> {
    const meta = loadMeta();
    if (!meta.length) {
      this.loadDemo();
      return;
    }
    const demo = new Map(demoKit().map((d) => [d.id, d]));
    this.items = meta.map((m) => ({ ...m, status: 'loading', message: '', duration: 0, instrument: null, loud: -120 }));
    // the demo kit grew toms: a visitor who plays the demo kit gets them once (not a fallback: real tom sounds)
    if (!flag(DEMO_TOMS_KEY) && meta.some((m) => m.source === 'demo')) {
      for (const id of NEW_DEMO_IDS) {
        const d = demo.get(id);
        if (d && !this.items.some((i) => i.id === id)) this.items.push({ id, name: d.name, cat: d.cat, source: 'demo', status: 'loading', message: '', duration: 0, instrument: null, loud: -120 });
      }
      flag(DEMO_TOMS_KEY, true);
      this.save();
    }
    for (const it of this.items) {
      if (it.source === 'demo') {
        const d = demo.get(it.id);
        if (d) this.readyDemo(it, d.data);
        else {
          it.status = 'missing';
          it.message = 'This demo sound no longer exists.';
        }
      }
    }
    this.changed(false);
    await Promise.all(
      this.items
        .filter((it) => it.source === 'user')
        .map(async (it) => {
          try {
            const s = await this.store?.get(it.id);
            if (!s) throw new Error('missing');
            this.bytes.set(it.id, s);
            this.readyUser(it, await decodeSample(s.bytes, s.name || it.name));
          } catch (e) {
            it.status = e instanceof Error && e.message === 'missing' ? 'missing' : 'error';
            it.message = it.status === 'missing' ? `"${it.name}" is no longer in this browser's storage. Load it again.` : e instanceof Error ? e.message : String(e);
          }
          this.changed(false);
        }),
    );
  }

  private readyDemo(it: Ingredient, data: Float32Array): void {
    it.instrument = this.makeInstrument({ sampleRate: DEMO_RATE, channels: [data] });
    it.duration = data.length / DEMO_RATE;
    it.loud = loudnessDb([data], DEMO_RATE);
    it.status = 'ready';
  }

  private readyUser(it: Ingredient, d: DecodedSample): void {
    it.instrument = this.makeInstrument(d);
    it.duration = d.duration;
    it.loud = loudnessDb(d.channels, d.sampleRate);
    it.status = 'ready';
    it.message = d.warnings.join(' ');
  }

  /** Add the demo kit (any demo sounds already present keep their categories). */
  loadDemo(): void {
    flag(DEMO_TOMS_KEY, true);
    const have = new Set(this.items.map((i) => i.id));
    for (const d of demoKit()) {
      if (have.has(d.id)) continue;
      const it: Ingredient = { id: d.id, name: d.name, cat: d.cat, source: 'demo', status: 'loading', message: '', duration: 0, instrument: null, loud: -120 };
      this.readyDemo(it, d.data);
      this.items.push(it);
    }
    this.changed();
  }

  /** Decode, store and add user files. Returns messages for files that failed. */
  async importFiles(files: File[]): Promise<{ added: number; errors: string[] }> {
    const r = await this.importEntries(files.map((file) => ({ file, path: '' })));
    return { added: r.added.length, errors: [...r.errors, ...(r.duplicates ? [`${r.duplicates} already in the ingredients.`] : [])] };
  }

  /**
   * Import files (from a folder or loose): hidden files and non-audio are skipped and counted,
   * duplicates (same bytes) are skipped, categories are suggested from file and folder names.
   * Nothing is uploaded: decoding and storage happen in this browser.
   */
  async importEntries(entries: ImportEntry[], onProgress?: (done: number, total: number) => void): Promise<ImportReport> {
    const report: ImportReport = { added: [], duplicates: 0, skipped: [], hidden: 0, errors: [] };
    const audio: ImportEntry[] = [];
    for (const e of entries) {
      const kind = importable(e.path || e.file.name, e.file.type);
      if (kind === 'hidden') report.hidden++;
      else if (kind === 'other') report.skipped.push(e.path || e.file.name);
      else audio.push(e);
    }
    let done = 0;
    for (const { file: f, path } of audio) {
      onProgress?.(done, audio.length);
      try {
        const bytes = await f.arrayBuffer();
        const decoded = await decodeSample(bytes, f.name);
        const stored = await sampleFromBytes(bytes, f.name, f.type);
        if (this.items.some((i) => i.id === stored.id) || report.added.some((a) => a.id === stored.id)) {
          report.duplicates++;
          done++;
          continue;
        }
        this.bytes.set(stored.id, stored);
        let kept = true;
        try {
          if (this.store) await this.store.put(stored);
          else kept = false;
        } catch {
          kept = false;
        }
        const sug = suggestCategory(path || f.name);
        const it: Ingredient = { id: stored.id, name: f.name, cat: sug.cat, source: 'user', status: 'loading', message: '', duration: 0, instrument: null, loud: -120, ...(path ? { path } : {}) };
        this.readyUser(it, decoded);
        if (!kept) it.message = (it.message ? it.message + ' ' : '') + 'Browser storage is unavailable: this sample lasts until the page is closed.';
        this.items.push(it);
        report.added.push({ id: it.id, name: f.name, path, cat: sug.cat, reason: sug.reason });
        // one redraw per few files keeps big folders quick
        if (report.added.length % 8 === 1 || audio.length < 12) this.changed();
      } catch (e) {
        report.errors.push(`${path || f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      done++;
    }
    onProgress?.(done, audio.length);
    if (report.added.length) this.changed();
    return report;
  }

  setCategory(id: string, cat: Slot): void {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.cat === cat) return;
    it.cat = cat;
    this.changed();
  }

  remove(id: string): void {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    this.items = this.items.filter((i) => i !== it);
    // Saved kits contain their own audio; removing an ingredient cannot damage them.
    this.bytes.delete(id);
    if (it.source === 'user') void this.store?.delete(id).catch(() => {});
    this.changed();
  }

  clear(): void {
    for (const it of this.items) if (it.source === 'user') void this.store?.delete(it.id).catch(() => {});
    this.bytes.clear();
    this.items = [];
    this.changed();
  }

  /** Capture original user bytes; demo sounds become portable WAVs. */
  async audioFiles(): Promise<StoredSample[]> {
    return Promise.all(this.items.map(async (it) => {
      if (it.status !== 'ready') throw new Error(`Sample “${it.name}” is not playable. Reload or remove it before saving.`);
      let audio = this.bytes.get(it.id);
      if (!audio && it.source === 'demo') {
        const d = demoKit().find(d => d.id === it.id);
        if (d) {
          const wav = await encodeWav16([d.data], DEMO_RATE);
          audio = await sampleFromBytes(wav.slice().buffer, it.name + '.wav', 'audio/wav');
        }
      }
      if (!audio) audio = await this.store?.get(it.id) ?? undefined;
      if (!audio) throw new Error(`Audio for “${it.name}” is unavailable.`);
      return audio;
    }));
  }

  async prepareKit(items: { id: string; name: string; cat: Slot; audio: string }[], files: StoredSample[]): Promise<Ingredient[]> {
    return Promise.all(items.map(async (m) => {
      const file = files.find(f => f.id === m.audio);
      if (!file) throw new Error(`Missing audio for “${m.name}”.`);
      const d = await decodeSample(file.bytes, file.name);
      const it: Ingredient = { id: m.id, name: m.name, cat: m.cat, source: 'user', status: 'loading', message: '', duration: 0, loud: -120, instrument: null };
      this.readyUser(it, d);
      return it;
    }));
  }

  replaceKit(items: Ingredient[], files: StoredSample[], assignments: { id: string; audio: string }[]): void {
    for (const it of this.items) if (it.instrument) this.retired.set(it.id, it.instrument);
    this.items = items;
    this.bytes = new Map(assignments.map(m => [m.id, files.find(f => f.id === m.audio)!]));
    // The kit manager persists this complete collection; do not notify the rebake listener.
  }

  releaseRetired(): void { this.retired.clear(); }

  inSlot(cat: Slot): Ingredient[] {
    return this.items.filter((i) => i.cat === cat);
  }

  /** Playable sample ids per category (what the generator chooses from). */
  kit(): KitIndex {
    const k = emptyKit();
    for (const it of this.items) if (it.status === 'ready' && it.cat !== 'unsorted') k[it.cat].push(it.id);
    return k;
  }

  instrument(id: string | undefined | null): SampleInstrument | null {
    if (!id) return null;
    return this.items.find((i) => i.id === id)?.instrument ?? this.retired.get(id) ?? null;
  }

  /** Loudness per ready sample (for VELOCITY selection). */
  loudness(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const it of this.items) if (it.status === 'ready') out[it.id] = it.loud;
    return out;
  }

  name(id: string | null): string {
    return (id && this.items.find((i) => i.id === id)?.name) || '—';
  }
}
