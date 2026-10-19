/**
 * Browser-only checks of kits (the real app in Chromium, real IndexedDB and localStorage),
 * invoked by kitsBrowser.test.ts from test/kits-test.html, which does not start the app itself:
 * it seeds the first release's saved kits, then runs the app in a same-origin frame (so storage
 * is shared), reloads it, and checks that nothing was lost.
 */
import { encodeWav16 } from '@slopfactory/core/export';
import { decodeSample } from '@slopfactory/core/sampler';
import { IndexedDbSampleStore, sampleFromBytes, writeBundle } from '@slopfactory/core/storage';
import { readKitArchive, type KitLibrary, type KitSession } from '@slopfactory/core/kits';
import type { App } from '../src/app/app';
import type { Ingredients, ImportEntry } from '../src/audio/ingredients';

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
type Breakery = { app: App; ingredients: Ingredients; kits: KitSession; library: KitLibrary; importEntries(e: ImportEntry[]): Promise<void> };
const tone = (f: number) => encodeWav16([Float32Array.from({ length: 4410 }, (_, i) => Math.sin((i * f * 2 * Math.PI) / 44100) * Math.exp(-i / 900) * 0.8)], 44100);

async function boot(frame: HTMLIFrameElement): Promise<Breakery> {
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.src = '/index.html?seed=4242';
  });
  for (let i = 0; i < 200; i++) {
    const b = (frame.contentWindow as unknown as { breakery?: Breakery }).breakery;
    if (b?.kits && b.ingredients.items.every((x) => x.status !== 'loading')) return b;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('the app did not start');
}

export async function run(): Promise<string> {
  // ---------------------------------------------------------------- the first release's data
  localStorage.clear();
  const legacy = new IndexedDbSampleStore('the-breakery-kits');
  const kick = await sampleFromBytes((await tone(60)).slice().buffer, 'kick.wav', 'audio/wav');
  const snare = await sampleFromBytes((await tone(300)).slice().buffer, 'snare.wav', 'audio/wav');
  const doc = { format: 'breakery-kit', version: 1, name: 'Legacy Kit', items: [{ id: kick.id, name: 'kick.wav', cat: 'kick', audio: kick.id }, { id: snare.id, name: 'snare.wav', cat: 'snare', audio: snare.id }], settings: { kick: { mode: 'fixed', fixed: kick.id } } };
  const bundle = await sampleFromBytes(writeBundle('the-breakery-kit', { name: 'kit.json', text: JSON.stringify(doc) }, [kick, snare]).slice().buffer, 'Legacy Kit.breakery-kit', 'application/zip');
  await legacy.put(bundle);
  const catalog = JSON.stringify({ entries: [{ id: 'legacy-1', name: 'Legacy Kit', count: 2, blob: bundle.id }], defaultId: 'legacy-1', currentId: 'legacy-1' });
  localStorage.setItem('breakery.kits.v1', catalog);

  // ---------------------------------------------------------------- first start: migration
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:900px;height:500px';
  document.body.appendChild(frame);
  let b = await boot(frame);
  check(b.kits.kits.map((k) => k.name).join() === 'Legacy Kit', `migrated kits: ${JSON.stringify(b.kits.kits)}`);
  check(b.kits.currentId === 'legacy-1' && b.kits.defaultId === 'legacy-1', 'the default kit opened');
  check(JSON.stringify(b.ingredients.items.map((i) => [i.id, i.cat, i.status])) === JSON.stringify([[kick.id, 'kick', 'ready'], [snare.id, 'snare', 'ready']]), `ingredients: ${JSON.stringify(b.ingredients.items.map((i) => [i.name, i.cat, i.status]))}`);
  check(b.app.samples.kick?.mode === 'fixed' && b.app.samples.kick.fixed === kick.id, 'PICK settings migrated');
  check(!b.kits.dirty, 'not dirty after restore');
  check(localStorage.getItem('breakery.kits.v1') === catalog && (await legacy.has(bundle.id)), 'legacy data untouched');

  // ---------------------------------------------------------------- import, save, reload
  const hat = new File([(await tone(5000)).slice().buffer], 'Closed Hat 01.wav', { type: 'audio/wav' });
  await b.importEntries([{ file: hat, path: '' }]);
  check(b.ingredients.inSlot('hat').length === 1, 'the hat imported into HAT');
  check(b.kits.dirty, 'dirty after import');
  await b.kits.saveAs('Browser Kit');
  await b.kits.setDefault(b.kits.currentId);
  const bake = JSON.stringify(b.app.current.events.map((e) => [e.cat, e.bar, e.ref, e.vel, e.swing, e.offsetMs]));

  b = await boot(frame);
  check(b.kits.kits.map((k) => k.name).join() === 'Browser Kit,Legacy Kit', `kits after reload: ${b.kits.kits.map((k) => k.name)}`);
  check(b.kits.name === 'Browser Kit' && !b.kits.dirty, 'the default kit opened after reload');
  check(b.ingredients.items.length === 3 && b.ingredients.items.every((i) => i.status === 'ready'), 'three ready samples after reload');
  check((await b.library.listSamples()).length === 3, 'three samples in the library (stored once)');
  check(JSON.stringify(b.app.current.events.map((e) => [e.cat, e.bar, e.ref, e.vel, e.swing, e.offsetMs])) === bake, 'the break was not regenerated by the kit');

  // ---------------------------------------------------------------- export: playable audio
  const f = await b.kits.exportCurrent();
  const read = await readKitArchive(f.bytes);
  check(read.samples.length === 3 && read.kit.instruments.map((i) => i.role).join() === 'kick,snare,hat-closed', `export: ${read.kit.instruments.map((i) => i.role)}`);
  for (const s of read.samples) check((await decodeSample(s.bytes, s.name)).frames === 4410, `${s.name} decodes`);

  // ---------------------------------------------------------------- load the other kit: hits stay
  await b.kits.load('legacy-1');
  check(b.ingredients.inSlot('hat').length === 0 && b.ingredients.kit().kick.length === 1 && JSON.stringify(b.app.current.events.map((e) => [e.cat, e.bar, e.ref, e.vel, e.swing, e.offsetMs])) === bake, 'loading a kit keeps every hit');
  frame.remove();
  return 'passed';
}
