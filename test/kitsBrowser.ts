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

const wait = async (ok: () => unknown, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`timed out: ${what}`);
};

/** The KITS panel through its own controls: the list's four states and every kit operation. */
async function kitList(doc: Document, b: Breakery): Promise<void> {
  const list = doc.querySelector<HTMLElement>('.gsel[aria-label="Saved kits"]')!;
  const tab = [...doc.querySelectorAll('.mtab')].find((t) => t.textContent === 'KITS')!;
  for (const type of ['pointerdown', 'pointerup']) tab.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1 }));
  doc.defaultView!.focus();
  const panel = list.parentElement!;
  const items = () => [...list.querySelectorAll<HTMLElement>('.msel-item')];
  const item = (name: string) => items().find((i) => i.textContent!.replace(/^★ /, '').startsWith(name + ' ('));
  const selected = () => items().find((i) => i.getAttribute('aria-selected') === 'true');
  const ev = (t: Element, type: string) => t.dispatchEvent(new PointerEvent(type, { bubbles: type !== 'pointerenter' && type !== 'pointerleave', cancelable: true, pointerId: 1 }));
  const click = (t: Element) => (ev(t, 'pointerdown'), ev(t, 'pointerup'));
  const press = (label: string) => click([...panel.querySelectorAll('.btn')].find((x) => x.textContent === label)!);
  const answer = async (value: string | null) => {
    await wait(() => doc.querySelector('.mdialog'), 'a dialog');
    const field = doc.querySelector<HTMLInputElement>('.mdialog input.mtext');
    if (field && value !== null) field.value = value;
    doc.querySelector<HTMLButtonElement>('.mdialog .mbutton.default')!.click();
  };
  const noPhantoms = () => check(items().length === b.kits.kits.length && items().every((i) => b.kits.kits.some((k) => i.textContent!.includes(k.name))), `list matches the saved kits: ${items().map((i) => i.textContent)}`);

  check(item('Legacy Kit')?.classList.contains('loaded') && !item('Browser Kit')?.classList.contains('loaded'), 'the loaded kit is marked');
  check(getComputedStyle(item('Legacy Kit')!, '::before').content.includes('▸'), 'the loaded mark is drawn');

  // hover: outlined, not selected; a release without a press on that entry selects nothing
  click(item('Legacy Kit')!);
  check(selected() === item('Legacy Kit'), 'a click selects');
  const other = item('Browser Kit')!;
  ev(other, 'pointerenter');
  check(other.classList.contains('hover') && selected() === item('Legacy Kit'), 'hover outlines without selecting');
  check(getComputedStyle(other).backgroundColor !== getComputedStyle(selected()!).backgroundColor, 'hover and selected look different');
  ev(other, 'pointerup');
  check(selected() === item('Legacy Kit'), 'a release dragged in from elsewhere does not select');
  ev(other, 'pointerleave');
  check(!other.classList.contains('hover'), 'leaving clears the hover');

  // keyboard: the arrows move the cursor, Enter selects
  list.focus();
  const key = (k: string) => list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const before = selected();
  key(before === items()[0] ? 'ArrowDown' : 'ArrowUp');
  const cursor = list.querySelector('.msel-item.hot');
  check(cursor && cursor !== before && selected() === before, 'an arrow moves the cursor, not the selection');
  check(getComputedStyle(cursor).outlineStyle === 'dashed', `the cursor is drawn as a dashed outline (${getComputedStyle(cursor).outlineStyle}, focused ${doc.activeElement === list}, :focus ${list.matches(':focus')})`);
  key('Enter');
  check(selected() === cursor, 'Enter selects the entry under the cursor');

  // NEW: saved under a name at once, selected and loaded, no phantom entry
  press('NEW');
  await wait(() => doc.querySelector<HTMLInputElement>('.mdialog input.mtext')?.value === 'Untitled Kit', 'the NEW name prompt');
  await answer(null);
  await wait(() => item('Untitled Kit') && selected() === item('Untitled Kit'), 'the new kit selected');
  check(item('Untitled Kit')!.classList.contains('loaded') && b.kits.name === 'Untitled Kit' && !b.kits.dirty, 'the new kit is the loaded kit');
  noPhantoms();

  // RENAME it straight away
  press('RENAME');
  await answer('Fresh Kit');
  await wait(() => item('Fresh Kit') && selected() === item('Fresh Kit'), 'the renamed kit still selected');
  check(!item('Untitled Kit') && (b.kits.name as string) === 'Fresh Kit', 'renamed in place');
  noPhantoms();

  // DUPLICATE the Legacy Kit: the copy is selected, the loaded kit stays loaded
  click(item('Legacy Kit')!);
  press('DUPLICATE');
  await answer(null);
  await wait(() => item('Legacy Kit Copy') && selected() === item('Legacy Kit Copy'), 'the duplicate selected');
  check(item('Fresh Kit')!.classList.contains('loaded') && !item('Legacy Kit Copy')!.classList.contains('loaded'), 'duplicating does not load');
  noPhantoms();

  // SAVE AS: the new kit is selected and loaded
  press('SAVE AS');
  await answer('Saved As Kit');
  await wait(() => item('Saved As Kit') && selected() === item('Saved As Kit') && item('Saved As Kit')!.classList.contains('loaded'), 'SAVE AS selects the new kit');
  noPhantoms();

  // DELETE the copy: gone, the selection falls back to the loaded kit
  click(item('Legacy Kit Copy')!);
  press('DELETE');
  await answer(null);
  await wait(() => !item('Legacy Kit Copy'), 'the copy deleted');
  check(selected() === item('Saved As Kit'), 'after DELETE the loaded kit is selected');
  noPhantoms();

  // LOAD by selection: only the selected kit loads
  click(item('Legacy Kit')!);
  press('LOAD');
  await wait(() => b.kits.currentId === 'legacy-1' && item('Legacy Kit')!.classList.contains('loaded'), 'LOAD loads the selected kit');
  check(!item('Saved As Kit')!.classList.contains('loaded'), 'one loaded mark');
  noPhantoms();
}

/** Files dropped on an INGREDIENTS row or list go to that instrument; elsewhere, names decide. */
async function dropTargets(doc: Document, b: Breakery): Promise<void> {
  const win = doc.defaultView!;
  const tab = [...doc.querySelectorAll('.mtab')].find((t) => t.textContent === 'INGREDIENTS')!;
  for (const type of ['pointerdown', 'pointerup']) tab.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1 }));
  const row = (label: string) => [...doc.querySelectorAll<HTMLElement>('.catrow')].find((r) => r.querySelector('.cname')?.textContent === label)!;
  const drop = (target: EventTarget, files: File[]) => {
    const dt = new win.DataTransfer();
    for (const f of files) dt.items.add(f);
    const over = new win.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    target.dispatchEvent(over);
    const lit = target instanceof win.HTMLElement && target.classList.contains('droptarget');
    target.dispatchEvent(new win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { accepted: over.defaultPrevented, lit };
  };
  const wav = async (name: string, f: number) => new win.File([(await tone(f)).slice().buffer], name, { type: 'audio/wav' });
  const named = (n: string) => b.ingredients.items.find((i) => i.name === n);

  // a kick-named file dropped on SNARE is a snare
  const kick99 = await wav('Kick 99.wav', 77);
  const r1 = drop(row('SNARE'), [kick99]);
  check(r1.accepted && r1.lit, 'the SNARE row accepts a file drag and lights up');
  await wait(() => named('Kick 99.wav')?.cat === 'snare', 'Kick 99.wav dropped on SNARE');
  check(!row('SNARE').classList.contains('droptarget'), 'the drop target clears');

  // several files on CLAP, the same file again on HAT moves it (not loaded twice)
  drop(row('CLAP'), [await wav('a.wav', 900), await wav('b.wav', 1100)]);
  await wait(() => named('a.wav')?.cat === 'clap' && named('b.wav')?.cat === 'clap', 'two files dropped on CLAP');
  const n = b.ingredients.items.length;
  drop(row('HAT'), [kick99]);
  await wait(() => named('Kick 99.wav')?.cat === 'hat', 'a loaded sample dropped on HAT moves there');
  check(b.ingredients.items.length === n, 'a duplicate is not loaded twice');
  b.app.undo();
  check(named('Kick 99.wav')?.cat === 'snare', 'undo puts the moved sample back (one step)');
  b.app.redo();
  check(named('Kick 99.wav')?.cat === 'hat', 'redo moves it again');

  // the sample list takes the selected instrument (HAT, after the last drop)
  drop(doc.querySelector('.samplelist')!, [await wav('Snare Big.wav', 400)]);
  await wait(() => named('Snare Big.wav')?.cat === 'hat', 'dropped on the HAT list');

  // not audio: skipped, nothing added
  const before = b.ingredients.items.length;
  drop(row('FX'), [new win.File(['hello'], 'notes.txt', { type: 'text/plain' })]);
  await wait(() => doc.querySelector('.mdialog'), 'the not-audio note');
  check(b.ingredients.items.length === before, 'a text file is not added');
  doc.querySelector<HTMLButtonElement>('.mdialog .mbutton.default')!.click();

  // dropped anywhere else: the name decides (a clap)
  drop(doc.querySelector('#screen')!, [await wav('Clap 07.wav', 1500)]);
  await wait(() => named('Clap 07.wav')?.cat === 'clap', 'a general drop suggests from the name');
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

  // ---------------------------------------------------------------- the KITS list (Phase 15): hover never selects, new kits appear selected
  await kitList(frame.contentDocument!, b);

  // ---------------------------------------------------------------- drop targets (Phase 15): dropped on an instrument, it goes there
  await dropTargets(frame.contentDocument!, b);
  frame.remove();
  return 'passed';
}
