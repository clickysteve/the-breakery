/**
 * KITS: The Breakery's side of Slop Factory Core's kit system (`@slopfactory/core/kits`).
 *
 * Core owns the sample library, kits, storage, portable kit files and the kit workflow
 * (KitSession). This file is the adapter: The Breakery's categories as kit roles, its
 * INGREDIENTS and PICK settings as kit instruments and back, the legacy `.breakery-kit` reader
 * and the one-time migration of kits saved by earlier versions.
 *
 * Categories map to Core's drum roles (GHOST is `snare-ghost`, HAT `hat-closed` ...). Every
 * category takes every sample of its role, as alternates chosen by PICK. Instruments of roles
 * The Breakery has no category for (from another application's kit: a cowbell goes to PERC, an
 * effect to UNSORTED) are kept, so saving the kit again loses nothing.
 */
import { KitSession, mapKit, migrateOnce, type ArchiveSample, type KitData, type KitHost, type KitInstrument, type KitLibrary, type KitMapping, type KitSampleRef, type KitTarget, type LegacyKitReader, type MigrationReport } from '@slopfactory/core/kits';
import { readBundle, type BundleContents, type SampleStore, type StoredSample } from '@slopfactory/core/storage';
import { SLOTS, type Ingredient, type Slot } from '../audio/ingredients';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../engine/types';
import { SAMPLE_MODES, type CategorySamples, type SampleMode, type SampleSettings } from '../engine/samples';
import type { App } from './app';

export const APP_ID = 'the-breakery';
/** The library's database (kits and the sample index; audio stays in `the-breakery`). */
export const KIT_LIBRARY_DB = 'the-breakery-kit-library';
/** What the kit file chooser accepts: portable kits and the first release's `.breakery-kit`. */
export const KIT_FILES = '.zip,.breakery-kit,application/zip';

/** Each category's kit role. */
export const ROLE: Record<Slot, string> = {
  kick: 'kick',
  snare: 'snare',
  ghost: 'snare-ghost',
  clap: 'clap',
  htom: 'tom-high',
  mtom: 'tom-mid',
  ltom: 'tom-low',
  hat: 'hat-closed',
  open: 'hat-open',
  ride: 'ride',
  crash: 'crash',
  perc: 'perc',
  fx: 'fx',
  unsorted: 'unassigned',
};
/** The category of each of The Breakery's own roles. */
const ROLE_SLOT = new Map<string, Slot>(Object.entries(ROLE).map(([k, v]) => [v, k as Slot]));
/** The category a kit role plays in (ACCEPTS included: a cowbell is PERC), or null. */
export function slotOfRole(role: string): Slot | null {
  const own = ROLE_SLOT.get(role);
  if (own) return own;
  for (const [slot, roles] of Object.entries(ACCEPTS) as [Slot, string[]][]) if (roles.includes(role)) return slot;
  return null;
}

/** Roles a category also takes (they keep their role in the kit). */
const ACCEPTS: Partial<Record<Slot, string[]>> = { hat: ['hat-pedal'], perc: ['rim', 'cowbell', 'shaker', 'clave', 'conga'] };

/** The Breakery's instruments, for mapping kits: each category plays every sample of its roles. */
export function breakeryTargets(): KitTarget[] {
  return SLOTS.map((s) => ({ id: s, role: ROLE[s], label: s === 'unsorted' ? 'UNSORTED' : CATEGORY_LABEL[s], capacity: Infinity, ...(ACCEPTS[s] ? { accepts: ACCEPTS[s] } : {}) }));
}

/** A sample of the current sounds, as the kit sees it. */
export interface KitItem {
  /** The Breakery's id for it (pattern hits and PICK settings refer to it) */
  id: string;
  /** the sample's id (SHA-256 of its audio) */
  audio: string;
  name: string;
  cat: Slot;
  /** its role in the kit, when not its category's (a CLAP in PERC) */
  role?: string;
  /** which instrument of its role it came from, when not the first (DOWNBEAT's SNARE 2) */
  index?: number;
}

/** The Breakery's own data in a kit: a sample's item id; an instrument's category, when its role is not that category's own. */
type Ext = { item?: string; cat?: string };
const mine = (ext: Record<string, unknown> | undefined): Ext => ((ext?.[APP_ID] as Ext | undefined) ?? {});

/** Kit instruments for items and PICK settings (one instrument per category and role). */
export function instrumentsOf(items: KitItem[], settings: SampleSettings, base: KitData | null = null): KitInstrument[] {
  const out: KitInstrument[] = [];
  const baseUsed = new Set<KitInstrument>();
  for (const cat of SLOTS) {
    const inCat = items.filter((i) => i.cat === cat);
    // one instrument per role and index: instruments a kit brought in stay distinct
    const groupOf = (i: KitItem) => `${i.role ?? ROLE[cat]}|${i.index ?? 0}`;
    for (const g of [...new Set(inCat.map(groupOf))]) {
      const group = inCat.filter((i) => groupOf(i) === g);
      const role = group[0]!.role ?? ROLE[cat];
      const index = group[0]!.index ?? 0;
      const s = cat === 'unsorted' ? undefined : settings[cat as Category];
      // keep other applications' data from the kit this came from
      const prior = base?.instruments.find((b) => b.role === role && (b.index ?? 0) === index && !baseUsed.has(b)) ?? (index ? undefined : base?.instruments.find((b) => b.role === role && !baseUsed.has(b)));
      if (prior) baseUsed.add(prior);
      const samples: KitSampleRef[] = group.map((i) => {
        const ref: KitSampleRef = { sample: i.audio, name: i.name };
        if (s?.mode === 'fixed' && s.fixed === i.id) ref.primary = true;
        const w = s?.weights?.[i.id];
        if (w !== undefined && w !== 1) ref.weight = w;
        const ext = { ...(prior?.samples.find((p) => p.sample === i.audio)?.ext ?? {}) };
        delete ext[APP_ID];
        if (i.id !== i.audio) ext[APP_ID] = { item: i.id };
        if (Object.keys(ext).length) ref.ext = ext;
        return ref;
      });
      const ins: KitInstrument = { role, samples };
      if (index) ins.index = index;
      if (role === ROLE[cat] && cat !== 'unsorted' && !index) ins.label = CATEGORY_LABEL[cat as Category];
      else if (prior?.label) ins.label = prior.label;
      if (s && s.mode !== 'auto') ins.selection = s.mode;
      if (prior?.choke) ins.choke = prior.choke;
      const ext = { ...(prior?.ext ?? {}) };
      delete ext[APP_ID];
      // an instrument kept in a category that is not its role's (a CLAP in PERC): it comes back there, not to its role's track
      if (cat !== 'unsorted' && role !== ROLE[cat] && ROLE_SLOT.has(role)) ext[APP_ID] = { cat };
      if (Object.keys(ext).length) ins.ext = ext;
      out.push(ins);
    }
  }
  return out;
}

/** The items and PICK settings a kit mapping gives (the inverse of instrumentsOf). */
export function planKit(m: KitMapping, nameOf: (sample: string) => string | undefined): { items: KitItem[]; settings: SampleSettings } {
  const items: KitItem[] = [];
  const settings: SampleSettings = {};
  const add = (ins: KitInstrument, cat: Slot) => {
    const fresh: KitItem[] = [];
    for (const ref of ins.samples) {
      const id = mine(ref.ext).item || ref.sample;
      if (items.some((i) => i.id === id)) continue;
      const it: KitItem = { id, audio: ref.sample, name: ref.name || nameOf(ref.sample) || 'sample', cat };
      if (ins.role !== ROLE[cat]) it.role = ins.role;
      if (ins.index) it.index = ins.index;
      items.push(it);
      fresh.push(it);
    }
    if (cat === 'unsorted' || settings[cat as Category]) return;
    const mode = (SAMPLE_MODES as readonly string[]).includes(ins.selection ?? '') ? (ins.selection as SampleMode) : 'auto';
    const s: CategorySamples = { mode, fixed: null, weights: {} };
    const primary = ins.samples.find((r) => r.primary);
    if (primary) s.fixed = fresh.find((i) => i.audio === primary.sample)?.id ?? null;
    for (const r of ins.samples) {
      const it = fresh.find((i) => i.audio === r.sample);
      if (it && r.weight !== undefined) s.weights![it.id] = Math.max(0, Math.min(9, Math.round(r.weight)));
    }
    settings[cat as Category] = s;
  };
  // an instrument The Breakery saved in another category (a CLAP kept in PERC) goes back there
  const keptIn = (ins: KitInstrument): Slot | null => {
    const c = mine(ins.ext).cat;
    return c && (SLOTS as readonly string[]).includes(c) ? (c as Slot) : null;
  };
  for (const x of m.mapped) add(x.instrument, keptIn(x.instrument) ?? (x.target.id as Slot));
  // instruments The Breakery has no category for are kept, unplayed, in UNSORTED
  for (const u of m.unmapped) if (u.reason === 'no-target') add(u.instrument, 'unsorted');
  return { items, settings };
}

// ---------------------------------------------------------------- the first release's kits

const LEGACY_KEY = 'breakery.kits.v1';
const LEGACY_APP = 'the-breakery-kit';
export const LEGACY_DB = 'the-breakery-kits';

interface LegacyDoc {
  format: 'breakery-kit';
  version: 1;
  name: string;
  items: { id: string; name: string; cat: Slot; audio: string }[];
  settings: SampleSettings;
}

/** A `.breakery-kit` (Core project bundle, app `the-breakery-kit`) as a kit. Throws if invalid. */
export function legacyKit(bundle: BundleContents): { kit: KitData; samples: StoredSample[] } {
  if (bundle.manifest.app !== LEGACY_APP) throw new Error('This bundle is not a Breakery kit.');
  let doc: LegacyDoc;
  try {
    doc = JSON.parse(bundle.projectText) as LegacyDoc;
  } catch {
    throw new Error('The kit document is damaged.');
  }
  if (!doc || doc.format !== 'breakery-kit' || doc.version !== 1) throw new Error('Unsupported kit format or version.');
  if (!Array.isArray(doc.items) || doc.items.length > 2000) throw new Error('Invalid kit sample list.');
  const ids = new Set<string>();
  for (const m of doc.items) {
    if (!m || typeof m.id !== 'string' || !m.id || ids.has(m.id) || typeof m.name !== 'string' || !m.name || m.name.length > 1024 || !SLOTS.includes(m.cat) || !bundle.samples.some((s) => s.id === m.audio)) throw new Error('Invalid sample assignment or missing audio.');
    ids.add(m.id);
  }
  if (!doc.settings || typeof doc.settings !== 'object' || Array.isArray(doc.settings)) throw new Error('Invalid sample settings.');
  for (const [cat, s] of Object.entries(doc.settings)) {
    if (!(CATEGORIES as readonly string[]).includes(cat) || !s || !SAMPLE_MODES.includes(s.mode) || (s.fixed != null && (typeof s.fixed !== 'string' || !ids.has(s.fixed))) || (s.weights && (typeof s.weights !== 'object' || Array.isArray(s.weights) || Object.entries(s.weights).some(([id, w]) => !ids.has(id) || typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 9)))) throw new Error('Invalid category selection settings.');
  }
  const items: KitItem[] = doc.items.map((m) => ({ id: m.id, audio: m.audio, name: m.name, cat: m.cat }));
  return { kit: { name: doc.name, instruments: instrumentsOf(items, doc.settings) }, samples: bundle.samples };
}

export const legacyReader: LegacyKitReader = (bundle) => (bundle.manifest.app === LEGACY_APP ? legacyKit(bundle) : null);

/**
 * Move the kits saved by the first release (whole bundles in `the-breakery-kits`, a catalog in
 * localStorage) into the library: same ids, names, samples, assignments and PICK settings; the
 * startup default and the current kit carried over. Read-only on the old data, which stays where
 * it was (an older version still finds it); kit by kit, so an interrupted migration resumes.
 * Also indexes the samples of the current INGREDIENTS (their audio is already in place).
 */
export async function migrateLegacy(library: KitLibrary, legacy: SampleStore | null, meta: Pick<Storage, 'getItem'>, ingredients: Ingredient[]): Promise<MigrationReport[]> {
  const kitsReport = await migrateOnce(library, 'breakery-kits-v1', async (m) => {
    let raw: string | null = null;
    try {
      raw = meta.getItem(LEGACY_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    const catalog = JSON.parse(raw) as { entries?: { id: string; name: string; blob: string }[]; defaultId?: string | null; currentId?: string | null };
    if (!Array.isArray(catalog.entries)) throw new Error('The saved kit list from the previous version is damaged; it was left as it was.');
    if (catalog.entries.length && !legacy) throw new Error('The previous version’s kits are in storage this browser cannot open now.');
    for (const e of catalog.entries) {
      await m.step(e.id, async () => {
        const blob = await legacy!.get(e.blob);
        if (!blob) throw new Error(`the saved audio of "${e.name}" is missing`);
        const bundle = await readBundle(new Uint8Array(blob.bytes), LEGACY_APP);
        if (bundle.problems.length) throw new Error(bundle.problems.join(' '));
        const { kit, samples } = legacyKit(bundle);
        const taken = (await library.listKits()).filter((k) => k.id !== e.id).map((k) => k.name.toLocaleLowerCase());
        const name = taken.includes(e.name.toLocaleLowerCase()) ? `${e.name} (previous)`.slice(0, 64) : e.name;
        await library.saveKit({ ...kit, id: e.id, name, origin: { app: APP_ID } }, { audio: samples });
      });
    }
    const exists = async (id?: string | null) => !!id && !!(await library.getKit(id));
    if (!(await library.getDefault()) && (await exists(catalog.defaultId))) await library.setDefault(catalog.defaultId!);
    if (!(await library.getCurrent()) && (await exists(catalog.currentId))) await library.setCurrent(catalog.currentId!);
  });
  const samplesReport = await migrateOnce(library, 'breakery-ingredients-v1', async (m) => {
    for (const it of ingredients) {
      if (it.source !== 'user') continue;
      const id = it.audio ?? it.id;
      await m.step(id, async () => void (await library.indexSample(id, { name: it.name, ...(it.duration ? { duration: it.duration } : {}) })));
    }
  });
  return [kitsReport, samplesReport];
}

// ---------------------------------------------------------------- the session

/** The Breakery's current sounds (INGREDIENTS and PICK settings) as a kit, and back. */
export class BreakeryKitHost implements KitHost {
  constructor(private app: App) {}
  targets(): KitTarget[] {
    return breakeryTargets();
  }
  async capture(base: KitData | null): Promise<{ instruments: KitInstrument[]; audio: ArchiveSample[] }> {
    const ing = this.app.ingredients;
    const audio = await ing.unstoredAudio();
    const items = await ing.kitItems();
    return { instruments: instrumentsOf(items, this.app.samples, base), audio };
  }
  async apply(_kit: KitData, mapping: KitMapping): Promise<void> {
    const ing = this.app.ingredients;
    const names = new Map((await ing.library.listSamples()).map((s) => [s.id, s.name]));
    const plan = planKit(mapping, (id) => names.get(id));
    // every sample decodes before anything changes; a failure leaves the current sounds
    const items = await ing.prepareItems(plan.items);
    ing.replaceKit(items);
    this.app.kitLoaded(plan.settings);
    if (!this.app.player.playing) ing.releaseRetired();
  }
  clear(): void {
    this.app.ingredients.replaceKit([]);
    this.app.kitLoaded({});
    if (!this.app.player.playing) this.app.ingredients.releaseRetired();
  }
  signature(): string {
    return JSON.stringify([this.app.ingredients.items.map((i) => [i.id, i.name, i.cat]), this.app.samples]);
  }
}

/** The kit session of The Breakery (Core's KitSession with this application's host). */
export function breakerySession(app: App): KitSession {
  return new KitSession(app.ingredients.library, new BreakeryKitHost(app));
}

/** How a kit maps onto The Breakery (for a summary). */
export const breakeryMapping = (kit: KitData): KitMapping => mapKit(kit, breakeryTargets());
