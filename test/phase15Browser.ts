/**
 * Browser-only checks of Phase 15 in the real app (Chromium), invoked by phase15Browser.test.ts:
 * NEW PATCH (⌘N, the dialog, KEEP CURRENT KIT), the WILDCARD status line and REPORT (COPY REPORT),
 * TAKEAWAY's file name builder (the preview is the export's own function), the 13 tracks in the
 * pattern editor and the mixer, and the pattern editor's compact rows and [?] HELP.
 */
import type { App } from '../src/app/app';
import { buildFileName, loadNaming, masterSuffix } from '../src/audio/exportName';
import { CATEGORIES } from '../src/engine/types';

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];
const wait = async (ok: () => unknown, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (ok()) return;
    await tick(30);
  }
  throw new Error(`timed out: ${what}`);
};
const press = (t: Element) => {
  for (const type of ['pointerdown', 'pointerup']) t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1 }));
};
const button = (label: string, root: ParentNode = document) => $$<HTMLButtonElement>('.mdialog .mbutton', root).find((b) => b.textContent === label)!;
const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;

export async function run(): Promise<string> {
  for (let i = 0; i < 100 && !(window as unknown as { breakery?: unknown }).breakery; i++) await tick(50);
  const app = (window as unknown as { breakery: { app: App } }).breakery.app;
  await wait(() => app.current.events.length, 'the first break');

  // ---------------------------------------------------------------- 13 tracks: pattern editor rows and mixer strips, all inside their window
  const names = $$('.trackname').map((l) => l.textContent);
  check(names.join() === 'KICK,SNARE,GHOST,CLAP,HI TOM,MID TOM,LO TOM,HAT,OPEN,RIDE,CRASH,PERC,FX', `pattern rows: ${names}`);
  const pane = $$('.trackname')[0]!.parentElement!;
  const pr = pane.getBoundingClientRect();
  for (const l of $$('.trackname')) check(inside(l.getBoundingClientRect(), pr), `${l.textContent} row inside the PATTERN window`);
  check($$('.btn', pane).filter((b) => b.textContent === 'CLEAR EDITS' || b.textContent === 'REGEN TRACK' || b.textContent === 'UNDO').every((b) => inside(b.getBoundingClientRect(), pr)), 'the tools row is inside the window');
  check($$('.label.tiny', pane).every((l) => !/SHIFT\+CLICK|CLICK: TOGGLE/.test(l.textContent ?? '')), 'no instruction rows under the grid');
  check($$('.card', pane).some((c) => c.textContent === 'SELECTED: NONE'), 'SELECTED: NONE');
  app.toggleMute('hat');
  app.toggleMute('perc');
  await tick(20);
  check($$('.card', pane).some((c) => /MUTED: 2/.test(c.textContent ?? '')), 'MUTED: 2');
  app.clearMix();
  const help = $$('.btn', pane).find((b) => b.textContent === '?')!;
  press(help);
  await wait(() => $('.mdialog')?.textContent?.includes('Shift+click a hit'), 'the [?] HELP dialog');
  button('OK').click();
  const hit = app.current.events.find((e) => e.cat === 'snare')!;
  app.select(hit.ref!);
  await tick(20);
  check($$('.card', pane).some((c) => /^SELECTED: SNARE · /.test(c.textContent ?? '')), 'the selected hit in one compact line');
  app.select(null);

  // ---------------------------------------------------------------- NEW PATCH: no question when nothing changed; asks with KEEP CURRENT KIT when it did
  const key = (k: string, o: KeyboardEventInit = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  key('n', { metaKey: true });
  await wait(() => !app.patchDirty && app.status.startsWith('NEW PATCH'), 'a clean NEW PATCH');
  check(!$('.mdialog'), 'no dialog for a patch without changes');
  app.setStyle('hardcore');
  app.setRecipe({ bpm: 175 });
  check(app.patchDirty, 'changes make the patch dirty');
  key('n', { ctrlKey: true });
  await wait(() => $('.mdialog')?.textContent?.includes('NEW PATCH'), 'the NEW PATCH dialog');
  const keep = $<HTMLInputElement>('.mdialog input[type=checkbox]')!;
  check(keep.checked && keep.parentElement!.textContent!.includes('KEEP CURRENT KIT'), 'KEEP CURRENT KIT, on by default');
  check(button('Cancel') && button('New Patch') && !button('Save'), 'CANCEL and NEW PATCH (no SAVE: patches are not saved as files)');
  button('Cancel').click();
  await tick(20);
  check(app.recipe.style === 'hardcore' && app.recipe.bpm === 175, 'Cancel changes nothing');
  key('n', { metaKey: true });
  await wait(() => $('.mdialog'), 'the dialog again');
  const samples = app.ingredients.items.length;
  button('New Patch').click();
  await wait(() => app.recipe.style === 'funk' && !app.patchDirty, 'NEW PATCH applied');
  check(app.ingredients.items.length === samples && !app.canUndo, 'the kit stays, undo starts afresh');

  // ---------------------------------------------------------------- WILDCARD: one-line status, click for the REPORT, COPY REPORT
  app.wildcard(4242);
  await tick(30);
  const status = $('#menubar .status')!;
  const cs = getComputedStyle(status);
  check(cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis' && status.offsetHeight <= 16, `the status line is one line with an ellipsis (${cs.whiteSpace}, ${cs.textOverflow}, ${status.offsetHeight}px)`);
  check(/^WILDCARD · .+ · \d+ BPM · \d+ SETTINGS? CHANGED/.test(status.textContent ?? '') && status.classList.contains('report'), `the WILDCARD headline: ${status.textContent}`);
  status.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
  await wait(() => $('.mdialog .wreport'), 'the WILDCARD REPORT');
  const rows = $$('.mdialog .wrow');
  check(rows.length === app.wildcardReport!.count && rows.length > 0, `report rows ${rows.length} vs ${app.wildcardReport!.count}`);
  check(rows.every((r) => { const t = r.lastElementChild!.textContent!; const [a, b] = t.split(' → '); return a !== b; }), 'only real changes');
  const list = $('.mdialog .wreport')!;
  check(['auto', 'scroll'].includes(getComputedStyle(list).overflowY), 'the report scrolls');
  button('Copy Report').click();
  await wait(() => $('.mdialog .wreport-copy span')?.textContent, 'COPY REPORT says what happened');
  button('Close').click();
  app.undo();
  await tick(20);
  check(app.wildcardReport === null && !status.classList.contains('report'), 'undo takes the report back');
  app.redo();
  check((app.wildcardReport as { count: number } | null)?.count === rows.length, 'redo brings the same report back');

  // ---------------------------------------------------------------- TAKEAWAY: the preview is the export's name
  key('t');
  await wait(() => $('.mdialog')?.textContent?.includes('TAKEAWAY'), 'the TAKEAWAY dialog');
  const box = $('.mdialog')!;
  const preview = () => [...box.querySelectorAll<HTMLElement>('div[aria-live=polite]')].pop()!.innerText.split('\n').map((s) => s.trim());
  const naming = loadNaming();
  check(preview()[0] === buildFileName(naming, app.current, masterSuffix(naming, false), 'wav', (window as unknown as { breakery: { kits?: { name?: string } } }).breakery.kits?.name ?? null), `LOOP preview: ${preview()[0]}`);
  const kindRadio = (label: string) => $$<HTMLLabelElement>('label', box).find((l) => l.textContent === label)!.querySelector('input')!;
  kindRadio('LOOP + STEMS').click();
  await tick(10);
  const p = preview();
  check(p[0]!.endsWith('_STEMS.zip') && /_LOOP\.wav$/.test(p[1]!) && /_KICK\.wav$/.test(p[2]!) && /_SNARE\.wav$/.test(p[3]!), `LOOP + STEMS preview: ${p.join(' | ')}`);
  kindRadio('STEMS ONLY').click();
  await tick(10);
  check(!preview().some((l) => /_LOOP\.wav$/.test(l)), 'STEMS ONLY has no mix');
  // move SEED to the top: the preview follows at once
  // (each move redraws the list, so the button is looked up again)
  for (let i = 0; i < naming.parts.findIndex((x) => x.id === 'seed'); i++) $$<HTMLButtonElement>('button', box).find((b) => b.getAttribute('aria-label') === 'Move up: SEED')!.click();
  await tick(10);
  check(preview()[0]!.startsWith(app.seedText.replace(/ /g, '-')), `SEED first: ${preview()[0]}`);
  button('Cancel').click();
  check(loadNaming().parts[0]!.id === naming.parts[0]!.id, 'Cancel does not save the naming');

  // ---------------------------------------------------------------- the mixer has a strip per track
  check(CATEGORIES.length === 13, '13 categories');
  return 'passed';
}
