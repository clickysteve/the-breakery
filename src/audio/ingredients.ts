/**
 * INGREDIENTS: the current kit's samples, by category. User samples go through Slop Factory
 * Core's kit library (`@slopfactory/core/kits`): decoded to check them, kept as their original
 * bytes in this browser's IndexedDB (Core's content-addressed store) and indexed in the library,
 * so every saved kit can use them without importing them again; they never leave the browser.
 * Category assignments live in localStorage. The demo kit is synthesised, so only its
 * assignments are stored.
 */
import { decodeSample, defaultZone, SampleInstrument, toAudioBuffer, type DecodedSample } from '@slopfactory/core/sampler';
import { encodeWav16 } from '@slopfactory/core/export';
import { sampleFromBytes, StorageError, type StoredSample } from '@slopfactory/core/storage';
import { KitLibrary } from '@slopfactory/core/kits';
import { emptyKit, type KitIndex } from '../engine/kit';
import { CATEGORIES, CATEGORY_LABEL } from '../engine/types';
import { guessCategory, importable, suggestCategory, type Slot } from './categorise';
import { demoKit, DEMO_RATE, NEW_DEMO_OFFERS } from './demoKit';
import { reverseChannels } from './reverse';
import { REVERSED } from './timeline';
import { parseFx, ShapedInstrument } from './shaped';
import type { Instrument } from '@slopfactory/core/audio';

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
  /** samples already loaded that moved to the instrument they were dropped on */
  moved: number;
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
  /** the sample's id when it differs from `id` (a demo sound saved in a kit) */
  audio?: string;
  /** its role in the kit it came from, when not its category's (a CLAP in PERC) */
  role?: string;
  /** which instrument of its role it came from, when not the first */
  index?: number;
}

interface SavedItem {
  id: string;
  name: string;
  cat: Slot;
  source: 'demo' | 'user';
  path?: string;
  audio?: string;
  role?: string;
  index?: number;
}

const META_KEY = 'breakery.ingredients.v1';

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
  /** audio not kept in browser storage (it was unavailable), for this visit */
  private bytes = new Map<string, StoredSample>();
  private retired = new Map<string, SampleInstrument>();
  private demoAudio = new Map<string, Promise<StoredSample>>();
  /**
   * Reversed copies, made once per instrument when first needed. Keyed by the instrument itself, so
   * a sample that is reloaded, replaced by a kit or removed gets a new copy (or none): the cache
   * can never play an old sound, and copies of instruments no longer used are released with them.
   */
  private reversed = new WeakMap<SampleInstrument, SampleInstrument>();

  /** The kit library holds the samples (null: none in browser storage, for this visit only). */
  readonly library: KitLibrary;
  constructor(library: KitLibrary | null) {
    this.library = library ?? new KitLibrary({ app: 'the-breakery', audio: null, store: null });
  }

  /** The sample id of an ingredient (its audio's SHA-256 for user samples). */
  static audioId(it: Pick<Ingredient, 'id' | 'audio'>): string {
    return it.audio ?? it.id;
  }

  private changed(save = true): void {
    if (save) this.save();
    this.onChange();
  }

  save(): void {
    try {
      const meta: SavedItem[] = this.items.map(({ id, name, cat, source, path, audio, role, index }) => ({ id, name, cat, source, ...(path ? { path } : {}), ...(audio ? { audio } : {}), ...(role ? { role } : {}), ...(index ? { index } : {}) }));
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
    // the demo kit grew toms (and later a clap and an FX): a visitor who plays the demo kit gets each group once
    for (const offer of NEW_DEMO_OFFERS) {
      if (flag(offer.key) || !meta.some((m) => m.source === 'demo')) continue;
      for (const id of offer.ids) {
        const d = demo.get(id);
        if (d && !this.items.some((i) => i.id === id)) this.items.push({ id, name: d.name, cat: d.cat, source: 'demo', status: 'loading', message: '', duration: 0, instrument: null, loud: -120 });
      }
      flag(offer.key, true);
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
            this.readyUser(it, await this.library.decoded(Ingredients.audioId(it), it.name));
          } catch (e) {
            it.status = e instanceof Error && (e as { code?: string }).code === 'missing-audio' ? 'missing' : 'error';
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
    for (const offer of NEW_DEMO_OFFERS) flag(offer.key, true);
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
  /**
   * Import files. `opts.cat` is an explicit destination (files dropped on an instrument): every
   * file goes there whatever its name says, and a sample already loaded moves there. Without it,
   * each file's category is suggested from its name and folders (a general drop or LOAD).
   */
  async importEntries(entries: ImportEntry[], onProgress?: (done: number, total: number) => void, opts: { cat?: Slot } = {}): Promise<ImportReport> {
    const report: ImportReport = { added: [], duplicates: 0, moved: 0, skipped: [], hidden: 0, errors: [] };
    const target = opts.cat && SLOTS.includes(opts.cat) ? opts.cat : null;
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
        // decoded (to check it), stored and indexed by the library; the same audio is stored once
        let id: string;
        let kept: boolean;
        let decoded: DecodedSample;
        let unstored: StoredSample | null = null;
        try {
          const r = await this.library.addSample(bytes, f.name, f.type);
          ({ decoded, stored: kept } = r);
          id = r.sample.id;
        } catch (e) {
          // storage full or unavailable: the sample still plays during this visit
          if (!(e instanceof StorageError)) throw e;
          decoded = await decodeSample(bytes, f.name);
          unstored = await sampleFromBytes(bytes, f.name, f.type);
          id = unstored.id;
          kept = false;
        }
        const have = this.items.find((i) => Ingredients.audioId(i) === id);
        if (have || report.added.some((a) => a.id === id)) {
          // dropped on an instrument: a sample already loaded goes there (it is not loaded twice)
          if (have && target && have.cat !== target) {
            have.cat = target;
            delete have.role;
            delete have.index;
            report.moved++;
          } else report.duplicates++;
          done++;
          continue;
        }
        if (!kept) this.bytes.set(id, unstored ?? (await sampleFromBytes(bytes, f.name, f.type)));
        const sug = target ? { cat: target, reason: `dropped on ${target === 'unsorted' ? 'UNSORTED' : CATEGORY_LABEL[target]}` } : suggestCategory(path || f.name);
        const it: Ingredient = { id, name: f.name, cat: sug.cat, source: 'user', status: 'loading', message: '', duration: 0, instrument: null, loud: -120, ...(path ? { path } : {}) };
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
    if (report.added.length || report.moved) this.changed();
    return report;
  }

  /** Add a sample already in the library to the current kit (no second import). */
  async addFromLibrary(id: string, name: string, cat: Slot): Promise<void> {
    if (this.items.some((i) => Ingredients.audioId(i) === id)) return;
    const it: Ingredient = { id, name, cat, source: 'user', status: 'loading', message: '', duration: 0, instrument: null, loud: -120 };
    this.readyUser(it, await this.library.decoded(id, name));
    this.items.push(it);
    this.changed();
  }

  setCategory(id: string, cat: Slot): void {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.cat === cat) return;
    it.cat = cat;
    delete it.role;
    delete it.index;
    this.changed();
  }

  /** Each sample's category (and kit role), for undo snapshots: ids and names only, never audio. */
  categories(): Record<string, { cat: Slot; role?: string; index?: number }> {
    return Object.fromEntries(this.items.map((i) => [i.id, { cat: i.cat, ...(i.role ? { role: i.role } : {}), ...(i.index ? { index: i.index } : {}) }]));
  }

  /**
   * Put samples back in the categories an undo snapshot had. Only samples still here move: undo
   * never deletes a sample, and one added since stays where it is. No redraw of its own (the
   * caller restores the pattern that went with it).
   */
  restoreCategories(map: Record<string, { cat: Slot; role?: string; index?: number }>): boolean {
    let moved = false;
    for (const it of this.items) {
      const m = map[it.id];
      if (!m || !SLOTS.includes(m.cat) || (it.cat === m.cat && it.role === m.role && it.index === m.index)) continue;
      it.cat = m.cat;
      if (m.role) it.role = m.role;
      else delete it.role;
      if (m.index) it.index = m.index;
      else delete it.index;
      moved = true;
    }
    if (moved) this.save();
    return moved;
  }

  /** Delete a removed sample from this browser, unless a saved kit (or another ingredient) still uses it. */
  private forget(it: Ingredient): void {
    const id = Ingredients.audioId(it);
    this.bytes.delete(id);
    // the library refuses while any saved kit uses it: removing an ingredient cannot damage saved kits
    if (it.source === 'user') void this.library.removeSample(id).catch(() => {});
  }

  remove(id: string): void {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    this.items = this.items.filter((i) => i !== it);
    this.forget(it);
    this.changed();
  }

  clear(): void {
    const gone = this.items;
    this.items = [];
    for (const it of gone) this.forget(it);
    this.changed();
  }

  /** A demo sound as a portable WAV (synthesised once per visit). */
  private demoWav(it: Ingredient): Promise<StoredSample> | null {
    const d = demoKit().find((x) => x.id === it.id);
    if (!d) return null;
    let p = this.demoAudio.get(it.id);
    if (!p) {
      p = encodeWav16([d.data], DEMO_RATE).then((wav) => sampleFromBytes(wav.slice().buffer, it.name.replace(/\.wav$/i, '') + '.wav', 'audio/wav'));
      this.demoAudio.set(it.id, p);
    }
    return p;
  }

  /** The current samples as kit items: each with its audio's id (demo sounds become WAVs). */
  async kitItems(): Promise<{ id: string; audio: string; name: string; cat: Slot; role?: string; index?: number }[]> {
    return Promise.all(this.items.map(async (it) => {
      if (it.status !== 'ready') throw new Error(`Sample “${it.name}” is not playable. Reload or remove it before saving.`);
      const audio = it.source === 'demo' ? (await this.demoWav(it))?.id : Ingredients.audioId(it);
      if (!audio) throw new Error(`Audio for “${it.name}” is unavailable.`);
      return { id: it.id, audio, name: it.name, cat: it.cat, ...(it.role ? { role: it.role } : {}), ...(it.index ? { index: it.index } : {}) };
    }));
  }

  /** Audio the library may not have: demo sounds (as WAVs) and samples kept only for this visit. */
  async unstoredAudio(): Promise<StoredSample[]> {
    const out: StoredSample[] = [...this.bytes.values()];
    for (const it of this.items) {
      const wav = it.source === 'demo' ? this.demoWav(it) : null;
      if (wav) out.push(await wav);
    }
    return out;
  }

  /** The original bytes of every current sample (demo sounds as WAVs). */
  async audioFiles(): Promise<StoredSample[]> {
    return Promise.all(this.items.map(async (it) => {
      if (it.status !== 'ready') throw new Error(`Sample “${it.name}” is not playable. Reload or remove it before saving.`);
      const audio = it.source === 'demo' ? await this.demoWav(it) : this.bytes.get(Ingredients.audioId(it)) ?? (await this.library.readSample(Ingredients.audioId(it)));
      if (!audio) throw new Error(`Audio for “${it.name}” is unavailable.`);
      return audio;
    }));
  }

  /** Ready-to-play ingredients for a kit's items: every sample decodes first, or this throws (nothing changes). */
  async prepareItems(items: { id: string; audio: string; name: string; cat: Slot; role?: string; index?: number }[]): Promise<Ingredient[]> {
    return Promise.all(items.map(async (m) => {
      const d = await this.library.decoded(m.audio, m.name);
      const it: Ingredient = { id: m.id, name: m.name, cat: m.cat, source: 'user', status: 'loading', message: '', duration: 0, loud: -120, instrument: null, ...(m.audio !== m.id ? { audio: m.audio } : {}), ...(m.role ? { role: m.role } : {}), ...(m.index ? { index: m.index } : {}) };
      this.readyUser(it, d);
      return it;
    }));
  }

  /** Swap in a kit's ingredients. Instruments of the old ones stay until the player has moved on (releaseRetired). */
  replaceKit(items: Ingredient[]): void {
    for (const it of this.items) if (it.instrument) this.retired.set(it.id, it.instrument);
    this.items = items;
    this.bytes.clear();
    // kept for the next visit; the kit manager notifies listeners (no rebake here)
    this.save();
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

  /** DESTROY's shaped instruments, by id (a few hundred at most: shaping is per hit, not per sample) */
  private shaped = new Map<string, Instrument>();

  /**
   * The instrument for an id; an id ending in REVERSED is that sample's reversed copy (EXPRESSION),
   * one with DESTROY's shaping (shaped.ts) that sample (or its reversed copy) shaped.
   */
  instrument(id: string | undefined | null): Instrument | null {
    if (!id) return null;
    const fx = parseFx(id);
    if (fx) {
      const hit = this.shaped.get(id);
      if (hit) return hit;
      const base = this.sampleInstrument(fx.base);
      if (!base) return null;
      const made = new ShapedInstrument(base, fx.shape);
      if (this.shaped.size > 1024) this.shaped.clear();
      this.shaped.set(id, made);
      return made;
    }
    return this.sampleInstrument(id);
  }

  /** The sampler instrument for an id without shaping (a sample, or its reversed copy). */
  private sampleInstrument(id: string): SampleInstrument | null {
    if (id.endsWith(REVERSED)) {
      const base = this.sampleInstrument(id.slice(0, -REVERSED.length));
      return base ? this.reversedOf(base) : null;
    }
    return this.items.find((i) => i.id === id)?.instrument ?? this.retired.get(id) ?? null;
  }

  private reversedOf(base: SampleInstrument): SampleInstrument {
    let r = this.reversed.get(base);
    if (!r) {
      const b = base.buffer;
      const channels = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
      r = new SampleInstrument(toAudioBuffer({ sampleRate: b.sampleRate, channels: reverseChannels(channels, b.sampleRate) }), { ...base.zone, start: 0, end: null, loopStart: 0, loopEnd: null });
      this.reversed.set(base, r);
    }
    return r;
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
