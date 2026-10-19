/**
 * INGREDIENTS: categories with their sample counts and status (missing / using a fallback), the
 * samples of the selected category (preview, reassign, remove), how the category PICKS among
 * them (sample-selection mode, with its settings beside each sample), and loading files or
 * whole folders.
 */
import { kitsPanel } from './kitsPanel';
import { libraryPanel } from './libraryPanel';
import { SLOTS, type ImportEntry, type Slot } from '../audio/ingredients';
import { sourceOf } from '../engine/kit';
import { modeOf, SAMPLE_MODE_LABEL, SAMPLE_MODE_TIP, SAMPLE_MODES, sampleUsage, type SampleMode } from '../engine/samples';
import { CATEGORY_LABEL, type Category } from '../engine/types';
import { el, setTip } from './dom';
import { GemSelect } from './gemSelect';
import { Button, MWindow, NumBox, typing } from './widgets';
import type { UiContext } from './context';

const slotLabel = (s: Slot) => (s === 'unsorted' ? 'UNSORTED' : CATEGORY_LABEL[s]);
const ESSENTIAL: Category[] = ['kick', 'snare'];

export function ingredientsWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const ing = app.ingredients;
  const win = new MWindow(parent, { title: 'INGREDIENTS', tabs: ['INGREDIENTS', 'KITS', 'LIBRARY'], ...rect, onTab: () => (kp?.update(), lp.update()) });
  const [b, kitBody, libBody] = win.panes as [HTMLDivElement, HTMLDivElement, HTMLDivElement];
  const kp = ui.kits ? kitsPanel(kitBody, ui, ui.kits) : null;
  if (!kp) el('div', 'empty-note', kitBody, [8, 8, rect.w - 18], 'Kit storage unavailable. Reload to retry.');
  const W = rect.w - 2;
  let selected: Slot = 'kick';
  const lp = libraryPanel(libBody, ui, () => selected, () => file.click());

  const rows = new Map<Slot, { row: HTMLDivElement; count: HTMLSpanElement; stat: HTMLSpanElement }>();
  SLOTS.forEach((slot, i) => {
    const row = el('div', 'catrow', b, [0, 2 + i * 15, W]);
    row.setAttribute('role', 'button');
    el('span', 'cname', row, undefined, slotLabel(slot));
    const count = el('span', 'ccount', row);
    const stat = el('span', 'cstat', row);
    const play = el('span', 'ibtn', row, undefined, '▶');
    Object.assign(play.style, { width: '13px', height: '11px', border: '1px solid currentColor', fontSize: '7px', lineHeight: '10px', textAlign: 'center', marginRight: '4px' });
    setTip(play, `Preview the ${slotLabel(slot)} sample the current break uses`);
    play.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (slot === 'unsorted') {
        const first = ing.inSlot('unsorted')[0];
        if (first) void app.player.audition('perc', first.id);
        return;
      }
      const used = app.current.events.find((e) => e.cat === slot && e.sample)?.sample ?? ing.kit()[slot][0];
      if (used) void app.player.audition(slot, used, 110);
    });
    row.addEventListener('pointerdown', () => {
      selected = slot;
      update();
    });
    rows.set(slot, { row, count, stat });
  });

  const listTop = 2 + SLOTS.length * 15 + 6;
  const head = el('div', 'label', b, [4, listTop + 2]);
  const pickLabel = el('div', 'label small', b, [W - 92, listTop + 2], 'PICK');
  const pick = new GemSelect(b, [W - 72, listTop - 1, 68, 13], {
    label: 'How this category picks among its samples',
    fontSize: 8,
    options: SAMPLE_MODES.map((m) => ({ value: m, label: SAMPLE_MODE_LABEL[m] })),
    onChange: (v) => {
      if (selected !== 'unsorted') app.setSampleSettings(selected, { mode: v as SampleMode });
    },
  });
  const list = el('div', 'samplelist', b, [3, listTop + 14, W - 8, rect.h - 18 - listTop - 14 - 56]);
  const note = el('div', 'empty-note', b, [8, listTop + 22, W - 20]);

  const by = rect.h - 18 - 40;
  const file = el('input', '', b);
  file.type = 'file';
  file.multiple = true;
  file.accept = '.wav,.wave,.aif,.aiff,.flac,.mp3,.ogg,.m4a,audio/wav,audio/x-wav,audio/aiff,audio/*';
  file.style.display = 'none';
  file.addEventListener('change', () => {
    const fs = [...(file.files ?? [])];
    file.value = '';
    if (fs.length) void ui.importEntries(fs.map((f) => ({ file: f, path: '' })));
  });
  // folder choice: Chromium, Firefox and Safari all support webkitdirectory; where not, LOAD… still works
  const folder = el('input', '', b);
  folder.type = 'file';
  folder.multiple = true;
  folder.setAttribute('webkitdirectory', '');
  folder.style.display = 'none';
  folder.addEventListener('change', () => {
    const fs = [...(folder.files ?? [])];
    folder.value = '';
    const entries: ImportEntry[] = fs.map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }));
    if (entries.length) void ui.importEntries(entries);
  });
  const folderSupported = 'webkitdirectory' in folder;
  const bw = Math.floor((W - 8 - 9) / 4);
  new Button(b, [4, by, bw, 16], 'LOAD…', { tip: 'Load WAV or AIFF one-shots (or drop files or folders anywhere on the screen). They stay in this browser.', onPress: () => file.click() });
  const fbtn = new Button(b, [7 + bw, by, bw, 16], 'FOLDER…', {
    tip: folderSupported ? 'Load a whole folder of samples, sub-folders included. Categories are suggested from folder and file names (Kicks/, SD_02.wav, OH …); check them in the review that follows.' : 'This browser cannot choose folders: drop a folder on the screen instead, or use LOAD…',
    onPress: () => (folderSupported ? folder.click() : ui.alert('This browser cannot open a folder chooser. Drop the folder anywhere on the screen instead, or use LOAD… to pick files.')),
  });
  fbtn.disabled = !folderSupported;
  new Button(b, [10 + 2 * bw, by, bw, 16], 'DEMO', { tip: 'Add the built-in demo kit (original sounds synthesised in the browser)', onPress: () => ing.loadDemo() });
  new Button(b, [13 + 3 * bw, by, W - 17 - 3 * bw, 16], 'CLEAR', {
    tip: 'Remove every ingredient',
    onPress: () => void ui.confirm('Remove all ingredients? Your sample files are not affected; samples loaded from disk are removed from this browser.', 'Remove').then((ok) => ok && ing.clear()),
  });
  const hint = el('div', 'label tiny', b, [5, by + 22]);
  hint.textContent = 'DROP FILES OR FOLDERS · STAYS LOCAL';

  function statusOf(slot: Slot): { text: string; bad: boolean } {
    if (slot === 'unsorted') {
      const n = ing.inSlot('unsorted').length;
      return { text: n ? 'NOT PLAYED: ASSIGN' : '', bad: n > 0 };
    }
    const n = ing.kit()[slot].length;
    const m = modeOf(app.samples, slot);
    if (n) return { text: n > 1 && m !== 'auto' ? SAMPLE_MODE_LABEL[m] : 'OK', bad: false };
    const src = sourceOf(ing.kit(), slot);
    if (src) return { text: `USES ${CATEGORY_LABEL[src]}`, bad: false };
    return { text: ESSENTIAL.includes(slot) ? 'MISSING!' : 'NONE: SILENT', bad: true };
  }

  let lastSig = '';
  function update(): void {
    kp?.update();
    if (win.tab === 2) lp.update();
    for (const [slot, r] of rows) {
      r.row.classList.toggle('sel', slot === selected);
      const n = ing.inSlot(slot).length;
      r.count.textContent = String(n);
      const st = statusOf(slot);
      r.stat.textContent = st.text;
      r.stat.classList.toggle('bad', st.bad);
      setTip(r.row, slot === 'unsorted' ? 'Samples not yet given a category. They are not played until you assign them.' : `${slotLabel(slot)}: ${n} sample${n === 1 ? '' : 's'}. ${n > 1 ? `Picks by ${SAMPLE_MODE_LABEL[modeOf(app.samples, slot)]}.` : st.text}`);
    }
    head.textContent = `${slotLabel(selected)} SAMPLES`;
    const cat = selected === 'unsorted' ? null : selected;
    const mode = cat ? modeOf(app.samples, cat) : 'auto';
    pick.el.style.display = pickLabel.style.display = cat ? '' : 'none';
    pick.value = mode;
    setTip(pick.el, cat ? `${SAMPLE_MODE_TIP[mode]} Applies to ${CATEGORY_LABEL[cat]} hits, also when they borrow another category's samples. The same seed always picks the same samples; playback and TAKEAWAY match.` : '');

    const items = ing.inSlot(selected);
    const usage = sampleUsage(app.current.events.filter((e) => !cat || e.cat === cat));
    const cs = cat ? app.samples[cat] : undefined;
    const loud = ing.loudness();
    const ready = items.filter((i) => i.status === 'ready');
    const order = [...ready].sort((a, b2) => (loud[a.id] ?? 0) - (loud[b2.id] ?? 0)).map((i) => i.id);
    const sig = JSON.stringify([selected, mode, cs, items.map((i) => [i.id, i.cat, i.status, i.name]), [...usage]]);
    note.textContent = items.length ? '' : selected === 'unsorted' ? 'Nothing unsorted.' : `No ${slotLabel(selected)} samples. Load some, or reassign one from another category.`;
    // keep the list while one of its weight boxes is being typed into
    if (sig === lastSig || (typing.active && list.contains(document.activeElement))) return;
    lastSig = sig;
    list.replaceChildren();
    for (const it of items) {
      const row = el('div', 'srow', list);
      const p = el('span', 'ibtn', row, undefined, '▶');
      setTip(p, 'Preview');
      p.addEventListener('pointerdown', () => void app.player.audition(selected === 'unsorted' ? 'perc' : selected, it.id));
      const name = el('span', 'sname' + (it.status === 'ready' ? '' : ' bad'), row, undefined, it.name);
      setTip(name, `${it.path || it.name}${it.duration ? ` · ${it.duration.toFixed(2)} s` : ''}${it.status === 'ready' ? ` · ${it.loud.toFixed(1)} dB RMS` : ''}${it.source === 'demo' ? ' · demo kit' : ''}${it.message ? ' · ' + it.message : ''}${it.status !== 'ready' ? ` · ${it.status.toUpperCase()}` : ''}`);
      // the mode's setting for this sample (or how often it plays in this break)
      const slotEl = el('span', 'wslot', row);
      const used = usage.get(it.id) ?? 0;
      if (cat && mode === 'fixed' && it.status === 'ready') {
        const on = (cs?.fixed ?? ready[0]?.id) === it.id;
        slotEl.textContent = on ? '●' : '○';
        slotEl.classList.add('pickable');
        setTip(slotEl, on ? 'The FIXED sample: every hit plays it' : 'Click to make this the FIXED sample');
        slotEl.addEventListener('pointerdown', () => app.setSampleSettings(cat, { fixed: it.id }));
      } else if (cat && mode === 'weighted' && it.status === 'ready') {
        new NumBox(slotEl, [0, 0, 14, 11], {
          get: () => app.samples[cat]?.weights?.[it.id] ?? 1,
          set: (v) => app.setSampleSettings(cat, { weights: { ...(app.samples[cat]?.weights ?? {}), [it.id]: v } }),
          min: 0,
          max: 9,
          pxPerUnit: 6,
          label: `Weight of ${it.name}`,
          tip: `WEIGHTED: this sample's weight (0–9; 0 = never). Click and type, or ↑ ↓. Plays ${used} hit${used === 1 ? '' : 's'} in this break.`,
        }).el.classList.add('wnum');
      } else if (cat && mode === 'velocity' && it.status === 'ready') {
        slotEl.textContent = `L${order.indexOf(it.id) + 1}`;
        setTip(slotEl, `VELOCITY layer ${order.indexOf(it.id) + 1} of ${order.length} (1 = quietest, measured ${it.loud.toFixed(1)} dB RMS). Plays ${used} hit${used === 1 ? '' : 's'}.`);
      } else if (cat && mode === 'roundrobin' && it.status === 'ready') {
        slotEl.textContent = String(ready.indexOf(it) + 1);
        setTip(slotEl, `ROUND ROBIN: ${ordinal(ready.indexOf(it) + 1)} in turn (list order). Plays ${used} hit${used === 1 ? '' : 's'}.`);
      } else {
        slotEl.textContent = used ? `×${used}` : '';
        setTip(slotEl, used ? `Plays ${used} hit${used === 1 ? '' : 's'} in this break` : 'Not used by this break');
      }
      new GemSelect(row, null, {
        label: `Category of ${it.name}`,
        options: SLOTS.map((s) => ({ value: s, label: slotLabel(s) })),
        value: it.cat,
        cls: 'srowsel',
        onChange: (v) => ing.setCategory(it.id, v as Slot),
      });
      const x = el('span', 'ibtn', row, undefined, '×');
      setTip(x, 'Remove this sample');
      x.addEventListener('pointerdown', () => void ui.confirm('Remove this sample from the current kit?', 'Remove').then(ok => ok && ing.remove(it.id)));
    }
  }
  update();
  return { update, win, select: (s: Slot) => ((selected = s), update()) };
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
