/**
 * The Breakery: application entry. Builds the 1-bit screen (the Slop Factory look shared with
 * emmm), its menus and windows, keyboard commands and drag-and-drop, and connects them to the
 * App (state), the Ingredients (samples), the Player (live audio) and TAKEAWAY (export).
 */
import './ui/style.css';
import { IndexedDbSampleStore } from '@slopfactory/core/storage';
import { App, BATCH_SIZE } from './app/app';
import { Ingredients } from './audio/ingredients';
import { Player } from './audio/player';
import { download, midiTakeaway, takeaway, type TakeawayOptions } from './audio/takeaway';
import { el, setTip, view } from './ui/dom';
import { alertDialog, closeDialog, confirmDialog, dialogOpen, openDialog } from './ui/dialogs';
import { bakeWindow } from './ui/bakeWindow';
import { batchWindow } from './ui/batchWindow';
import { ingredientsWindow } from './ui/ingredientsWindow';
import { patternWindow } from './ui/patternWindow';
import { recipeWindow } from './ui/recipeWindow';
import { installTooltips } from './ui/tooltip';
import type { UiContext } from './ui/context';

const W = 720;
const H = 470;
const REPO = 'https://github.com/clickysteve/the-breakery';

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
try {
  store = typeof indexedDB !== 'undefined' ? new IndexedDbSampleStore('the-breakery') : null;
} catch {
  store = null;
}
const ingredients = new Ingredients(store);
const player = new Player(ingredients);
await ingredients.restore().catch(() => ingredients.loadDemo());
const params = new URLSearchParams(location.search);
const seedParam = params.has('seed') ? Number(params.get('seed')) : undefined;
const app = new App(ingredients, player, seedParam !== undefined && !Number.isNaN(seedParam) ? seedParam : undefined);
(window as unknown as { breakery: unknown }).breakery = { app, ingredients, player, takeaway }; // for debugging and automation

// ------------------------------------------------------------------ shell
const alertBox = (html: string) => void alertDialog(screen, html);

async function importFiles(files: File[]): Promise<void> {
  const audio = files.filter((f) => /\.(wav|wave|aif|aiff|flac|mp3|ogg|m4a)$/i.test(f.name) || f.type.startsWith('audio/'));
  if (!audio.length) {
    alertBox('Those are not audio files. The Breakery takes WAV (and AIFF) one-shots.');
    return;
  }
  app.say(`Loading ${audio.length} sample${audio.length > 1 ? 's' : ''}…`);
  const { added, errors } = await ingredients.importFiles(audio);
  app.say(`Added ${added} sample${added === 1 ? '' : 's'}.${errors.length ? ` ${errors.length} could not be added.` : ''} Check their categories in INGREDIENTS.`);
  if (errors.length) alertBox(`Some files were not added:<br><br>${errors.map((e) => e.replace(/</g, '&lt;')).join('<br>')}`);
}

async function togglePlay(): Promise<void> {
  if (player.playing) player.stop();
  else if (!(await player.play(app.current))) alertBox('This browser did not start audio. Click again, or check that the page is allowed to play sound.');
  app.changed(false);
}

function doMidiTakeaway(): void {
  const mid = midiTakeaway(app.current);
  download(mid.name, mid.bytes, mid.type);
  app.say(`Took away ${mid.name} (${mid.notes} note${mid.notes === 1 ? '' : 's'}, ${app.current.recipe.bpm} BPM, GM drums on channel 10).`);
}

async function doTakeaway(): Promise<void> {
  const o: TakeawayOptions = { ...app.takeawayOpts };
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
      const row2 = el('div', 'row', box);
      el('span', '', row2, undefined, 'Tail');
      const sel = el('select', 'mselect', row2);
      for (const t of [0.5, 1, 2, 4, 8]) {
        const op = el('option', '', sel, undefined, `${t} s`);
        op.value = String(t);
        op.selected = t === o.tailSeconds;
      }
      sel.addEventListener('change', () => (o.tailSeconds = Number(sel.value)));
      const l = el('label', '', row2);
      const cb = el('input', '', l);
      cb.type = 'checkbox';
      cb.checked = o.stems;
      cb.addEventListener('change', () => (o.stems = cb.checked));
      el('span', '', l, undefined, '+ STEMS (ZIP)');
      setTip(l, 'Also one WAV per drum category, the same length and gain as the mix, in a ZIP');
      const lm = el('label', '', row2);
      const cm = el('input', '', lm);
      cm.type = 'checkbox';
      cm.checked = o.midi;
      cm.addEventListener('change', () => (o.midi = cm.checked));
      el('span', '', lm, undefined, '+ MIDI');
      setTip(lm, 'Also a MIDI file of the break (General MIDI drums, channel 10, swing and microtiming kept), in the ZIP with stems or as a second download');
    },
    320,
  );
  if (!ok) return;
  app.takeawayOpts = o;
  app.save();
  app.say('Rendering…');
  try {
    const res = await takeaway(app.current, ingredients, o, player.level, (f) => app.say(`Rendering… ${Math.round(f * 100)}%`));
    download(res.name, res.bytes, res.type);
    if (o.midi && !o.stems) {
      const mid = midiTakeaway(app.current);
      download(mid.name, mid.bytes, mid.type);
    }
    app.say(`Took away ${res.name}${o.midi && !o.stems ? ' and its MIDI file' : ''} (${res.seconds.toFixed(2)} s, peak ${res.peakDb.toFixed(1)} dBFS${res.reducedDb > 0 ? `, turned down ${res.reducedDb.toFixed(1)} dB to avoid clipping` : ''}).`);
  } catch (e) {
    app.say('TAKEAWAY failed.');
    alertBox(`The render failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const ui: UiContext = {
  app,
  screen,
  alert: alertBox,
  confirm: (html, ok) => confirmDialog(screen, html, ok),
  importFiles,
  takeaway: () => void doTakeaway(),
  togglePlay: () => void togglePlay(),
};

// ------------------------------------------------------------------ windows
const desk = el('div', '', screen, [0, 0, W, H]);
desk.style.position = 'absolute';
const wIng = ingredientsWindow(desk, ui, { x: 5, y: 21, w: 208, h: 444 });
const wRecipe = recipeWindow(desk, ui, { x: 218, y: 21, w: 322, h: 152 });
const wBake = bakeWindow(desk, ui, { x: 545, y: 21, w: 170, h: 152 });
const wPattern = patternWindow(desk, ui, { x: 218, y: 178, w: 497, h: 196 });
const wBatch = batchWindow(desk, ui, { x: 218, y: 379, w: 497, h: 86 });

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
    `<b>THE BREAKERY</b> · freshly baked breaks.<br><br>A generative breakbeat instrument from the Slop Factory. Bring one-shot samples (INGREDIENTS), set a RECIPE, BAKE: The Breakery composes an original two-bar (or one- or four-bar) drum performance with musically related kicks, snares, ghost notes and hats, a coherent feel, and a turnaround. TAKEAWAY renders it to WAV for your sampler, or to a MIDI file for your drum machine or DAW.<br><br>Everything runs in your browser. Samples never leave it. No accounts, no tracking.<br><br><a href="${REPO}" target="_blank" rel="noopener">${REPO.replace('https://', '')}</a> · <a href="${REPO}/blob/main/docs/BREAKBEAT_RESEARCH.md" target="_blank" rel="noopener">research notes</a>`,
  );
}
function keysHelp(): void {
  alertBox(
    '<b>Keys</b><br><br>Space: play / stop<br>B: BAKE<br>N: BATCH (8 candidates)<br>1–8: audition a candidate<br>T: TAKEAWAY<br>M: MIDI file<br>L: loop on / off<br>F: freeze beat · G: detail · H: feel · K: kit<br>← →: previous / next seed<br><br>Drag number boxes up/down; drag or click range bars; arrow keys nudge the focused control.',
  );
}
const MENUS: { title: string; cls?: string; items: () => MenuItem[] }[] = [
  {
    title: 'BREAKERY',
    cls: 'logo',
    items: () => [{ label: 'About The Breakery…', action: () => void about() }, { label: 'Keys…', action: keysHelp }, { sep: true }, { label: 'Research Notes ↗', action: () => window.open(`${REPO}/blob/main/docs/BREAKBEAT_RESEARCH.md`, '_blank', 'noopener') }],
  },
  {
    title: 'File',
    items: () => [
      { label: 'Load Samples…', action: () => (document.querySelector('input[type=file]') as HTMLInputElement | null)?.click() },
      { label: 'Add Demo Kit', action: () => ingredients.loadDemo() },
      { label: 'Clear Ingredients…', action: () => void confirmDialog(screen, 'Remove all ingredients?', 'Remove').then((ok) => ok && ingredients.clear()) },
      { sep: true },
      { label: 'Takeaway (Export WAV)…', key: 'T', action: () => void doTakeaway() },
      { label: 'Takeaway MIDI File', key: 'M', action: doMidiTakeaway },
    ],
  },
  {
    title: 'Bake',
    items: () => [
      { label: 'Bake', key: 'B', action: () => app.bake() },
      { label: 'Batch of 8', key: 'N', action: () => app.bakeBatch() },
      { sep: true },
      { label: player.playing ? 'Stop' : 'Play', key: 'Space', action: () => void togglePlay() },
      { label: 'Loop', key: 'L', checked: () => player.loop, action: () => ((player.loop = !player.loop), app.changed()) },
      { sep: true },
      { label: 'Reset Recipe', action: () => app.resetRecipe() },
    ],
  },
];
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
window.addEventListener('pointerdown', () => closeMenu());
installTooltips(screen, () => view.scale);

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
  if (dialogOpen()) {
    if (e.key === 'Escape') closeDialog();
    return;
  }
  const t = e.target as HTMLElement;
  if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const n = Number(e.key);
  if (e.key === ' ') void togglePlay();
  else if (k === 'b') app.bake();
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
  else if (e.key === 'ArrowRight' && t === document.body) app.setSeed(app.seeds.beat + 1);
  else if (e.key === 'ArrowLeft' && t === document.body) app.setSeed(Math.max(0, app.seeds.beat - 1));
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
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length) void importFiles(files);
});

// ------------------------------------------------------------------ redraw
function updateAll(): void {
  wIng.update();
  wRecipe.update();
  wBake.update();
  wPattern.update();
  wBatch.update();
  statusEl.textContent = app.status || 'Freshly baked breaks.';
  setTip(statusEl, app.status);
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
