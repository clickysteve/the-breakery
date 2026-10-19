/**
 * The Breakery: application entry. Builds the 1-bit screen (the Slop Factory look shared with
 * emmm), its menus and windows, keyboard commands and drag-and-drop, and connects them to the
 * App (state), the Ingredients (samples), the Player (live audio), MIDI (app/midi.ts) and
 * TAKEAWAY (export).
 */
import './ui/style.css';
import { IndexedDbSampleStore } from '@slopfactory/core/storage';
import { IndexedDbKitStore, installBundledKits, KitLibrary, type KitSession } from '@slopfactory/core/kits';
import { APP_ID, breakerySession, KIT_LIBRARY_DB, LEGACY_DB, migrateLegacy } from './app/kits';
import { BUNDLED_KITS } from './app/bundledKits';
import { App, BATCH_SIZE } from './app/app';
import { loadSwitchMode } from './app/switchMode';
import { MidiRig } from './app/midi';
import { Ingredients, SLOTS, type ImportEntry, type Slot } from './audio/ingredients';
import { audibleCategories, mixActive } from './app/mix';
import { entryLabel } from './app/seeds';
import { CATEGORY_LABEL } from './engine/types';
import { WILDCARD_CATEGORIES, WILDCARD_LABEL } from './engine/wildcard';
import { Player } from './audio/player';
import { loadNaming, saveNaming, buildFileName, type NamingPrefs } from './audio/exportName';
import { download, midiTakeaway, takeaway, type TakeawayOptions } from './audio/takeaway';
import { el, esc, setTip, view } from './ui/dom';
import { GemSelect } from './ui/gemSelect';
import { typing } from './ui/widgets';
import { alertDialog, closeDialog, confirmDialog, dialogOpen, openDialog } from './ui/dialogs';
import { isTransportKey } from './ui/transportKey';
import { bakeWindow } from './ui/bakeWindow';
import { ingredientsWindow } from './ui/ingredientsWindow';
import { patternWindow } from './ui/patternWindow';
import { recipeWindow } from './ui/recipeWindow';
import { installTooltips } from './ui/tooltip';
import { applyPalette } from '@slopfactory/core/palette';
import { paletteLibrary } from './ui/palette';
import { paletteWindow } from './ui/paletteWindow';
import { midiWindow } from './ui/midiWindow';
import { newPatchDialog, wildcardReportDialog } from './ui/patchDialogs';
import { isGmMapping } from './midi/routing';
import type { UiContext } from './ui/context';

const W = 880;
const H = 470;
const REPO = 'https://github.com/clickysteve/the-breakery';

// ------------------------------------------------------------------ palette (before anything is drawn)
const palettes = paletteLibrary();
applyPalette(palettes.config, palettes.selected.colors);

// ------------------------------------------------------------------ screen
const stage = el('div', '', document.body);
stage.id = 'stage';
const screen = el('div', '', stage);
screen.id = 'screen';
screen.style.width = W + 'px';
screen.style.height = H + 'px';
function fit(): void {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  view.scale = s;
  screen.style.transform = `scale(${s})`;
  screen.style.left = Math.max(0, Math.round((window.innerWidth - W * s) / 2)) + 'px';
  screen.style.top = Math.max(0, Math.round((window.innerHeight - H * s) / 2)) + 'px';
}
window.addEventListener('resize', fit);
fit();

// ------------------------------------------------------------------ model
let store: IndexedDbSampleStore | null = null;
let kitStore: IndexedDbKitStore | null = null;
try {
  store = typeof indexedDB !== 'undefined' ? new IndexedDbSampleStore('the-breakery') : null;
  kitStore = typeof indexedDB !== 'undefined' ? new IndexedDbKitStore(KIT_LIBRARY_DB) : null;
} catch {
  store = null;
}
// The kit library (Slop Factory Core): audio stays in `the-breakery`, kits and the sample index in
// their own database. Samples the current INGREDIENTS use are never deleted from it.
const library = new KitLibrary({ app: APP_ID, audio: store, store: kitStore, inUse: () => ingredients.items.filter((i) => i.source === 'user').map((i) => Ingredients.audioId(i)) });
const ingredients = new Ingredients(library);
const player = new Player(ingredients);
player.switchMode = loadSwitchMode();
await ingredients.restore().catch(() => ingredients.loadDemo());
const params = new URLSearchParams(location.search);
const app = new App(ingredients, player, params.get('seed') ?? undefined);
const midi = new MidiRig(app);

let kits: KitSession | null = null;
try {
  // kits saved by the first release move into the library (their old storage is left untouched)
  const legacy = typeof indexedDB !== 'undefined' ? new IndexedDbSampleStore(LEGACY_DB) : null;
  const notes = (await migrateLegacy(library, legacy, localStorage, ingredients.items)).flatMap((r) => [...(r.error ? [r.error] : []), ...r.problems]);
  await installBundledKits(library, BUNDLED_KITS);
  kits = breakerySession(app);
  const failed = await kits.restore();
  if (failed) app.status = `Kit restore failed: ${failed}`;
  else if (notes.length) app.status = `Some kits from the previous version could not be moved yet (they are kept and will be tried again): ${notes.join(' ')}`;
} catch (e) {
  app.status = `Kit restore failed: ${e instanceof Error ? e.message : String(e)}`;
}
window.addEventListener('beforeunload', e => { if (kits?.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ------------------------------------------------------------------ shell
const alertBox = (html: string) => void alertDialog(screen, html);

const slotLabel = (c: Slot) => (c === 'unsorted' ? 'UNSORTED' : CATEGORY_LABEL[c]);

/** Import files or folders, then show what was found and let the categories be corrected. */
async function importEntries(entries: ImportEntry[]): Promise<void> {
  if (!entries.length) return;
  app.say(`Reading ${entries.length} file${entries.length > 1 ? 's' : ''}…`);
  const r = await ingredients.importEntries(entries, (done, total) => app.say(`Loading samples… ${done} / ${total}`));
  const fromFolder = entries.some((e) => e.path.includes('/'));
  const parts = [`Added ${r.added.length} sample${r.added.length === 1 ? '' : 's'}.`];
  if (r.duplicates) parts.push(`${r.duplicates} already loaded.`);
  if (r.skipped.length) parts.push(`${r.skipped.length} not audio, skipped.`);
  if (r.errors.length) parts.push(`${r.errors.length} could not be read.`);
  app.say(parts.join(' ') + (r.added.length ? ' Check their categories in INGREDIENTS.' : ''));
  if (!r.added.length && !r.errors.length && !fromFolder) {
    if (r.skipped.length) alertBox('Those are not audio files. The Breakery takes WAV (and AIFF) one-shots.');
    return;
  }
  if (!fromFolder && r.added.length <= 3 && !r.errors.length && !r.skipped.length) return; // a few loose files: no review needed
  const counts = new Map<Slot, number>();
  for (const a of r.added) counts.set(a.cat, (counts.get(a.cat) ?? 0) + 1);
  const summary = SLOTS.filter((c) => counts.get(c)).map((c) => `${slotLabel(c)} ${counts.get(c)}`).join(' · ');
  const notes = [
    r.duplicates ? `${r.duplicates} already loaded (skipped)` : '',
    r.skipped.length ? `${r.skipped.length} not audio (skipped: ${esc(r.skipped.slice(0, 4).map((p) => p.split('/').pop()!).join(', '))}${r.skipped.length > 4 ? ' …' : ''})` : '',
    r.hidden ? `${r.hidden} hidden or system file${r.hidden > 1 ? 's' : ''} ignored` : '',
  ].filter(Boolean);
  await openDialog<boolean>(
    screen,
    `<b>IMPORT</b>: ${r.added.length} sample${r.added.length === 1 ? '' : 's'} added${summary ? `: ${summary}` : ''}.<br><span style="font-size:9px">Categories are suggested from folder and file names. Correct any below (or later in INGREDIENTS). UNSORTED samples are kept but not played until you assign them.${notes.length ? '<br>' + notes.join(' · ') : ''}</span>`,
    [{ label: 'Done', value: true, isDefault: true }],
    true,
    (box) => {
      const list = el('div', 'samplelist importlist', box);
      for (const a of [...r.added].sort((x, y) => (x.cat === 'unsorted' ? -1 : 0) - (y.cat === 'unsorted' ? -1 : 0) || x.path.localeCompare(y.path))) {
        const row = el('div', 'srow', list);
        const nm = el('span', 'sname', row, undefined, a.path || a.name);
        setTip(nm, `${a.path || a.name}: ${a.reason}`);
        const sel = new GemSelect(row, null, {
          label: `Category of ${a.name}`,
          options: SLOTS.map((c) => ({ value: c, label: slotLabel(c) })),
          value: a.cat,
          cls: 'srowsel',
          onChange: (v) => ingredients.setCategory(a.id, v as Slot),
        });
        setTip(sel.el, a.reason);
      }
      if (r.errors.length) {
        const er = el('div', '', box);
        er.style.cssText = 'font-size:9px;margin-top:6px;max-height:48px;overflow:auto';
        er.innerHTML = `Not added:<br>${r.errors.map((e) => esc(e)).join('<br>')}`;
      }
    },
    420,
  );
}

/** Files and folders dropped on the screen (folders read recursively where the browser allows). */
async function droppedEntries(dt: DataTransfer): Promise<ImportEntry[]> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const roots = items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
  if (!roots.some((e) => e?.isDirectory)) return [...dt.files].map((file) => ({ file, path: '' }));
  const out: ImportEntry[] = [];
  const fileOf = (e: FileSystemFileEntry) => new Promise<File>((res, rej) => e.file(res, rej));
  const readAll = async (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
    const reader = dir.createReader();
    const all: FileSystemEntry[] = [];
    // readEntries returns at most ~100 entries per call: read until empty
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) return all;
      all.push(...batch);
    }
  };
  const walk = async (e: FileSystemEntry, depth: number): Promise<void> => {
    if (out.length > 2000 || depth > 12) return;
    if (e.isFile) {
      try {
        out.push({ file: await fileOf(e as FileSystemFileEntry), path: e.fullPath.replace(/^\//, '') });
      } catch {
        /* unreadable: skipped */
      }
    } else if (e.isDirectory) for (const c of await readAll(e as FileSystemDirectoryEntry)) await walk(c, depth + 1);
  };
  for (const r of roots) if (r) await walk(r, 0);
  return out;
}

async function togglePlay(): Promise<void> {
  if (midi.external) midi.playExternal();
  else if (player.playing) player.stop();
  else if (!(await player.play(app.current))) alertBox('This browser did not start audio. Click again, or check that the page is allowed to play sound.');
  app.changed(false);
}

function doMidiTakeaway(): void {
  const map = midi.fileMapping();
  const mid = midiTakeaway(app.current, app.takeawayOpts.mix === 'audible' && mixActive(app.mix) ? audibleCategories(app.mix) : undefined, map, loadNaming());
  download(mid.name, mid.bytes, mid.type);
  app.say(`Took away ${mid.name} (${mid.notes} note${mid.notes === 1 ? '' : 's'}, ${app.current.recipe.bpm} BPM, ${isGmMapping(map) ? 'GM drums on channel 10' : 'channels and notes from the MIDI window'}).`);
}

async function doTakeaway(): Promise<void> {
  const naming: NamingPrefs = loadNaming();
  const o: TakeawayOptions = { ...app.takeawayOpts, mix: 'audible' };
  const r = app.current.recipe;
  const ok = await openDialog<boolean>(
    screen,
    `<b>TAKEAWAY</b>: render this break to a 44.1 kHz, 16-bit stereo WAV.<br><span style="font-size:9px">${r.bars} bar${r.bars > 1 ? 's' : ''} at ${r.bpm} BPM, exactly as it plays here. Rendered in your browser; nothing is uploaded.</span>`,
    [{ label: 'Cancel', value: false }, { label: 'Take away', value: true, isDefault: true }],
    false,
    (box) => {
      const row1 = el('div', 'row', box);
      for (const [v, text, tip] of [
        ['tail', 'BARS + TAIL', 'The bars, then the tail so the last hits ring out'],
        ['loop', 'SEAMLESS LOOP', 'Exactly the bars’ length; the tail is folded back onto the start so it loops cleanly in a sampler'],
      ] as const) {
        const l = el('label', '', row1);
        const i = el('input', '', l);
        i.type = 'radio';
        i.name = 'tmode';
        i.checked = o.mode === v;
        i.addEventListener('change', () => (o.mode = v));
        el('span', '', l, undefined, text);
        setTip(l, tip);
      }
      el('div', 'row', box, undefined, 'EXPORT NAME');
      const nameIn = el('input', '', el('div', 'row', box));
      nameIn.type = 'text';
      nameIn.value = naming.name;
      nameIn.maxLength = 80;
      nameIn.style.width = '100%';
      setTip(nameIn, 'The base name of every file. Spaces are fine; unsafe characters are removed. Remembered between visits.');
      const rowN = el('div', 'row', box);
      const preview = el('div', 'row', box);
      const refresh = (): void => {
        naming.name = nameIn.value;
        preview.textContent = `FILENAME: ${buildFileName(naming, app.current, o.stems ? 'stems' : o.mode === 'loop' ? 'loop' : '', o.stems ? 'zip' : 'wav')}`;
      };
      for (const [k, text] of [['recipe', 'RECIPE'], ['bpm', 'BPM'], ['seed', 'SEED']] as const) {
        const l = el('label', '', rowN);
        const c = el('input', '', l);
        c.type = 'checkbox';
        c.checked = naming[k];
        c.addEventListener('change', () => { naming[k] = c.checked; refresh(); });
        el('span', '', l, undefined, text);
        setTip(l, `Add the break's ${text} to the filenames`);
      }
      nameIn.addEventListener('input', refresh);
      refresh();
      el('div', 'row', box, undefined, 'Mix and stems follow channel level, pan, MUTE and SOLO.');
      const row2 = el('div', 'row', box);
      el('span', '', row2, undefined, 'Tail');
      new GemSelect(row2, null, {
        label: 'Tail length in seconds',
        options: [0.5, 1, 2, 4, 8].map((t) => ({ value: String(t), label: `${t} s` })),
        value: String(o.tailSeconds),
        cls: 'tailsel',
        onChange: (v) => (o.tailSeconds = Number(v)),
      });
      const l = el('label', '', row2);
      const cb = el('input', '', l);
      cb.type = 'checkbox';
      cb.checked = o.stems;
      cb.addEventListener('change', () => (o.stems = cb.checked));
      el('span', '', l, undefined, '+ STEMS (ZIP)');
      cb.addEventListener('change', refresh);
      for (const r of row1.querySelectorAll('input')) r.addEventListener('change', refresh);
      setTip(l, 'Also one aligned stereo WAV per drum category in a ZIP. DRY STEMS bypasses master gain.');
      const dryLabel = el('label', '', el('div', 'row', box));
      const dry = el('input', '', dryLabel); dry.type = 'checkbox'; dry.checked = o.dryStems ?? true;
      dry.addEventListener('change', () => o.dryStems = dry.checked);
      el('span', '', dryLabel, undefined, 'DRY STEMS (bypass master gain)');
      setTip(dryLabel, 'Channel gain, pan and mute/solo are preserved. All category stems have identical lengths, including silent channels.');
      const lm = el('label', '', row2);
      const cm = el('input', '', lm);
      cm.type = 'checkbox';
      cm.checked = o.midi;
      cm.addEventListener('change', () => (o.midi = cm.checked));
      el('span', '', lm, undefined, '+ MIDI');
      setTip(lm, 'Also a MIDI file of the break (General MIDI drums on channel 10, or the channels and notes set in the MIDI window; swing, microtiming and rolls kept), in the ZIP with stems or as a second download');
    },
    320,
  );
  if (!ok) return;
  saveNaming(naming);
  o.naming = naming;
  app.takeawayOpts = { ...o, naming: undefined };
  app.save();
  app.say('Rendering…');
  try {
    const only = o.mix === 'audible' ? audibleCategories(app.mix) : undefined;
    const map = midi.fileMapping();
    const res = await takeaway(app.current, ingredients, o, player.level, (f) => app.say(`Rendering… ${Math.round(f * 100)}%`), only, app.mix, map, app.output.config);
    download(res.name, res.bytes, res.type);
    if (o.midi && !o.stems) {
      const mid = midiTakeaway(app.current, only, map, naming);
      download(mid.name, mid.bytes, mid.type);
    }
    app.say(`Took away ${res.name}${o.midi && !o.stems ? ' and its MIDI file' : ''} (${res.seconds.toFixed(2)} s, peak ${res.peakDb.toFixed(1)} dBFS${res.reducedDb > 0 ? `, turned down ${res.reducedDb.toFixed(1)} dB to avoid clipping` : ''}${res.stemReducedDb > 0 ? `, stems turned down ${res.stemReducedDb.toFixed(1)} dB (shared safety attenuation)` : ''}${res.outputSkipped ? '; OUTPUT could not run in this browser, so the master is unprocessed' : ''}).`);
  } catch (e) {
    app.say('TAKEAWAY failed.');
    alertBox(`The render failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

(window as unknown as { breakery: unknown }).breakery = { app, ingredients, player, midi, takeaway, importEntries, palettes, kits, library }; // for debugging and automation

const ui: UiContext = {
  app,
  kits,
  screen,
  alert: alertBox,
  confirm: (html, ok) => confirmDialog(screen, html, ok),
  importEntries,
  takeaway: () => void doTakeaway(),
  togglePlay: () => void togglePlay(),
};

/**
 * NEW PATCH: asks first only when the patch has changes (or when the default kit was asked for).
 * Without KEEP CURRENT KIT a new unsaved kit gets the demo sounds: nothing is deleted.
 */
async function newPatch(defaultKit = false): Promise<void> {
  const choice = await newPatchDialog(screen, app.patchDirty, !defaultKit, defaultKit);
  if (!choice) return;
  if (!choice.keepKit) {
    try {
      if (kits) await kits.newKit();
      else ingredients.replaceKit([]);
      ingredients.loadDemo();
    } catch (e) {
      alertBox(`The default kit could not be loaded: ${e instanceof Error ? esc(e.message) : esc(String(e))}. The patch was not reset.`);
      return;
    }
  }
  app.newPatch({ keepKit: choice.keepKit });
}

function showWildcardReport(): void {
  if (app.wildcardReport) void wildcardReportDialog(screen, app.wildcardReport);
  else app.say('No WILDCARD report yet: press WILDCARD (W). The report stays until the next WILDCARD or NEW PATCH.');
}

// ------------------------------------------------------------------ windows
const desk = el('div', '', screen, [0, 0, W, H]);
desk.style.position = 'absolute';
const wIng = ingredientsWindow(desk, ui, { x: 5, y: 21, w: 208, h: 444 });
const wRecipe = recipeWindow(desk, ui, { x: 218, y: 21, w: 482, h: 162 });
const wBake = bakeWindow(desk, ui, { x: 705, y: 21, w: 170, h: 162 });
const wPattern = patternWindow(desk, ui, { x: 218, y: 188, w: 657, h: 277 });
const wPalette = paletteWindow(desk, palettes, { x: 288, y: 60 });
const wMidi = midiWindow(desk, ui, midi, { x: 222, y: 40 });

// ------------------------------------------------------------------ menus
interface MenuItem {
  label?: string;
  key?: string;
  action?: () => void;
  checked?: () => boolean;
  sep?: boolean;
}
async function about(): Promise<void> {
  alertBox(
    `<b>THE BREAKERY</b> · freshly baked breaks.<br><br>A generative breakbeat instrument from the Slop Factory. Bring one-shot samples (INGREDIENTS), set a RECIPE, BAKE: The Breakery composes an original drum performance of one to eight bars, built as a phrase (groove, answer, development, fills, turnaround) with musically related kicks, snares, ghost notes, hats, tom fills and rolls, and a coherent feel. Eleven recipes, from FUNK to BREAKCORE. Then edit any hit by hand in the PATTERN (⌘Z undoes). TAKEAWAY renders it to WAV for your sampler, or to a MIDI file for your drum machine or DAW. MIDI plays it out live to your hardware, plays the samples from your pads or sequencer, and follows an external clock (MIDI ▸ MIDI Settings…). Colours: BREAKERY ▸ Palette…<br><br>Everything runs in your browser. Samples never leave it. No accounts, no tracking.<br><br><a href="${REPO}" target="_blank" rel="noopener">${REPO.replace('https://', '')}</a> · <a href="${REPO}/blob/main/docs/BREAKBEAT_RESEARCH.md" target="_blank" rel="noopener">research notes</a>`,
  );
}
function keysHelp(): void {
  alertBox(
    '<b>Keys</b><br><br>Space: play / stop (EXTERNAL MIDI clock: stop, or rejoin a running clock)<br>B: BAKE · W: WILDCARD (what it may change: the Wildcard menu) · N: BATCH (8 candidates) · 1–8: audition a candidate<br>D: DICE (a new named seed) · U: MUTATE (as set in RECIPE ▸ MUTATE) · S: save / remove favourite<br>← →: back / forward through the seed history<br>T: TAKEAWAY · M: MIDI file · L: loop on / off<br>R: freeze rhythm · F: freeze beat · G: detail · H: feel · K: samples · E: edits<br>X: REGEN TRACK (click a track name in the PATTERN to select it; shift-click for several)<br><br><b>Editing the PATTERN</b>: click an empty place to add a hit (on the SNAP grid); click a hit to delete it; shift+click a hit to select it for editing; drag a hit sideways to move it; drag from an empty place to paint; right-click a hit (or DEL) to delete it. A roll drawn as one group (ROLL ×N): click to expand it, right-click to delete it.<br>With a hit selected: Delete / Backspace deletes it · ← → move it a SNAP step (Shift: a beat) · ↑ ↓ velocity · Escape deselects. PITCH, REV and RATCHET are in the strip under the grid.<br>⌘Z undo · ⇧⌘Z (or ⌘Y) redo.<br><br><b>Numbers</b>: click a number (BPM, BARS, SEED, a weight), type, Return. Escape cancels; ↑ ↓ step (Shift: by 10); drag up/down to sweep. Range bars: click or drag; double-click (or Return) to type a value.<br><br><b>SOLO / MUTE</b>: S and M beside each row of the PATTERN, or the MIXER tab (with level, pan and meters).',
  );
}
const MENUS: { title: string; cls?: string; items: () => MenuItem[] }[] = [
  {
    title: 'BREAKERY',
    cls: 'logo',
    items: () => [
      { label: 'About The Breakery…', action: () => void about() },
      { label: 'Keys…', action: keysHelp },
      { label: 'Palette…', checked: () => wPalette.win.open, action: () => wPalette.toggle() },
      { sep: true },
      { label: 'Research Notes ↗', action: () => window.open(`${REPO}/blob/main/docs/BREAKBEAT_RESEARCH.md`, '_blank', 'noopener') },
    ],
  },
  {
    title: 'File',
    items: () => [
      { label: 'New Patch…', key: '⌘N', action: () => void newPatch() },
      { label: 'New Patch with Default Kit…', action: () => void newPatch(true) },
      { label: 'Clear Pattern', action: () => app.clearPattern() },
      { label: 'Reset Controls', action: () => app.resetControls() },
      { sep: true },
      { label: 'Load Samples…', action: () => (document.querySelector('input[type=file]:not([webkitdirectory])') as HTMLInputElement | null)?.click() },
      { label: 'Load Folder…', action: () => (document.querySelector('input[type=file][webkitdirectory]') as HTMLInputElement | null)?.click() },
      { label: 'Add Demo Kit', action: () => ingredients.loadDemo() },
      { label: 'Clear Ingredients…', action: () => void confirmDialog(screen, 'Remove all ingredients?', 'Remove').then((ok) => ok && ingredients.clear()) },
      { sep: true },
      { label: 'Takeaway (Export WAV)…', key: 'T', action: () => void doTakeaway() },
      { label: 'Takeaway MIDI File', key: 'M', action: doMidiTakeaway },
    ],
  },
  {
    title: 'Edit',
    items: () => [
      { label: 'Undo', key: '⌘Z', action: () => app.undo() },
      { label: 'Redo', key: '⇧⌘Z', action: () => app.redo() },
      { sep: true },
      { label: 'Delete Hit', key: 'Del', action: () => app.deleteHit() },
      { label: 'Duplicate Hit', action: () => app.duplicateHit() },
      { label: 'Revert Hit to Generated', action: () => app.revertHit() },
      { label: 'Select None', key: 'Esc', action: () => app.select(null) },
      { sep: true },
      { label: 'Clear All Hand Edits', action: () => app.revertAll() },
      { label: 'Freeze Edits (keep on new breaks)', key: 'E', checked: () => app.keepEdits, action: () => app.toggleKeepEdits() },
    ],
  },
  {
    title: 'Bake',
    items: () => [
      { label: 'Bake', key: 'B', action: () => app.bake() },
      { label: 'Batch of 8', key: 'N', action: () => app.bakeBatch() },
      { label: 'Wildcard', key: 'W', action: () => app.wildcard() },
      { sep: true },
      { label: 'Tempo Lock', checked: () => app.tempoLock, action: () => app.setTempoLock(!app.tempoLock) },
      { label: app.tempoLock ? 'Dice Tempo (unlock first)' : 'Dice Tempo', action: () => void app.diceTempo() },
      { sep: true },
      { label: player.playing ? 'Stop' : 'Play', key: 'Space', action: () => void togglePlay() },
      { label: 'Loop', key: 'L', checked: () => player.loop, action: () => ((player.loop = !player.loop), app.changed()) },
      { sep: true },
      { label: 'Reset Recipe', action: () => app.resetRecipe() },
      { label: 'CHOP', checked: () => app.chop.on, action: () => app.setChop({ on: !app.chop.on }) },
      { label: 'Re-CHOP', action: () => app.reChop() },
      { label: 'DESTROY', checked: () => app.destroy2.on, action: () => app.setDestroy2({ on: !app.destroy2.on }) },
      { label: 'Re-DESTROY', action: () => app.reDestroy() },
      { label: 'Dice Break DNA', action: () => app.diceDna() },
      { label: 'Dice Roll Expression', action: () => app.diceRolls() },
      { label: app.trackSel.length ? `Regen Track (${app.trackSel.length})` : 'Regen Track (select a track name)', key: 'X', action: () => app.regenTracks() },
      ...(app.legacy ? [{ label: 'Use Current GROOVE', action: () => app.useCurrentGroove() }] : []),
      { sep: true },
      { label: 'Clear Solo / Mute', action: () => app.clearMix() },
    ],
  },
  {
    // WILDCARD's settings: which categories one press may change (saved in this browser)
    title: 'Wildcard',
    items: () => [
      { label: 'Wildcard', key: 'W', action: () => app.wildcard() },
      { label: app.wildcardReport ? 'Wildcard Report…' : 'Wildcard Report (none yet)', action: showWildcardReport },
      { sep: true },
      ...WILDCARD_CATEGORIES.map((c) => ({ label: WILDCARD_LABEL[c], checked: () => app.wildcardSettings[c], action: () => app.setWildcard(c, !app.wildcardSettings[c]) })),
      { sep: true },
      { label: 'Restore Defaults', action: () => app.resetWildcard() },
    ],
  },
  {
    title: 'MIDI',
    items: () => [
      { label: 'MIDI Settings…', checked: () => wMidi.win.open, action: () => wMidi.toggle() },
      { label: midi.ready ? 'Turn MIDI Off' : 'Turn MIDI On', action: () => (midi.ready ? midi.disable() : void midi.enable()) },
      { sep: true },
      { label: 'Internal Clock', checked: () => midi.settings.clock === 'internal', action: () => midi.setClock('internal') },
      { label: 'External MIDI Clock', checked: () => midi.settings.clock === 'external', action: () => midi.setClock('external') },
      { sep: true },
      { label: 'Panic (All Notes Off)', action: () => midi.panic() },
      { label: 'Takeaway MIDI File', key: 'M', action: doMidiTakeaway },
    ],
  },
  {
    title: 'Seeds',
    items: () => [
      { label: 'Dice', key: 'D', action: () => app.dice() },
      { label: 'Mutate', key: 'U', action: () => app.mutate() },
      { label: 'Back', key: '←', action: () => app.historyBack() },
      { label: 'Forward', key: '→', action: () => app.historyForward() },
      { label: app.isFavourite ? 'Remove from Favourites' : 'Add to Favourites', key: 'S', action: () => app.toggleFavourite() },
      { sep: true },
      ...(app.favourites.length
        ? app.favourites.slice(0, 14).map((f) => ({ label: `★ ${entryLabel(f)}`, action: () => app.loadFavourite(f.id) }))
        : [{ label: '(no favourites yet: FAV saves one)' }]),
      ...(app.favourites.length > 14 ? [{ label: `… ${app.favourites.length - 14} more (Seeds ▸ Favourites…)` }] : []),
      ...(app.favourites.length ? [{ label: 'Favourites…', action: () => void favouritesDialog() }] : []),
      { sep: true },
      ...app.history.entries
        .map((e, i) => ({ e, i }))
        .slice(-10)
        .reverse()
        .map(({ e, i }) => ({ label: `${i === app.history.index ? '› ' : '  '}${entryLabel(e)}`, action: () => app.historyGo(i) })),
    ],
  },
];

/** All favourites, to load or remove. */
async function favouritesDialog(): Promise<void> {
  await openDialog<boolean>(
    screen,
    `<b>FAVOURITES</b> (${app.favourites.length}): saved in this browser with their recipe, seeds, mutations and sample settings. Click one to load it.`,
    [{ label: 'Done', value: true, isDefault: true }],
    true,
    (box) => {
      const list = el('div', 'samplelist importlist', box);
      const draw = () => {
        list.replaceChildren();
        for (const f of app.favourites) {
          const row = el('div', 'srow', list);
          const nm = el('span', 'sname', row, undefined, entryLabel(f));
          nm.style.cursor = 'pointer';
          setTip(nm, `Load ${entryLabel(f)} (saved ${new Date(f.savedAt).toLocaleString()})`);
          nm.addEventListener('click', () => app.loadFavourite(f.id));
          const x = el('span', 'ibtn', row, undefined, '×');
          setTip(x, 'Remove this favourite');
          x.addEventListener('click', () => {
            app.removeFavourite(f.id);
            draw();
          });
        }
      };
      draw();
    },
    360,
  );
}
const menubar = el('div', '', screen);
menubar.id = 'menubar';
let openMenu: { el: HTMLDivElement; drop: HTMLDivElement } | null = null;
function closeMenu(): void {
  if (!openMenu) return;
  openMenu.el.classList.remove('open');
  openMenu.drop.remove();
  openMenu = null;
}
for (const m of MENUS) {
  const me = el('div', 'menu ' + (m.cls ?? ''), menubar, undefined, m.title);
  const show = () => {
    closeMenu();
    me.classList.add('open');
    const drop = el('div', 'dropdown', me);
    drop.setAttribute('role', 'menu');
    drop.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const it of m.items()) {
      if (it.sep) {
        el('div', 'sep', drop);
        continue;
      }
      const d = el('div', 'item' + (it.checked?.() ? ' checked' : ''), drop);
      d.setAttribute('role', 'menuitem');
      el('span', '', d, undefined, it.label);
      if (it.key) el('span', 'key', d, undefined, it.key);
      d.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        closeMenu();
        it.action?.();
      });
    }
    openMenu = { el: me, drop };
  };
  me.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (openMenu?.el === me) closeMenu();
    else show();
  });
  me.addEventListener('pointerenter', () => openMenu && openMenu.el !== me && show());
}
const statusEl = el('div', 'status', menubar);
statusEl.setAttribute('role', 'status');
// the WILDCARD status line opens its report
statusEl.addEventListener('pointerdown', (e) => {
  if (!statusEl.classList.contains('report')) return;
  e.stopPropagation();
  closeMenu();
  showWildcardReport();
});
window.addEventListener('pointerdown', () => closeMenu());
installTooltips(screen, () => view.scale);

// ------------------------------------------------------------------ keyboard
// Group pointer sweeps of existing number/range controls and grid edits into one action.
window.addEventListener('pointerdown', () => app.beginGesture(), true);
for (const event of ['pointerup', 'pointercancel']) {
  // Finish after target handlers have applied the final pointer value, even if propagation stops.
  window.addEventListener(event, () => setTimeout(() => app.endGesture(), 0), true);
}
// A run of wheel ticks or arrow presses on one slider or number box is one undo step too: it ends
// when the control has been left alone for a moment (or at the next undo, which ends it first)
let settle: number | undefined;
const SLIDERS = '.range, .num, [role="slider"], [role="spinbutton"]';
function coalesce(): void {
  app.beginGesture();
  window.clearTimeout(settle);
  settle = window.setTimeout(() => app.endGesture(), 600);
}
window.addEventListener('wheel', (e) => (e.target as HTMLElement).closest?.(SLIDERS) && coalesce(), { capture: true, passive: true });
window.addEventListener(
  'keydown',
  (e) => {
    if (!e.metaKey && !e.ctrlKey && !typing.active && /^(Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home|End)$/.test(e.key) && (e.target as HTMLElement).closest?.(SLIDERS)) coalesce();
  },
  true,
);
window.addEventListener('keydown', (e) => {
  if (dialogOpen()) {
    if (e.key === 'Escape') closeDialog();
    return;
  }
  const t = e.target as HTMLElement;
  // Space toggles playback from any non-text control (buttons, tabs, sliders, checkboxes, empty areas); a held key is ignored
  if (e.key === ' ' || e.code === 'Space') {
    if (isTransportKey(e)) {
      e.preventDefault();
      if (!e.repeat) void togglePlay();
    }
    return;
  }
  if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
  const k = e.key.toLowerCase();
  // NEW PATCH (⌘N / Ctrl+N), where the browser lets a page have the key (Chrome keeps it for a new window: use File ▸ New Patch)
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && k === 'n') {
    e.preventDefault();
    void newPatch();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (k === 'z' || k === 'y')) {
    // undo / redo everywhere except while a value is being typed (a number box being typed into keeps its own keys);
    // a range bar or box that merely has focus (after a drag) no longer swallows ⌘Z
    if (typing.active || t.closest?.('.num.editing, [contenteditable="true"]')) return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) app.redo();
    else app.undo();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  // a focused number box, range bar or other entry control keeps Delete, Backspace and the arrows for itself
  const sel = t.closest?.('.num, .range, [role="slider"], [role="spinbutton"], [role="textbox"]') ? undefined : app.selectedEvent;
  if (sel && (e.key === 'Delete' || e.key === 'Backspace')) app.deleteHit();
  else if (sel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (t === document.body || t.classList.contains('btn') || t.closest('.patternsvg'))) app.nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 48 : app.snap));
  else if (sel && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && (t === document.body || t.classList.contains('btn'))) app.setHitVelocity(sel.vel + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 1 : 5));
  else if (e.key === 'Escape' && sel) {
    closeMenu();
    app.select(null);
  } else if (k === 'b') app.bake();
  else if (k === 'n') app.bakeBatch();
  else if (k === 't') void doTakeaway();
  else if (k === 'm') doMidiTakeaway();
  else if (k === 'l') {
    player.loop = !player.loop;
    app.changed();
  } else if (k === 'f') app.toggleFreeze('beat');
  else if (k === 'g') app.toggleFreeze('detail');
  else if (k === 'h') app.toggleFreeze('feel');
  else if (k === 'k') app.toggleFreeze('kit');
  else if (k === 'e') app.toggleKeepEdits();
  else if (k === 'x') app.regenTracks();
  else if (k === 'w') app.wildcard();
  else if (e.key === 'ArrowRight' && (t === document.body || t.classList.contains('btn'))) app.historyForward();
  else if (e.key === 'ArrowLeft' && (t === document.body || t.classList.contains('btn'))) app.historyBack();
  else if (n >= 1 && n <= BATCH_SIZE) app.pick(n - 1);
  else if (e.key === 'Escape') closeMenu();
  else return;
  e.preventDefault();
});

// ------------------------------------------------------------------ drag and drop
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  screen.classList.add('dropping');
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) screen.classList.remove('dropping');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  screen.classList.remove('dropping');
  const dt = e.dataTransfer;
  if (dt) void droppedEntries(dt).then((entries) => importEntries(entries));
});

// ------------------------------------------------------------------ redraw
function updateAll(): void {
  wIng.update();
  wRecipe.update();
  wBake.update();
  wPattern.update();
  if (wMidi.win.open) wMidi.update();
  statusEl.textContent = app.status || 'Freshly baked breaks.';
  // the WILDCARD headline opens its report (click); the tooltip has the whole line
  const isReport = !!app.wildcardReport && app.status.startsWith(app.wildcardReport.headline);
  statusEl.classList.toggle('report', isReport);
  setTip(statusEl, isReport ? `${app.status} (click for the WILDCARD REPORT)` : app.status);
}
app.onChange(updateAll);
ingredients.onChange = () => {
  // a change of samples re-assigns them (same seeds, same rhythm)
  app.rebake();
};
player.onState = () => updateAll();
updateAll();

function frame(): void {
  wBake.tick();
  wPattern.tick();
  wMidi.tick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
