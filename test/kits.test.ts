import { beforeEach, expect, it, vi } from 'vitest';
import { MemorySampleStore, sampleFromBytes, writeBundle } from '@slopfactory/core/storage';
import { encodeWav16 } from '@slopfactory/core/export';
import { KitError, KitLibrary, MemoryKitStore, readKitArchive } from '@slopfactory/core/kits';
import { breakerySession, breakeryMapping, instrumentsOf, legacyKit, legacyReader, migrateLegacy, planKit } from '../src/app/kits';
import { App } from '../src/app/app';
import { Ingredients } from '../src/audio/ingredients';
import { Player } from '../src/audio/player';
import { readBundle } from '@slopfactory/core/storage';

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
const wavOf = (v: number[]) => encodeWav16([new Float32Array(v)], 44100);
function makeLibrary(audio = new MemorySampleStore(), store = new MemoryKitStore()) {
  let ing: Ingredients | null = null;
  const library = new KitLibrary({ app: 'the-breakery', audio, store, inUse: () => ing?.items.filter(i => i.source === 'user').map(i => Ingredients.audioId(i)) ?? [] });
  return { library, audio, store, bind: (i: Ingredients) => (ing = i) };
}
async function setup(lib = makeLibrary()) {
  const ingredients = new Ingredients(lib.library);
  lib.bind(ingredients);
  const player = new Player(ingredients);
  const app = new App(ingredients, player, 'kit tests');
  const kits = breakerySession(app);
  const wav = await wavOf([0, .5, -.5, 0]);
  await ingredients.importFiles([new File([wav.slice().buffer], 'kick.wav')]);
  const wav2 = await wavOf([0, .25, -.25, 0]);
  await ingredients.importFiles([new File([wav2.slice().buffer], 'kick2.wav')]);
  app.setSampleSettings('kick', { mode: 'weighted', weights: { [ingredients.items[0]!.id]: 3 } });
  return { ingredients, player, app, kits, wav, ...lib };
}

it('persists multiple samples, names, assignments, settings and original audio across sessions', async () => {
  const s = await setup();
  await s.kits.save('My Jungle Kit');
  const id = s.kits.currentId!;
  const audio = await s.ingredients.audioFiles();
  await s.kits.newKit();
  expect(s.ingredients.items).toHaveLength(0);
  const reopened = breakerySession(s.app);
  await reopened.load(id);
  expect(s.ingredients.kit().kick).toHaveLength(2);
  expect(s.ingredients.items.every(i => i.instrument && i.status === 'ready')).toBe(true);
  expect(s.app.samples.kick?.mode).toBe('weighted');
  expect(s.app.samples.kick?.weights?.[s.ingredients.items[0]!.id]).toBe(3);
  expect(new Uint8Array((await s.ingredients.audioFiles())[0]!.bytes)).toEqual(new Uint8Array(audio[0]!.bytes));
  expect(reopened.dirty).toBe(false);
});

it('saving kits stores each sample once: kits share audio (no bundle per kit)', async () => {
  const s = await setup();
  await s.kits.save('One');
  await s.kits.saveAs('Two');
  await s.kits.duplicate(s.kits.currentId!, 'Three');
  expect((await s.audio.list()).length).toBe(2);
  expect(s.kits.kits.map(k => [k.name, k.samples])).toEqual([['One', 2], ['Three', 2], ['Two', 2]]);
});

it('exports and imports complete audio into an independent browser library', async () => {
  const a = await setup(); const { bytes, fileName } = await a.kits.exportCurrent('Portable');
  expect(fileName).toBe('Portable.kit.zip');
  const parsed = await readKitArchive(bytes);
  expect(parsed.generator.app).toBe('the-breakery');
  expect(parsed.samples).toHaveLength(2);
  expect(parsed.kit.instruments).toMatchObject([{ role: 'kick', label: 'KICK', selection: 'weighted', samples: [{ name: 'kick.wav', weight: 3 }, { name: 'kick2.wav' }] }]);
  const b = await setup(); await b.kits.newKit();
  await b.kits.importFile(bytes);
  expect(b.kits.name).toBe('Portable'); expect(b.kits.dirty).toBe(true);
  await b.kits.save(); await b.kits.newKit(); await b.kits.load(b.kits.kits[0]!.id);
  expect(b.ingredients.kit().kick).toHaveLength(2);
  expect(new Uint8Array((await b.ingredients.audioFiles())[0]!.bytes)).toEqual(a.wav);
});

it('rename, duplicate, delete and default persist independently', async () => {
  const s = await setup(); await s.kits.save('Original'); const id = s.kits.currentId!;
  const copy = await s.kits.duplicate(id, 'Copy');
  await s.kits.rename(copy.id, 'Renamed'); await s.kits.setDefault(copy.id); await s.kits.delete(id);
  await s.kits.newKit();
  const reopened = breakerySession(s.app); expect(await reopened.restore()).toBeNull();
  expect(reopened.name).toBe('Renamed'); expect(s.ingredients.items).toHaveLength(2);
  await reopened.delete(copy.id); expect(reopened.defaultId).toBeNull();
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
  const s = await setup(); await s.kits.save('Kit'); const id = s.kits.currentId!;
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

it('storage failures leave the saved kit and dirty state intact', async () => {
  const s = await setup(); await s.kits.save('Kit'); const original = JSON.stringify(await s.library.getKit(s.kits.currentId!));
  s.ingredients.setCategory(s.ingredients.items[0]!.id, 'snare');
  vi.spyOn(s.store, 'commit').mockRejectedValueOnce(new Error('Quota exceeded'));
  await expect(s.kits.save()).rejects.toThrow('Quota'); expect(JSON.stringify(await s.library.getKit(s.kits.currentId!))).toBe(original); expect(s.kits.dirty).toBe(true);
});

it('asks before replacing a kit of the same name; names are case-insensitively unique', async () => {
  const s = await setup(); await s.kits.save('My Kit');
  await expect(s.kits.saveAs('my kit')).rejects.toMatchObject({ code: 'exists' });
  await s.kits.saveAs('my kit', { replace: true });
  expect(s.kits.kits.map(k => k.name)).toEqual(['my kit']);
  await expect(s.kits.saveAs(' ')).rejects.toBeInstanceOf(KitError);
});

it('rejects malformed and unsupported files without replacing current sounds', async () => {
  const s = await setup(); const original = s.ingredients.items;
  await expect(s.kits.importFile(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  const broken = await sampleFromBytes(new Uint8Array([1, 2]).buffer, 'broken.wav');
  const legacyBroken = writeBundle('the-breakery-kit', { name: 'kit.json', text: JSON.stringify({ format: 'breakery-kit', version: 1, name: 'X', items: [{ id: broken.id, name: 'b', cat: 'kick', audio: broken.id }], settings: {} }) }, [broken]);
  await expect(s.kits.importFile(legacyBroken, { legacy: legacyReader })).rejects.toThrow();
  for (const change of [{ version: 99 }, { items: [{ id: 'a', name: 'Bad', cat: 'kick', audio: 'missing' }] }, { settings: { kick: { mode: 'nope' } } }]) {
    const bytes = writeBundle('the-breakery-kit', { name: 'kit.json', text: JSON.stringify({ format: 'breakery-kit', version: 1, name: 'X', items: [], settings: {}, ...change }) }, []);
    await expect(s.kits.importFile(bytes, { legacy: legacyReader })).rejects.toThrow();
  }
  expect(s.ingredients.items).toBe(original);
});

it('exports synthetic demo audio and restores it without the demo source', async () => {
  const s = await setup(); s.ingredients.clear(); s.ingredients.loadDemo();
  const { bytes } = await s.kits.exportCurrent('Demo'); const count = s.ingredients.items.length;
  await s.kits.newKit(); await s.kits.importFile(bytes);
  expect(s.ingredients.items).toHaveLength(count);
  expect(s.ingredients.items.every(i => i.source === 'user' && i.instrument)).toBe(true);
  expect(s.ingredients.items[0]!.id).toMatch(/^demo:/); // pattern hits and PICK settings keep their ids
  expect(s.ingredients.items[0]!.audio).toMatch(/^[0-9a-f]{64}$/);
});

it('falls back to new kit sounds for missing pinned samples and retains pending old instruments until swap', async () => {
  const s = await setup(); await s.kits.save('Kit'); const id = s.kits.currentId!;
  const old = s.ingredients.items[0]!;
  const originalInstrument = old.instrument;
  s.app.rebake(); s.app.current.events[0]!.pinned = old.id;
  s.ingredients.items = s.ingredients.items.slice(1);
  await s.kits.saveAs('Other'); const other = s.kits.currentId!;
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

it('allows export when persistent storage is unavailable', async () => {
  const s = await setup(makeLibrary());
  const lib = new KitLibrary({ app: 'the-breakery', audio: null, store: null });
  const ing = new Ingredients(lib); const app = new App(ing, new Player(ing), 'x');
  await ing.importFiles([new File([s.wav.slice().buffer], 'kick.wav')]);
  expect(ing.items[0]!.message).toMatch(/unavailable/);
  const kits = breakerySession(app);
  await expect(kits.save('Unavailable')).rejects.toMatchObject({ code: 'unavailable' });
  expect((await readKitArchive((await kits.exportCurrent()).bytes)).samples).toHaveLength(1);
});

it('removing an ingredient never deletes audio a saved kit uses; unused audio is freed', async () => {
  const s = await setup(); await s.kits.save('Keep');
  const [a, b] = s.ingredients.items;
  s.ingredients.remove(a!.id);
  await new Promise(r => setTimeout(r, 0));
  expect(await s.audio.has(a!.id)).toBe(true);
  await s.kits.delete(s.kits.kits[0]!.id);
  s.ingredients.remove(b!.id);
  await new Promise(r => setTimeout(r, 0));
  expect(await s.audio.has(b!.id)).toBe(false);
});

it('the library adds stored samples to the current kit without importing them again', async () => {
  const s = await setup(); await s.kits.save('Kit');
  await s.kits.newKit();
  const [first] = await s.library.listSamples();
  await s.ingredients.addFromLibrary([{ id: first!.id, name: first!.name }], 'snare');
  expect(s.ingredients.kit().snare).toEqual([first!.id]);
  expect((await s.audio.list()).length).toBe(2);
});

it('maps other applications\' roles: extra roles go to PERC or UNSORTED and keep their role on save (clap and fx have their own tracks)', () => {
  const id = (n: number) => n.toString(16).padStart(64, '0');
  const kit = { name: 'From elsewhere', instruments: [
    { role: 'kick', samples: [{ sample: id(1) }] },
    { role: 'cowbell', label: 'COWBELL', samples: [{ sample: id(2) }] },
    { role: 'hat-closed', index: 1, samples: [{ sample: id(3) }] },
    { role: 'fx', samples: [{ sample: id(4), name: 'zap' }] },
    { role: 'clap', samples: [{ sample: id(5) }] },
    { role: 'tambourine', samples: [{ sample: id(6) }] },
  ] };
  const m = breakeryMapping(kit);
  const plan = planKit(m, () => 'x');
  expect(plan.items.map(i => [i.cat, i.role ?? null])).toEqual([['kick', null], ['clap', null], ['hat', null], ['perc', 'cowbell'], ['fx', null], ['unsorted', 'tambourine']]);
  const back = instrumentsOf(plan.items, plan.settings);
  expect(back.map(i => [i.role, i.index ?? 0]).sort()).toEqual([['clap', 0], ['cowbell', 0], ['fx', 0], ['hat-closed', 1], ['kick', 0], ['tambourine', 0]]);
});

it('a DOWNBEAT kit passes through: SNARE 1 and 2 both play in SNARE, and saving keeps them distinct with their settings', () => {
  const id = (n: number) => n.toString(16).padStart(64, '0');
  const zone = (volume: number) => ({ downbeat: { voice: 'SNARE', zone: { volume } } });
  const kit = { name: 'From DOWNBEAT', instruments: [
    { role: 'snare', label: 'SNARE 1', samples: [{ sample: id(1), name: 'sd1.wav' }], ext: zone(0.5) },
    { role: 'snare', index: 1, label: 'SNARE 2', samples: [{ sample: id(2), name: 'sd2.wav' }], ext: zone(0.9) },
  ] };
  const plan = planKit(breakeryMapping(kit), () => 'x');
  expect(plan.items.map(i => [i.name, i.cat])).toEqual([['sd1.wav', 'snare'], ['sd2.wav', 'snare']]);
  const back = instrumentsOf(plan.items, plan.settings, kit);
  expect(back.map(i => [i.role, i.index ?? 0, i.ext])).toEqual([['snare', 0, zone(0.5)], ['snare', 1, zone(0.9)]]);
  expect(back[1]!.label).toBe('SNARE 2');
});

it('migrates kits saved by the first release, untouched, resumably, with default and current', async () => {
  const lib = makeLibrary();
  const legacy = new MemorySampleStore();
  const meta = storage();
  const wav = await wavOf([0, .5, -.5, 0]); const wav2 = await wavOf([0, .1, -.1, 0]);
  const s1 = await sampleFromBytes(wav.slice().buffer, 'kick.wav', 'audio/wav');
  const s2 = await sampleFromBytes(wav2.slice().buffer, 'snare.wav', 'audio/wav');
  const doc = (name: string) => ({ format: 'breakery-kit', version: 1, name, items: [{ id: s1.id, name: 'kick.wav', cat: 'kick', audio: s1.id }, { id: 'demo:snare', name: 'DEMO SNARE', cat: 'snare', audio: s2.id }], settings: { kick: { mode: 'fixed', fixed: s1.id } } });
  const blobs = [];
  for (const name of ['Old One', 'Old Two']) {
    const b = await sampleFromBytes(writeBundle('the-breakery-kit', { name: 'kit.json', text: JSON.stringify(doc(name)) }, [s1, s2]).slice().buffer, name + '.breakery-kit', 'application/zip');
    await legacy.put(b); blobs.push(b.id);
  }
  const catalog = { entries: [{ id: 'k1', name: 'Old One', count: 2, blob: blobs[0] }, { id: 'k2', name: 'Old Two', count: 2, blob: blobs[1] }, { id: 'k3', name: 'Lost', count: 1, blob: 'f'.repeat(64) }], defaultId: 'k2', currentId: 'k1' };
  meta.setItem('breakery.kits.v1', JSON.stringify(catalog));
  const before = meta.getItem('breakery.kits.v1');
  const [first] = await migrateLegacy(lib.library, legacy, meta, []);
  expect(first).toMatchObject({ ran: true, migrated: 2 });
  expect(first!.problems[0]).toMatch(/^k3: .*Lost/);
  expect((await lib.library.listKits()).map(k => [k.id, k.name, k.samples])).toEqual([['k1', 'Old One', 2], ['k2', 'Old Two', 2]]);
  expect(await lib.library.getDefault()).toBe('k2');
  expect((await lib.audio.list()).length).toBe(2); // shared audio, stored once
  expect(meta.getItem('breakery.kits.v1')).toBe(before); // the old data is left as it was
  expect((await legacy.list()).length).toBe(2);
  // not complete (k3 failed): it runs again, without repeating k1 and k2
  const save = vi.spyOn(lib.library, 'saveKit');
  const [again] = await migrateLegacy(lib.library, legacy, meta, []);
  expect(again).toMatchObject({ ran: true, migrated: 0 });
  expect(save).not.toHaveBeenCalled();
  // and the migrated kit loads with its assignments, ids and PICK settings
  const s = await setup(lib);
  await s.kits.load('k1');
  expect(s.ingredients.items.map(i => [i.id, i.cat])).toEqual([[s1.id, 'kick'], ['demo:snare', 'snare']]);
  expect(s.app.samples.kick).toMatchObject({ mode: 'fixed', fixed: s1.id });
});

it('a legacy .breakery-kit file converts exactly', async () => {
  const wav = await wavOf([0, .5, -.5, 0]);
  const s1 = await sampleFromBytes(wav.slice().buffer, 'kick.wav');
  const bundle = await readBundle(writeBundle('the-breakery-kit', { name: 'kit.json', text: JSON.stringify({ format: 'breakery-kit', version: 1, name: 'Old', items: [{ id: s1.id, name: 'Kick', cat: 'kick', audio: s1.id }, { id: 'x', name: 'Odd', cat: 'unsorted', audio: s1.id }], settings: { kick: { mode: 'weighted', weights: { [s1.id]: 4 } } } }) }, [s1]), 'the-breakery-kit');
  const { kit } = legacyKit(bundle);
  expect(kit.instruments).toEqual([
    { role: 'kick', label: 'KICK', selection: 'weighted', samples: [{ sample: s1.id, name: 'Kick', weight: 4 }] },
    { role: 'unassigned', samples: [{ sample: s1.id, name: 'Odd', ext: { 'the-breakery': { item: 'x' } } }] },
  ]);
});

// ---------------------------------------------------------------- Phase 17: library samples in any kit

it('Phase 17: a sample imported into kit A is added to kit B from the library, by reference, in the instrument chosen', async () => {
  const s = await setup();
  await s.kits.save('A');
  const a = s.kits.currentId!;
  const x = s.ingredients.items[0]!; // kick.wav, a KICK in kit A
  await s.kits.newKit();
  // the explicit destination wins: kit A's KICK sample becomes kit B's SNARE
  expect(await s.app.addFromLibrary([{ id: x.id, name: x.name }], 'snare')).toEqual([x.id]);
  expect(s.ingredients.kit().snare).toEqual([x.id]);
  expect(s.ingredients.kit().kick).toEqual([]);
  expect(s.ingredients.items[0]!.instrument).toBeTruthy();
  expect((await s.audio.list()).length).toBe(2); // no copy of the audio
  await s.kits.save('B');
  const b = s.kits.currentId!;
  expect((await s.library.getKit(b))!.instruments).toMatchObject([{ role: 'snare', samples: [{ sample: x.id }] }]);
  // removing it from B leaves A (and the audio) alone
  s.ingredients.remove(x.id);
  await new Promise((r) => setTimeout(r, 0));
  expect(await s.audio.has(x.id)).toBe(true);
  await s.kits.load(a);
  expect(s.ingredients.kit().kick).toContain(x.id);
  // deleting kit B never deletes a sample kit A uses
  await s.kits.delete(b);
  expect(await s.audio.has(x.id)).toBe(true);
});

it('Phase 17: a sample already in the kit gets a second assignment (same audio), kept through save, load, export and import', async () => {
  const s = await setup();
  const x = s.ingredients.items[0]!;
  const ids = await s.app.addFromLibrary([{ id: x.id, name: x.name }], 'snare');
  expect(ids).toEqual([`${x.id}@snare`]);
  expect(s.ingredients.kit().kick).toContain(x.id);
  expect(s.ingredients.kit().snare).toEqual([`${x.id}@snare`]);
  // the second assignment shares the first one's decoded audio
  expect(s.ingredients.items.find((i) => i.id === ids[0])!.instrument).toBe(x.instrument);
  expect(await s.app.addFromLibrary([{ id: x.id, name: x.name }], 'snare')).toEqual([]); // once per instrument
  await s.kits.save('Both');
  const id = s.kits.currentId!;
  await s.kits.newKit();
  await s.kits.load(id);
  expect(s.ingredients.kit().kick).toContain(x.id);
  expect(s.ingredients.kit().snare).toEqual([`${x.id}@snare`]);
  const { bytes } = await s.kits.exportCurrent('Both');
  const parsed = await readKitArchive(bytes);
  expect(parsed.samples).toHaveLength(2); // the audio once, self-contained
  const other = await setup(makeLibrary());
  await other.kits.newKit();
  await other.kits.importFile(bytes);
  expect(other.ingredients.kit().snare).toHaveLength(1);
  expect(other.ingredients.kit().kick).toHaveLength(2);
  // removing the SNARE assignment keeps the KICK one and the audio
  s.ingredients.remove(`${x.id}@snare`);
  await new Promise((r) => setTimeout(r, 0));
  expect(s.ingredients.kit().kick).toContain(x.id);
  expect(await s.audio.has(x.id)).toBe(true);
});

it('Phase 17: ADD FROM LIBRARY is one undo step; undo removes the assignment (never the audio), redo brings the same sample back', async () => {
  const s = await setup();
  await s.kits.save('A');
  const x = s.ingredients.items[1]!;
  await s.kits.newKit();
  const before = s.app.current.events.length;
  await s.app.addFromLibrary([{ id: x.id, name: x.name }], 'kick');
  expect(s.ingredients.kit().kick).toEqual([x.id]);
  expect(s.app.canUndo).toBe(true);
  s.app.undo();
  expect(s.ingredients.kit().kick).toEqual([]);
  expect(await s.audio.has(x.id)).toBe(true);
  expect(s.app.current.events.length).toBe(before);
  s.app.redo();
  await new Promise((r) => setTimeout(r, 10));
  expect(s.ingredients.kit().kick).toEqual([x.id]);
  expect(s.ingredients.items[0]!.instrument).toBeTruthy();
});

it('Phase 17: the library dialog lists each sample with its kit category, or its name\'s', async () => {
  const { libraryEntries } = await import('../src/ui/libraryDialog');
  const s = await setup();
  s.ingredients.setCategory(s.ingredients.items[1]!.id, 'snare');
  await s.kits.save('A');
  await s.kits.newKit();
  const entries = await libraryEntries(s.library, s.ingredients.items);
  expect(entries.map((e) => [e.name, e.cat, e.guessed, e.inKit])).toEqual([['kick.wav', 'kick', false, []], ['kick2.wav', 'snare', false, []]]);
});
