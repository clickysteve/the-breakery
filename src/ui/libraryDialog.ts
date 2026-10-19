/**
 * ADD FROM LIBRARY (Phase 17): samples already in this browser's library, from any kit or import,
 * added to the current kit's instrument without importing them again. A GEM dialog: search, a
 * category filter (by the category each sample has in the saved kits, or, if none, its name's),
 * several at once, a preview of each (it plays on its own, never through the break), and marks
 * for the samples already in the current kit. The destination (the instrument selected in
 * INGREDIENTS) always wins: a SNARE sample can be added to KICK.
 */
import { Auditioner, type KitLibrary } from '@slopfactory/core/kits';
import { guessCategory, SLOTS, type Ingredient, type Slot } from '../audio/ingredients';
import { slotOfRole } from '../app/kits';
import { CATEGORY_LABEL } from '../engine/types';
import { el, esc, setTip } from './dom';
import { openDialog } from './dialogs';
import { GemSelect } from './gemSelect';

const slotLabel = (s: Slot) => (s === 'unsorted' ? 'UNSORTED' : CATEGORY_LABEL[s]);

export interface LibraryEntry {
  id: string;
  name: string;
  /** its category: the one it has in a saved kit, else the one its name suggests */
  cat: Slot;
  /** `cat` comes from the name, not from a kit */
  guessed: boolean;
  /** the categories it already has in the current kit */
  inKit: Slot[];
}

/** Every library sample with its category and where it already is in the current kit. */
export async function libraryEntries(library: KitLibrary, items: readonly Pick<Ingredient, 'id' | 'audio' | 'cat'>[]): Promise<LibraryEntry[]> {
  const samples = await library.listSamples();
  const known = new Map<string, Slot>();
  for (const k of await library.listKits()) {
    const kit = await library.getKit(k.id);
    for (const ins of kit?.instruments ?? []) {
      const slot = slotOfRole(ins.role);
      if (slot) for (const r of ins.samples) if (!known.has(r.sample)) known.set(r.sample, slot);
    }
  }
  return samples
    .map((s) => {
      const cat = known.get(s.id);
      return { id: s.id, name: s.name, cat: cat ?? guessCategory(s.name), guessed: !cat, inKit: [...new Set(items.filter((i) => (i.audio ?? i.id) === s.id).map((i) => i.cat))] };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Choose library samples to add to `dest`. Resolves with the chosen ones (none: cancelled). */
export async function libraryDialog(screen: HTMLElement, library: KitLibrary, items: readonly Pick<Ingredient, 'id' | 'audio' | 'cat'>[], dest: Slot, context: () => Promise<AudioContext | null>): Promise<{ id: string; name: string }[]> {
  const entries = await libraryEntries(library, items);
  const chosen = new Set<string>();
  const audition = new Auditioner({ context });
  let query = '';
  let filter = '';
  const ok = await openDialog<boolean>(
    screen,
    `<b>ADD FROM LIBRARY</b> to ${esc(slotLabel(dest))}<br><span style="font-size:9px">Samples already in this browser, from every kit and import. They are added by reference: no import, no copy. ${esc(slotLabel(dest))} is where they play in this kit, whatever their own category; the library keeps its own entry.</span>`,
    [
      { label: 'Cancel', value: false },
      { label: `Add to ${slotLabel(dest)}`, value: true, isDefault: true },
    ],
    false,
    (box) => {
      const bar = el('div', 'row', box);
      Object.assign(bar.style, { display: 'flex', gap: '6px', alignItems: 'center' });
      const search = el('input', '', bar);
      search.type = 'text';
      search.placeholder = 'SEARCH';
      search.style.flex = '1';
      search.setAttribute('aria-label', 'Search the library by name');
      search.addEventListener('input', () => {
        query = search.value.trim().toLowerCase();
        draw();
      });
      new GemSelect(bar, null, {
        label: 'Show samples of one category',
        options: [{ value: '', label: 'ALL' }, ...SLOTS.map((s) => ({ value: s, label: slotLabel(s) }))],
        value: '',
        cls: 'tailsel',
        onChange: (v) => {
          filter = v;
          draw();
        },
      });
      const list = el('div', 'samplelist', box);
      Object.assign(list.style, { position: 'relative', height: '200px', marginTop: '4px' });
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-multiselectable', 'true');
      list.setAttribute('aria-label', 'Library samples');
      const count = el('div', 'label tiny', box);
      count.style.marginTop = '3px';
      const draw = () => {
        list.replaceChildren();
        const shown = entries.filter((e) => (!query || e.name.toLowerCase().includes(query)) && (!filter || e.cat === filter));
        for (const e of shown) {
          const row = el('div', 'srow', list);
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', String(chosen.has(e.id)));
          row.dataset.sample = e.id;
          row.classList.toggle('paint', chosen.has(e.id));
          const l = el('label', '', row);
          Object.assign(l.style, { display: 'flex', alignItems: 'center', gap: '3px', flex: '1', minWidth: '0' });
          const c = el('input', '', l);
          c.type = 'checkbox';
          c.checked = chosen.has(e.id);
          c.addEventListener('change', () => {
            if (c.checked) chosen.add(e.id);
            else chosen.delete(e.id);
            row.classList.toggle('paint', c.checked);
            row.setAttribute('aria-selected', String(c.checked));
            tally();
          });
          el('span', 'sname', l, undefined, e.name);
          const cat = el('span', 'label tiny', row, undefined, `${slotLabel(e.cat)}${e.guessed ? '?' : ''}`);
          setTip(cat, e.guessed ? `Category from its name (it is in no saved kit): ${slotLabel(e.cat)}` : `Its category in a saved kit: ${slotLabel(e.cat)}`);
          if (e.inKit.length) {
            const mark = el('span', 'label tiny', row, undefined, `● ${e.inKit.map(slotLabel).join('+')}`);
            setTip(mark, `Already in the current kit: ${e.inKit.map(slotLabel).join(', ')}${e.inKit.includes(dest) ? '' : `. Adding it to ${slotLabel(dest)} too uses the same audio.`}`);
          }
          const p = el('span', 'ibtn', row, undefined, '▶');
          setTip(p, 'Preview (on its own: the break keeps playing as it was)');
          p.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            p.classList.add('auditioning');
            void audition.playSample(library, e.id, { name: e.name }).finally(() => setTimeout(() => p.classList.remove('auditioning'), 200));
          });
        }
        if (!shown.length) el('div', 'empty-note', list, [6, 6, 300], entries.length ? 'Nothing matches.' : 'The library is empty: import samples (LOAD… or a kit) first.');
        tally();
      };
      const tally = () => (count.textContent = `${entries.length} IN THE LIBRARY · ${chosen.size} CHOSEN`);
      draw();
      setTimeout(() => search.focus(), 0);
    },
    380,
  );
  audition.forget();
  return ok ? entries.filter((e) => chosen.has(e.id)).map((e) => ({ id: e.id, name: e.name })) : [];
}
