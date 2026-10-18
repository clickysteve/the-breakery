import type { KitManager } from '../app/kits';
import { download } from '../audio/takeaway';
import { el, esc } from './dom';
import { promptDialog } from './dialogs';
import { GemSelect } from './gemSelect';
import { Button } from './widgets';
import type { UiContext } from './context';

export function kitsPanel(parent: HTMLElement, ui: UiContext, kits: KitManager) {
  const panel = el('div', '', parent, [0, 0, 202, 405]);
  const title = el('div', 'label', panel, [6, 8, 190]);
  const count = el('div', 'label tiny', panel, [6, 27, 190]);
  const list = new GemSelect(panel, [5, 48, 192, 180], { label: 'Saved kits', mode: 'list' });
  const input = el('input', '', panel); input.type = 'file'; input.accept = '.breakery-kit,.zip'; input.hidden = true;
  let busy = false;
  const controls: Button[] = [];
  const run = async (action: () => Promise<void> | void) => {
    if (busy) return;
    busy = true; update();
    try { await action(); }
    catch (e) { ui.alert(`Kit operation failed: ${esc(e instanceof Error ? e.message : String(e))}<br>Current sounds are still available. If storage is full, export your kit to keep a copy.`); }
    finally { busy = false; update(); }
  };
  const discard = async () => !kits.dirty || await ui.confirm('Discard unsaved kit changes?', 'Discard');
  const ask = (value: string) => promptDialog(ui.screen, 'Kit name (1–64 characters):', value);
  const selected = () => { if (!list.value) throw new Error('Select a saved kit first.'); return list.value; };
  const actions: [string, () => Promise<void> | void][] = [
    ['NEW', async () => { if (await discard()) kits.newKit(); }],
    ['SAVE', async () => { const name = kits.catalog.currentId ? kits.name : await ask(kits.name); if (name !== null) await kits.save(name); }],
    ['SAVE AS', async () => { const name = await ask(kits.name + ' Copy'); if (name !== null) await kits.save(name, true); }],
    ['LOAD', async () => { const id = selected(); if (await discard()) await kits.load(id); }],
    ['DUPLICATE', async () => { const id = selected(); const name = await ask(kits.catalog.entries.find(e => e.id === id)!.name + ' Copy'); if (name !== null) kits.duplicate(id, name); }],
    ['RENAME', async () => { const id = selected(); const name = await ask(kits.catalog.entries.find(e => e.id === id)!.name); if (name !== null) kits.rename(id, name); }],
    ['DELETE', async () => { const id = selected(); if (await ui.confirm('Delete this saved kit? This cannot be undone.', 'Delete')) await kits.delete(id); }],
    ['IMPORT', () => input.click()],
    ['EXPORT', async () => { const bytes = await kits.export(); download(kits.name.replace(/[^\w -]/g, '_') + '.breakery-kit', bytes, 'application/zip'); }],
    ['SET DEFAULT', () => kits.setDefault(selected())],
  ];
  actions.forEach(([label, action], i) => {
    controls.push(new Button(panel, [5 + (i % 2) * 98, 240 + Math.floor(i / 2) * 22, 94, 18], label, { onPress: () => void run(action) }));
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.value = '';
    if (file) void run(async () => { if (await discard()) { if (file.size > 256 * 1024 * 1024) throw new Error('Kit file exceeds 256 MB.'); await kits.import(new Uint8Array(await file.arrayBuffer())); } });
  });
  el('div', 'label tiny', panel, [6, 371, 190], 'KITS HOLD SOUNDS · RECIPES HOLD RHYTHM');
  let signature = '';
  function update(): void {
    title.textContent = kits.name;
    title.title = kits.name;
    count.textContent = `${ui.app.ingredients.items.length} SAMPLES${kits.dirty ? ' · * UNSAVED' : ''}${busy ? ' · WORKING…' : ''}`;
    controls.forEach(b => (b.disabled = busy));
    list.disabled = busy;
    const next = JSON.stringify(kits.catalog);
    if (signature === next) return;
    signature = next;
    const previous = list.value;
    list.setOptions(kits.catalog.entries.map((e) => ({ value: e.id, label: `${e.id === kits.catalog.defaultId ? '★ ' : ''}${e.name} (${e.count})` })));
    list.value = kits.catalog.entries.some(e => e.id === previous) ? previous : kits.catalog.currentId ?? kits.catalog.entries[0]?.id ?? '';
  }
  panel.style.position = 'absolute';
  title.style.whiteSpace = 'nowrap';
  title.style.textOverflow = 'ellipsis';
  title.style.overflow = 'hidden';
  title.style.height = '18px';
  update(); return { panel, update };
}
