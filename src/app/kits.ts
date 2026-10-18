import { readBundle, writeBundle, sampleFromBytes, type SampleStore, type StoredSample } from '@slopfactory/core/storage';
import { SLOTS, type Slot } from '../audio/ingredients';
import { CATEGORIES } from '../engine/types';
import { SAMPLE_MODES, type SampleSettings } from '../engine/samples';
import type { App } from './app';

const KEY = 'breakery.kits.v1';
const APP = 'the-breakery-kit';
export interface KitDocument {
  format: 'breakery-kit'; version: 1; name: string;
  items: { id: string; name: string; cat: Slot; audio: string }[];
  settings: SampleSettings;
}
interface Entry { id: string; name: string; count: number; blob: string }
interface Catalog { entries: Entry[]; defaultId: string | null; currentId: string | null }
export function kitName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 64 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a kit name of 1–64 characters without control characters.');
  return name;
}
export async function parseKit(bytes: Uint8Array): Promise<{ doc: KitDocument; files: StoredSample[] }> {
  if (bytes.length > 256 * 1024 * 1024) throw new Error('Kit file exceeds 256 MB.');
  const bundle = await readBundle(bytes, APP);
  if (bundle.problems.length) throw new Error(bundle.problems.join('\n'));
  const doc = JSON.parse(bundle.projectText) as KitDocument;
  if (!doc || doc.format !== 'breakery-kit' || doc.version !== 1) throw new Error('Unsupported kit format or version.');
  doc.name = kitName(doc.name);
  if (!Array.isArray(doc.items) || doc.items.length > 2000) throw new Error('Invalid kit sample list.');
  const ids = new Set<string>();
  for (const m of doc.items) {
    if (!m || typeof m.id !== 'string' || !m.id || ids.has(m.id) || typeof m.name !== 'string' || !m.name || m.name.length > 1024 || !SLOTS.includes(m.cat) || !bundle.samples.some(s => s.id === m.audio)) throw new Error('Invalid sample assignment or missing audio.');
    ids.add(m.id);
  }
  if (!doc.settings || typeof doc.settings !== 'object' || Array.isArray(doc.settings)) throw new Error('Invalid sample settings.');
  for (const [cat, s] of Object.entries(doc.settings)) {
    if (!(CATEGORIES as readonly string[]).includes(cat) || !s || !SAMPLE_MODES.includes(s.mode) || (s.fixed != null && (typeof s.fixed !== 'string' || !ids.has(s.fixed))) || (s.weights && (typeof s.weights !== 'object' || Array.isArray(s.weights) || Object.entries(s.weights).some(([id, w]) => !ids.has(id) || typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 9)))) throw new Error('Invalid category selection settings.');
  }
  return { doc, files: bundle.samples };
}

/** Core's binary IndexedDB store holds self-contained bundles; localStorage holds only the catalog. */
export class KitManager {
  catalog: Catalog = { entries: [], defaultId: null, currentId: null };
  name = 'Untitled Kit';
  private baseline = '';
  constructor(private app: App, private store: SampleStore | null, private metadata: Storage = localStorage) {
    let raw: string | null = null;
    try { raw = metadata.getItem(KEY); } catch { /* Export still works when storage is disabled. */ }
    if (raw) {
      const c = JSON.parse(raw) as Catalog;
      if (!Array.isArray(c.entries) || c.entries.some(e => !e.id || !e.blob || typeof e.name !== 'string')) throw new Error('Saved kit catalog is damaged.');
      this.catalog = c;
    }
    this.baseline = this.signature();
  }
  private signature(): string { return JSON.stringify([this.app.ingredients.items.map(i => [i.id, i.name, i.cat]), this.app.samples]); }
  get dirty(): boolean { return this.signature() !== this.baseline; }
  private persist(c: Catalog): void { this.metadata.setItem(KEY, JSON.stringify(c)); this.catalog = c; }
  private async reclaim(blob: string): Promise<void> {
    if (!this.catalog.entries.some(e => e.blob === blob)) await this.store?.delete(blob).catch(() => {});
  }
  private available(): SampleStore { if (!this.store) throw new Error('Browser storage is unavailable. You can still export your kit.'); return this.store; }
  private unique(name: string, except?: string): string {
    name = kitName(name);
    if (this.catalog.entries.some(e => e.id !== except && e.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A kit with that name already exists. Choose another name.');
    return name;
  }
  async export(name = this.name): Promise<Uint8Array> {
    const items = this.app.ingredients.items.map(i => ({ id: i.id, name: i.name, cat: i.cat }));
    const settings = JSON.parse(JSON.stringify(this.app.samples)) as SampleSettings;
    const files = await this.app.ingredients.audioFiles();
    const ids = new Set(items.map(i => i.id));
    // Removed samples can leave stale fixed/weight references in the existing settings.
    for (const s of Object.values(settings)) {
      if (s.fixed && !ids.has(s.fixed)) delete s.fixed;
      if (s.weights) s.weights = Object.fromEntries(Object.entries(s.weights).filter(([id]) => ids.has(id)));
    }
    const doc: KitDocument = { format: 'breakery-kit', version: 1, name: kitName(name), items: items.map((i, n) => ({ id: i.id, name: i.name, cat: i.cat, audio: files[n]!.id })), settings };
    return writeBundle(APP, { name: 'kit.json', text: JSON.stringify(doc) }, files);
  }
  async save(name = this.name, asNew = false): Promise<void> {
    const id = asNew ? crypto.randomUUID() : this.catalog.currentId ?? crypto.randomUUID();
    name = this.unique(name, id);
    const previous = this.catalog.entries.find(e => e.id === id)?.blob;
    const signature = this.signature();
    const count = this.app.ingredients.items.length;
    const bytes = await this.export(name);
    const blob = await sampleFromBytes(bytes.slice().buffer, name + '.breakery-kit', 'application/zip');
    await this.available().put(blob);
    const entry = { id, name, count, blob: blob.id };
    try {
      this.persist({ ...this.catalog, currentId: id, entries: [...this.catalog.entries.filter(e => e.id !== id), entry] });
    } catch (e) { await this.reclaim(blob.id); throw e; }
    if (previous) await this.reclaim(previous);
    this.name = name; this.baseline = signature;
  }
  async load(id: string): Promise<void> {
    const entry = this.catalog.entries.find(e => e.id === id);
    if (!entry) throw new Error('Kit no longer exists.');
    const blob = await this.available().get(entry.blob);
    if (!blob) throw new Error('Saved kit audio is missing from browser storage.');
    await this.apply(new Uint8Array(blob.bytes), id);
  }
  private async apply(bytes: Uint8Array, id: string | null): Promise<void> {
    const { doc, files } = await parseKit(bytes);
    const items = await this.app.ingredients.prepareKit(doc.items, files);
    this.persist({ ...this.catalog, currentId: id });
    this.app.ingredients.replaceKit(items, files, doc.items);
    this.app.kitLoaded(doc.settings);
    if (!this.app.player.playing) this.app.ingredients.releaseRetired();
    this.name = id ? this.catalog.entries.find(e => e.id === id)!.name : doc.name;
    this.baseline = id ? this.signature() : '';
  }
  async import(bytes: Uint8Array): Promise<void> { await this.apply(bytes, null); }
  newKit(): void {
    this.persist({ ...this.catalog, currentId: null });
    this.app.ingredients.replaceKit([], [], []); this.app.kitLoaded({});
    if (!this.app.player.playing) this.app.ingredients.releaseRetired();
    this.name = 'Untitled Kit'; this.baseline = this.signature();
  }
  rename(id: string, name: string): void {
    name = this.unique(name, id);
    this.persist({ ...this.catalog, entries: this.catalog.entries.map(e => e.id === id ? { ...e, name } : e) });
    if (id === this.catalog.currentId) this.name = name;
  }
  duplicate(id: string, name: string): void {
    name = this.unique(name);
    const entry = this.catalog.entries.find(e => e.id === id);
    if (!entry) throw new Error('Kit no longer exists.');
    this.persist({ ...this.catalog, entries: [...this.catalog.entries, { ...entry, id: crypto.randomUUID(), name }] });
  }
  async delete(id: string): Promise<void> {
    const blob = this.catalog.entries.find(e => e.id === id)?.blob;
    this.persist({ entries: this.catalog.entries.filter(e => e.id !== id), defaultId: this.catalog.defaultId === id ? null : this.catalog.defaultId, currentId: this.catalog.currentId === id ? null : this.catalog.currentId });
    if (!this.catalog.currentId) this.baseline = '';
    if (blob) await this.reclaim(blob);
  }
  setDefault(id: string): void { this.persist({ ...this.catalog, defaultId: id }); }
  async restore(): Promise<void> { const id = this.catalog.defaultId ?? this.catalog.currentId; if (id) await this.load(id); }
}
