import { beforeEach, expect, it, vi } from 'vitest';
import { MemorySampleStore, sampleFromBytes, writeBundle } from '@slopfactory/core/storage';
import { encodeWav16 } from '@slopfactory/core/export';
import { KitManager, parseKit, kitName } from '../src/app/kits';
import { App } from '../src/app/app';
import { Ingredients } from '../src/audio/ingredients';
import { Player } from '../src/audio/player';

function storage(): Storage {
  const data = new Map<string, string>();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); }, clear: () => data.clear(), key: n => [...data.keys()][n] ?? null, get length() { return data.size; } };
}
beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('AudioBuffer', class {
    sampleRate: number; length: number; numberOfChannels: number; duration: number; channels: Float32Array[];
    constructor(o: { sampleRate: number; length: number; numberOfChannels: number }) {
      Object.assign(this, o); this.sampleRate = o.sampleRate; this.length = o.length; this.numberOfChannels = o.numberOfChannels; this.duration = o.length / o.sampleRate;
      this.channels = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
    }
    copyToChannel(data: Float32Array, n: number) { this.channels[n]!.set(data); }
    getChannelData(n: number) { return this.channels[n]!; }
  });
});
async function setup(store = new MemorySampleStore(), meta = storage()) {
  const ingredients = new Ingredients(new MemorySampleStore());
  const player = new Player(ingredients);
  const app = new App(ingredients, player, 'kit tests');
  const kits = new KitManager(app, store, meta);
  const wav = await encodeWav16([new Float32Array([0, .5, -.5, 0])], 44100);
  await ingredients.importFiles([new File([wav.slice().buffer], 'kick.wav')]);
  const wav2 = await encodeWav16([new Float32Array([0, .25, -.25, 0])], 44100);
  await ingredients.importFiles([new File([wav2.slice().buffer], 'kick2.wav')]);
  app.setSampleSettings('kick', { mode: 'weighted', weights: { [ingredients.items[0]!.id]: 3 } });
  return { ingredients, player, app, kits, store, meta, wav };
}
it('persists multiple samples, names, assignments, settings and original audio across managers', async () => {
  const s = await setup();
  await s.kits.save('My Jungle Kit');
  const id = s.kits.catalog.currentId!;
  const audio = await s.ingredients.audioFiles();
  s.kits.newKit();
  expect(s.ingredients.items).toHaveLength(0);
  const reopened = new KitManager(s.app, s.store, s.meta);
  await reopened.load(id);
  expect(s.ingredients.kit().kick).toHaveLength(2);
  expect(s.ingredients.items.every(i => i.instrument && i.status === 'ready')).toBe(true);
  expect(s.app.samples.kick?.mode).toBe('weighted');
  expect(new Uint8Array((await s.ingredients.audioFiles())[0]!.bytes)).toEqual(new Uint8Array(audio[0]!.bytes));
  expect(reopened.dirty).toBe(false);
});
it('exports and imports complete audio into an independent browser store', async () => {
  const a = await setup(); const bytes = await a.kits.export('Portable');
  const parsed = await parseKit(bytes);
  expect(parsed.doc.version).toBe(1); expect(parsed.files).toHaveLength(2);
  const b = await setup(); b.kits.newKit();
  await b.kits.import(bytes);
  expect(b.kits.name).toBe('Portable'); expect(b.kits.dirty).toBe(true);
  await b.kits.save(); b.kits.newKit(); await b.kits.load(b.kits.catalog.entries[0]!.id);
  expect(b.ingredients.kit().kick).toHaveLength(2);
  expect(new Uint8Array((await b.ingredients.audioFiles())[0]!.bytes)).toEqual(a.wav);
});
it('rename, duplicate, delete and default persist independently', async () => {
  const s = await setup(); await s.kits.save('Original'); const id = s.kits.catalog.currentId!;
  s.kits.duplicate(id, 'Copy'); const copy = s.kits.catalog.entries.find(e => e.id !== id)!;
  s.kits.rename(copy.id, 'Renamed'); s.kits.setDefault(copy.id); await s.kits.delete(id);
  s.kits.newKit(); const reopened = new KitManager(s.app, s.store, s.meta); await reopened.restore();
  expect(reopened.name).toBe('Renamed'); expect(s.ingredients.items).toHaveLength(2);
  await s.kits.delete(copy.id); expect(s.kits.catalog.defaultId).toBeNull();
});
it('tracks sound edits but ignores recipe and pattern edits; warns via dirty state until saved', async () => {
  const s = await setup(); await s.kits.save('Kit'); expect(s.kits.dirty).toBe(false);
  s.app.setRecipe({ bpm: 150 }); s.app.bake(); expect(s.kits.dirty).toBe(false);
  s.app.setSampleSettings('kick', { mode: 'roundrobin' }); expect(s.kits.dirty).toBe(true);
  await s.kits.save(); s.ingredients.setCategory(s.ingredients.items[0]!.id, 'snare'); expect(s.kits.dirty).toBe(true);
  await s.kits.save(); s.ingredients.remove(s.ingredients.items[0]!.id); expect(s.kits.dirty).toBe(true);
  await s.kits.save(); await s.ingredients.importFiles([new File([s.wav.slice().buffer], 'another.wav')]); expect(s.kits.dirty).toBe(true);
});
it('loading while playing preserves recipe, timing, history, undo and transport', async () => {
  const s = await setup(); await s.kits.save('Kit'); const id = s.kits.catalog.currentId!;
  s.app.setRecipe({ bpm: 173, swing: .3 }); s.app.bake();
  const before = JSON.parse(JSON.stringify({ recipe: s.app.recipe, seeds: s.app.seeds, edits: s.app.edits, history: s.app.history, undo: (s.app as any).undoStack, redo: (s.app as any).redoStack }));
  const hits = s.app.current.events.map(({ sample, sampleWhy, ...e }) => e);
  s.player.playing = true;
  s.player.ctx = { currentTime: 1 } as AudioContext;
  Object.assign(s.player, { current: s.app.current, tempo: 173, loopStart: 0, scheduledUntil: 1.1 });
  const stop = vi.spyOn(s.player, 'stop');
  await s.kits.load(id);
  expect({ recipe: s.app.recipe, seeds: s.app.seeds, edits: s.app.edits, history: JSON.parse(JSON.stringify(s.app.history)), undo: (s.app as any).undoStack, redo: (s.app as any).redoStack }).toEqual(before);
  expect(s.app.current.events.map(({ sample, sampleWhy, ...e }) => e)).toEqual(hits);
  expect(stop).not.toHaveBeenCalled(); expect(s.player.playing).toBe(true); expect((s.player as any).loopStart).toBe(0);
  expect((s.player as any).pending).toBe(s.app.current);
});
it('storage quota and catalog failures leave saved kit and dirty state intact', async () => {
  const s = await setup(); await s.kits.save('Kit'); const original = JSON.stringify(s.kits.catalog);
  s.ingredients.setCategory(s.ingredients.items[0]!.id, 'snare');
  // Core may deduplicate; force failure for the next write.
  vi.spyOn(s.store, 'put').mockRejectedValueOnce(new Error('Quota exceeded'));
  await expect(s.kits.save()).rejects.toThrow('Quota'); expect(JSON.stringify(s.kits.catalog)).toBe(original); expect(s.kits.dirty).toBe(true);
  vi.spyOn(s.meta, 'setItem').mockImplementationOnce(() => { throw new Error('Storage disabled'); });
  await expect(s.kits.save()).rejects.toThrow('Storage disabled'); expect(JSON.stringify(s.kits.catalog)).toBe(original);
});
it('rejects malformed, unsupported, missing audio and invalid settings without replacing current sounds', async () => {
  const s = await setup(); const original = s.ingredients.items;
  await expect(s.kits.import(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  const parsed = await parseKit(await s.kits.export());
  for (const change of [ { version: 99 }, { items: [{ id: 'a', name: 'Bad', cat: 'kick', audio: 'missing' }] }, { settings: { kick: { mode: 'nope' } } }, { items: [parsed.doc.items[0], parsed.doc.items[0]] } ]) {
    const bytes = writeBundle('the-breakery-kit', { name: 'kit.json', text: JSON.stringify({ ...parsed.doc, ...change }) }, parsed.files);
    await expect(s.kits.import(bytes)).rejects.toThrow(); expect(s.ingredients.items).toBe(original);
  }
  const broken = await sampleFromBytes(new Uint8Array([1, 2]).buffer, 'broken.wav');
  const bytes = writeBundle('the-breakery-kit', { name: 'kit.json', text: JSON.stringify({ ...parsed.doc, items: [{ ...parsed.doc.items[0], audio: broken.id }] }) }, [broken]);
  await expect(s.kits.import(bytes)).rejects.toThrow(); expect(s.ingredients.items).toBe(original);
});
it('validates names and prevents case-insensitive overwrites', async () => {
  const s = await setup(); expect(() => kitName(' ')).toThrow(); expect(() => kitName('x'.repeat(65))).toThrow();
  await s.kits.save('My Kit'); await expect(s.kits.save('my kit', true)).rejects.toThrow('already exists');
});
it('exports synthetic demo audio and restores it without the demo source', async () => {
  const s = await setup(); s.ingredients.clear(); s.ingredients.loadDemo();
  const bytes = await s.kits.export('Demo'); const count = s.ingredients.items.length;
  s.kits.newKit(); await s.kits.import(bytes);
  expect(s.ingredients.items).toHaveLength(count);
  expect(s.ingredients.items.every(i => i.source === 'user' && i.instrument)).toBe(true);
});
it('falls back to new kit sounds for missing pinned samples and retains pending old instruments until swap', async () => {
  const s = await setup(); await s.kits.save('Kit'); const id = s.kits.catalog.currentId!;
  const old = s.ingredients.items[0]!;
  const originalInstrument = old.instrument;
  s.app.rebake(); s.app.current.events[0]!.pinned = old.id;
  s.ingredients.items = s.ingredients.items.slice(1);
  await s.kits.save('Other', true); const other = s.kits.catalog.currentId!;
  await s.kits.load(id);
  s.app.current.events[0]!.pinned = old.id;
  s.player.playing = true;
  await s.kits.load(other);
  expect(s.app.current.events[0]!.sample).not.toBe(old.id);
  expect(s.ingredients.instrument(old.id)).toBeTruthy();
  s.player.onSwap(s.app.current);
  expect(s.ingredients.instrument(old.id)).toBeNull();
  expect(originalInstrument).toBeTruthy();
});
it('allows export when persistent audio storage is unavailable', async () => {
  const s = await setup(); const unavailable = new KitManager(s.app, null, storage());
  await expect(unavailable.save('Unavailable')).rejects.toThrow('unavailable');
  expect((await parseKit(await unavailable.export())).files).toHaveLength(2);
});
