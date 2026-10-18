/**
 * INGREDIENTS: the sample library. User samples are decoded by Slop Factory Core, kept as their
 * original bytes in this browser's IndexedDB (Core's content-addressed store) and never leave
 * the browser. Category assignments live in localStorage. The demo kit is synthesised, so only
 * its assignments are stored.
 */
import { decodeSample, defaultZone, SampleInstrument, toAudioBuffer, type DecodedSample } from '@slopfactory/core/sampler';
import { sampleFromBytes, type SampleStore } from '@slopfactory/core/storage';
import { emptyKit, type KitIndex } from '../engine/kit';
import { CATEGORIES, type Category } from '../engine/types';
import { demoKit, DEMO_RATE } from './demoKit';

export type Slot = Category | 'unsorted';
export const SLOTS: Slot[] = [...CATEGORIES, 'unsorted'];

export interface Ingredient {
  id: string;
  name: string;
  cat: Slot;
  source: 'demo' | 'user';
  status: 'loading' | 'ready' | 'missing' | 'error';
  message: string;
  duration: number;
  instrument: SampleInstrument | null;
}

interface SavedItem {
  id: string;
  name: string;
  cat: Slot;
  source: 'demo' | 'user';
}

const META_KEY = 'breakery.ingredients.v1';

/** Category from a file name, or 'unsorted'. A convenience only: every sample can be reassigned. */
export function guessCategory(name: string): Slot {
  const n = name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  const has = (re: RegExp) => re.test(n);
  if (has(/ghost/)) return 'ghost';
  if (has(/open|\boh\b|(^|[^a-z])oh([^a-z]|$)|ohh/)) return 'open';
  if (has(/ride/)) return 'ride';
  if (has(/crash|splash|china|cymbal|\bcym/)) return 'crash';
  if (has(/kick|\bbd\b|(^|[^a-z])bd([^a-z]|$)|bass ?drum|\bkik/)) return 'kick';
  if (has(/snare|\bsd\b|(^|[^a-z])sd([^a-z]|$)|\bsnr/)) return 'snare';
  if (has(/hat|\bhh\b|(^|[^a-z])(ch|hh)([^a-z]|$)/)) return 'hat';
  if (has(/perc|shak|tamb|conga|bongo|clap|rim|cowbell|block|clave|tom|cabasa|guiro|snap/)) return 'perc';
  return 'unsorted';
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

  constructor(private store: SampleStore | null) {}

  private changed(save = true): void {
    if (save) this.save();
    this.onChange();
  }

  save(): void {
    try {
      const meta: SavedItem[] = this.items.map(({ id, name, cat, source }) => ({ id, name, cat, source }));
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
    this.items = meta.map((m) => ({ ...m, status: 'loading', message: '', duration: 0, instrument: null }));
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
    it.status = 'ready';
  }

  private readyUser(it: Ingredient, d: DecodedSample): void {
    it.instrument = this.makeInstrument(d);
    it.duration = d.duration;
    it.status = 'ready';
    it.message = d.warnings.join(' ');
  }

  /** Add the demo kit (any demo sounds already present keep their categories). */
  loadDemo(): void {
    const have = new Set(this.items.map((i) => i.id));
    for (const d of demoKit()) {
      if (have.has(d.id)) continue;
      const it: Ingredient = { id: d.id, name: d.name, cat: d.cat, source: 'demo', status: 'loading', message: '', duration: 0, instrument: null };
      this.readyDemo(it, d.data);
      this.items.push(it);
    }
    this.changed();
  }

  /** Decode, store and add user files. Returns messages for files that failed. */
  async importFiles(files: File[]): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;
    for (const f of files) {
      try {
        const bytes = await f.arrayBuffer();
        const decoded = await decodeSample(bytes, f.name);
        const stored = await sampleFromBytes(bytes, f.name, f.type);
        if (this.items.some((i) => i.id === stored.id)) {
          errors.push(`${f.name}: already in the ingredients.`);
          continue;
        }
        let kept = true;
        try {
          if (this.store) await this.store.put(stored);
          else kept = false;
        } catch {
          kept = false;
        }
        const it: Ingredient = { id: stored.id, name: f.name, cat: guessCategory(f.name), source: 'user', status: 'loading', message: '', duration: 0, instrument: null };
        this.readyUser(it, decoded);
        if (!kept) it.message = (it.message ? it.message + ' ' : '') + 'Browser storage is unavailable: this sample lasts until the page is closed.';
        this.items.push(it);
        added++;
        this.changed();
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { added, errors };
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
    // the bytes stay in storage only while something refers to them
    if (it.source === 'user') void this.store?.delete(id).catch(() => {});
    this.changed();
  }

  clear(): void {
    for (const it of this.items) if (it.source === 'user') void this.store?.delete(it.id).catch(() => {});
    this.items = [];
    this.changed();
  }

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
    return this.items.find((i) => i.id === id)?.instrument ?? null;
  }

  name(id: string | null): string {
    return (id && this.items.find((i) => i.id === id)?.name) || '—';
  }
}
