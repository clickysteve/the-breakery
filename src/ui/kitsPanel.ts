/**
 * KITS (a tab of INGREDIENTS): The Breakery's view of Slop Factory Core's kit workflow
 * (KitSession): the saved kits, NEW, SAVE, SAVE AS, LOAD, DUPLICATE, RENAME, DELETE, IMPORT,
 * EXPORT and SET DEFAULT. Nothing that would be lost goes without asking first.
 */
import { KitError, roleInfo, type KitMapping, type KitSession } from '@slopfactory/core/kits';
import { KIT_FILES, legacyReader } from '../app/kits';
import { download } from '../audio/takeaway';
import { el, esc } from './dom';
import { promptDialog } from './dialogs';
import { GemSelect } from './gemSelect';
import { Button } from './widgets';
import type { UiContext } from './context';

export function kitsPanel(parent: HTMLElement, ui: UiContext, kits: KitSession) {
  const panel = el('div', '', parent, [0, 0, 202, 405]);
  const title = el('div', 'label', panel, [6, 8, 190]);
  const count = el('div', 'label tiny', panel, [6, 27, 190]);
  const list = new GemSelect(panel, [5, 48, 192, 180], { label: 'Saved kits', mode: 'list' });
  const input = el('input', '', panel); input.type = 'file'; input.accept = KIT_FILES; input.hidden = true;
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
  const nameOf = (id: string) => kits.kits.find(e => e.id === id)?.name ?? '';
  /** Save, asking before a kit of the same name is replaced. */
  const saveNamed = async (name: string, asNew: boolean) => {
    const go = (replace: boolean) => asNew ? kits.saveAs(name, { replace }) : kits.save(name, { replace });
    try { await go(false); }
    catch (e) {
      if (!(e instanceof KitError && e.code === 'exists')) throw e;
      if (await ui.confirm(`${esc(e.message)} Replace it with the current sounds?`, 'Replace')) await go(true);
    }
  };
  /** Say where samples went that The Breakery has no category for. */
  const report = (m: KitMapping | undefined, what: string) => {
    const kept = m?.unmapped.filter(u => u.reason === 'no-target') ?? [];
    const n = kept.reduce((a, u) => a + u.samples.length, 0);
    ui.app.say(n ? `${what}. ${n} sample${n === 1 ? '' : 's'} of ${kept.map(u => u.instrument.label ?? roleInfo(u.instrument.role).label).join(', ')} kept in UNSORTED: The Breakery has no category for ${n === 1 ? 'it' : 'them'}.` : `${what}.`);
  };
  const actions: [string, () => Promise<void> | void, string][] = [
    ['NEW', async () => { if (await discard()) await kits.newKit(); }, 'Start an empty kit'],
    ['SAVE', async () => { const name = kits.currentId ? kits.name : await ask(kits.name); if (name !== null) await saveNamed(name, false); }, 'Save the current sounds over this kit (or as a new one)'],
    ['SAVE AS', async () => { const name = await ask(kits.name + ' Copy'); if (name !== null) await saveNamed(name, true); }, 'Save the current sounds as a new kit'],
    ['LOAD', async () => { const id = selected(); if (await discard()) report(await kits.load(id), `Loaded “${nameOf(id)}”`); }, 'Load the selected kit (the pattern, recipe and history stay)'],
    ['DUPLICATE', async () => { const id = selected(); const name = await ask(nameOf(id) + ' Copy'); if (name !== null) await kits.duplicate(id, name); }, 'Copy the selected kit (its samples are shared, not copied)'],
    ['RENAME', async () => { const id = selected(); const name = await ask(nameOf(id)); if (name !== null) await kits.rename(id, name); }, 'Rename the selected kit'],
    ['DELETE', async () => { const id = selected(); if (await ui.confirm('Delete this saved kit? This cannot be undone. Its samples stay in the LIBRARY.', 'Delete')) await kits.delete(id); }, 'Delete the selected kit (samples other kits use are never deleted)'],
    ['IMPORT', () => input.click(), 'Open a kit file (.kit.zip from any Slop Factory instrument, or a .breakery-kit) as unsaved sounds; SAVE keeps it'],
    ['EXPORT', async () => { const f = await kits.exportCurrent(); download(f.fileName, f.bytes, 'application/zip'); ui.app.say(`Exported ${f.fileName}: the current sounds with their audio, for any Slop Factory instrument.`); }, 'Save the current sounds (with their audio) as a portable kit file'],
    ['SET DEFAULT', () => kits.setDefault(selected()), 'Open the selected kit at startup'],
  ];
  actions.forEach(([label, action, tip], i) => {
    controls.push(new Button(panel, [5 + (i % 2) * 98, 240 + Math.floor(i / 2) * 22, 94, 18], label, { tip, onPress: () => void run(action) }));
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.value = '';
    if (file) void run(async () => {
      if (!(await discard())) return;
      if (file.size > 512 * 1024 * 1024) throw new Error('Kit file exceeds 512 MB.');
      const r = await kits.importFile(new Uint8Array(await file.arrayBuffer()), { legacy: legacyReader });
      report(r.mapping, `Imported “${r.kit.name}”${r.legacy ? ' (an earlier Breakery kit)' : ''}${r.added ? `, ${r.added} new sample${r.added === 1 ? '' : 's'} in the LIBRARY` : ''}; SAVE keeps the kit`);
    });
  });
  el('div', 'label tiny', panel, [6, 371, 190], 'KITS HOLD SOUNDS · RECIPES HOLD RHYTHM');
  let signature = '';
  function update(): void {
    title.textContent = kits.name;
    title.title = kits.name;
    count.textContent = `${ui.app.ingredients.items.length} SAMPLES${kits.dirty ? ' · * UNSAVED' : ''}${busy ? ' · WORKING…' : ''}`;
    controls.forEach(b => (b.disabled = busy));
    list.disabled = busy;
    const next = JSON.stringify([kits.kits, kits.defaultId, kits.currentId]);
    if (signature === next) return;
    signature = next;
    const previous = list.value;
    list.setOptions(kits.kits.map((e) => ({ value: e.id, label: `${e.id === kits.defaultId ? '★ ' : ''}${e.name} (${e.samples})` })));
    list.value = kits.kits.some(e => e.id === previous) ? previous : kits.currentId ?? kits.kits[0]?.id ?? '';
  }
  kits.onChange(update);
  panel.style.position = 'absolute';
  title.style.whiteSpace = 'nowrap';
  title.style.textOverflow = 'ellipsis';
  title.style.overflow = 'hidden';
  title.style.height = '18px';
  update(); return { panel, update };
}
