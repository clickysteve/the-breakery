/**
 * INGREDIENTS: categories with their sample counts and status (missing / using a fallback), the
 * samples of the selected category (preview, reassign, remove), and loading.
 */
import { SLOTS, type Slot } from '../audio/ingredients';
import { sourceOf } from '../engine/kit';
import { CATEGORY_LABEL, type Category } from '../engine/types';
import { el, setTip } from './dom';
import { Button, MWindow } from './widgets';
import type { UiContext } from './context';

const slotLabel = (s: Slot) => (s === 'unsorted' ? 'UNSORTED' : CATEGORY_LABEL[s]);
const ESSENTIAL: Category[] = ['kick', 'snare'];

export function ingredientsWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const ing = app.ingredients;
  const win = new MWindow(parent, { title: 'INGREDIENTS', ...rect });
  const b = win.body;
  const W = rect.w - 2;
  let selected: Slot = 'kick';

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

  const listTop = 2 + SLOTS.length * 15 + 8;
  const head = el('div', 'label', b, [4, listTop]);
  const list = el('div', 'samplelist', b, [3, listTop + 11, W - 8, rect.h - 18 - listTop - 11 - 58]);
  const note = el('div', 'empty-note', b, [8, listTop + 18, W - 20]);

  const by = rect.h - 18 - 44;
  const file = el('input', '', b);
  file.type = 'file';
  file.multiple = true;
  file.accept = '.wav,.wave,.aif,.aiff,audio/wav,audio/x-wav,audio/aiff,audio/*';
  file.style.display = 'none';
  file.addEventListener('change', () => {
    const fs = [...(file.files ?? [])];
    file.value = '';
    if (fs.length) void ui.importFiles(fs);
  });
  new Button(b, [4, by, 64, 16], 'LOAD…', { tip: 'Load WAV or AIFF one-shots (or drop them anywhere on the screen). They stay in this browser.', onPress: () => file.click() });
  new Button(b, [72, by, 64, 16], 'DEMO KIT', { tip: 'Add the built-in demo kit (original sounds synthesised in the browser)', onPress: () => ing.loadDemo() });
  new Button(b, [140, by, W - 144, 16], 'CLEAR', {
    tip: 'Remove every ingredient',
    onPress: () => void ui.confirm('Remove all ingredients? Your sample files are not affected; samples loaded from disk are removed from this browser.', 'Remove').then((ok) => ok && ing.clear()),
  });
  const hint = el('div', 'label tiny', b, [5, by + 22]);
  hint.textContent = 'DROP WAV FILES ANYWHERE · STAYS LOCAL';

  function statusOf(slot: Slot): { text: string; bad: boolean } {
    if (slot === 'unsorted') {
      const n = ing.inSlot('unsorted').length;
      return { text: n ? 'NOT PLAYED: ASSIGN' : '', bad: n > 0 };
    }
    const n = ing.kit()[slot].length;
    if (n) return { text: 'OK', bad: false };
    const src = sourceOf(ing.kit(), slot);
    if (src) return { text: `USES ${CATEGORY_LABEL[src]}`, bad: false };
    return { text: ESSENTIAL.includes(slot) ? 'MISSING!' : 'NONE: SILENT', bad: true };
  }

  function update(): void {
    for (const [slot, r] of rows) {
      r.row.classList.toggle('sel', slot === selected);
      const n = ing.inSlot(slot).length;
      r.count.textContent = String(n);
      const st = statusOf(slot);
      r.stat.textContent = st.text;
      r.stat.classList.toggle('bad', st.bad);
      setTip(r.row, slot === 'unsorted' ? 'Samples not yet given a category. They are not played until you assign them.' : `${slotLabel(slot)}: ${n} sample${n === 1 ? '' : 's'}. ${st.text === 'OK' ? 'One is chosen per break (KIT seed).' : st.text}`);
    }
    head.textContent = `${slotLabel(selected)} SAMPLES`;
    const items = ing.inSlot(selected);
    list.replaceChildren();
    note.textContent = items.length ? '' : selected === 'unsorted' ? 'Nothing unsorted.' : `No ${slotLabel(selected)} samples. Load some, or reassign one from another category.`;
    for (const it of items) {
      const row = el('div', 'srow', list);
      const p = el('span', 'ibtn', row, undefined, '▶');
      setTip(p, 'Preview');
      p.addEventListener('pointerdown', () => void app.player.audition(selected === 'unsorted' ? 'perc' : selected, it.id));
      const name = el('span', 'sname' + (it.status === 'ready' ? '' : ' bad'), row, undefined, it.name);
      setTip(name, `${it.name}${it.duration ? ` · ${it.duration.toFixed(2)} s` : ''}${it.source === 'demo' ? ' · demo kit' : ''}${it.message ? ' · ' + it.message : ''}${it.status !== 'ready' ? ` · ${it.status.toUpperCase()}` : ''}`);
      const sel = el('select', 'mselect', row);
      sel.setAttribute('aria-label', `Category of ${it.name}`);
      for (const s of SLOTS) {
        const o = el('option', '', sel, undefined, slotLabel(s));
        o.value = s;
        o.selected = s === it.cat;
      }
      sel.addEventListener('pointerdown', (e) => e.stopPropagation());
      sel.addEventListener('change', () => ing.setCategory(it.id, sel.value as Slot));
      const x = el('span', 'ibtn', row, undefined, '×');
      setTip(x, 'Remove this sample');
      x.addEventListener('pointerdown', () => ing.remove(it.id));
    }
  }
  update();
  return { update, win };
}
