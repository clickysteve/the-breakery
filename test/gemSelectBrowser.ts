/** Browser-only checks of the GEM select (the real app in Chromium), invoked by gemSelect.test.ts. */
import type { App } from '../src/app/app';
import { GemSelect, type GemOption } from '../src/ui/gemSelect';

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

const key = (target: Element, k: string, o: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true, ...o }));
const down = (t: Element) => t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
const up = (t: Element) => t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));

export async function run(): Promise<string> {
  for (let i = 0; i < 100 && !(window as unknown as { breakery?: unknown }).breakery; i++) await tick(50);
  const app = (window as unknown as { breakery: { app: App } }).breakery.app;
  const screen = $('#screen')!;
  const scale = screen.getBoundingClientRect().width / screen.offsetWidth;

  // ---------------------------------------------------------------- no native select left
  check($$('select').length === 0, 'no native <select> anywhere in the app');
  const all = $$('.gsel');
  check(all.length >= 8, `the app's selects are GEM selects (${all.length})`);
  for (const g of all) check(g.getAttribute('role') === 'combobox' || g.getAttribute('role') === 'listbox', 'ARIA role on every GEM select');

  // ---------------------------------------------------------------- a select to drive
  const long: GemOption[] = Array.from({ length: 60 }, (_, i) => ({ value: `v${i}`, label: `ITEM ${i}`, disabled: i === 1 }));
  const opts: GemOption[] = [
    { value: 'a', label: 'ALPHA' },
    { value: 'b', label: 'BETA', disabled: true },
    { value: 'c', label: 'GAMMA', group: 'GREEK' },
    { value: 'd', label: 'DELTA', group: 'GREEK' },
    { value: 'e', label: 'EPSILON', group: 'MORE' },
  ];
  const changes: string[] = [];
  const mk = (x: number, y: number, options: GemOption[], value: string) => new GemSelect(screen, [x, y, 90, 14], { label: 'Test', options, value, onChange: (v) => changes.push(v) });
  const s = mk(40, 40, opts, 'a');
  const val = (g: GemSelect): string => g.value;
  const popup = () => $<HTMLElement>('.gsel-popup');

  // keys that reach the window are what the global shortcuts (Space = play/stop) would see
  const reached: string[] = [];
  const spy = (e: KeyboardEvent) => reached.push(e.key);
  window.addEventListener('keydown', spy);

  // closed look: square, the app font, an arrow, the value shown
  const cs = getComputedStyle(s.el);
  check(cs.borderRadius === '0px' && cs.borderTopWidth === '1px', 'square corners and the 1px border');
  check(cs.fontFamily === getComputedStyle($('.btn')!).fontFamily, 'the pixel font');
  check($('.msel-arrow', s.el), 'a drop-down arrow');
  check(s.el.textContent === 'ALPHA' && val(s) === 'a', 'shows the selected label');

  // pointer: open, a disabled option is inert, an option chooses and closes, callback once
  down(s.el);
  check(s.isOpen && popup() && s.el.getAttribute('aria-expanded') === 'true', 'pointer opens');
  const items = $$('.msel-item', popup()!);
  check(items.length === 5 && items[1]!.getAttribute('aria-disabled') === 'true', 'options, the disabled one marked');
  check($$('.msel-group', popup()!).length === 2 && $$('.msel-head', popup()!).map((h) => h.textContent).join() === 'GREEK,MORE', 'grouped options');
  const pcs = getComputedStyle(popup()!);
  check(pcs.borderRadius === '0px' && pcs.fontFamily === cs.fontFamily && Number(pcs.zIndex) > 30000, 'popup: square, same font, above dialogs');
  up(items[1]!);
  check(s.isOpen && changes.length === 0 && val(s) === 'a', 'a disabled option cannot be chosen');
  up(items[2]!);
  check(!s.isOpen && !popup() && val(s) === 'c' && changes.join() === 'c', 'choosing sets the value, closes, calls back once');
  check((s.el.textContent as string) === 'GAMMA', 'closed control shows the new label');

  // the value setter is silent (state sync does not call back), and unknown values show empty
  s.value = 'e';
  check((s.el.textContent as string) === 'EPSILON' && changes.join() === 'c', 'setting the value does not call back');
  s.value = 'zzz';
  check(val(s) === '' && (s.el.textContent as string) === '', 'an unknown value is empty');
  s.value = 'a';

  // keyboard
  s.el.focus();
  reached.length = 0;
  key(s.el, 'ArrowDown');
  check(s.isOpen, 'ArrowDown opens');
  key(s.el, 'ArrowDown'); // from ALPHA: BETA is disabled, so GAMMA
  check($('.msel-item.hot', popup()!)?.textContent === 'GAMMA', 'ArrowDown skips the disabled option');
  key(s.el, 'End');
  check($('.msel-item.hot', popup()!)?.textContent === 'EPSILON', 'End: the last enabled option');
  key(s.el, 'Home');
  check($('.msel-item.hot', popup()!)?.textContent === 'ALPHA', 'Home: the first enabled option');
  key(s.el, 'ArrowUp');
  check($('.msel-item.hot', popup()!)?.textContent === 'ALPHA', 'ArrowUp stops at the first');
  key(s.el, 'ArrowDown');
  key(s.el, 'Escape');
  check(!s.isOpen && val(s) === 'a' && changes.join() === 'c', 'Escape closes without changing');
  key(s.el, 'ArrowDown');
  key(s.el, 'ArrowDown');
  key(s.el, 'Enter');
  check(!s.isOpen && val(s) === 'c' && changes.join() === 'c,c', 'Enter chooses the highlighted option and calls back');
  s.value = 'a';
  key(s.el, 'd'); // type-ahead opens and moves
  check(s.isOpen && $('.msel-item.hot', popup()!)?.textContent === 'DELTA', 'type-ahead');
  key(s.el, 'Tab');
  check(!s.isOpen && val(s) === 'a', 'Tab closes and leaves the value');
  check(reached.join() === 'Tab', `handled keys never reach the global shortcuts; only Tab passes on (reached: ${reached.join()})`);

  // Space: opens when closed, chooses when open, never reaches the global play/stop shortcut
  reached.length = 0;
  key(s.el, ' ');
  check(s.isOpen, 'Space opens a closed select');
  key(s.el, 'ArrowDown');
  key(s.el, ' ');
  check(!s.isOpen && val(s) === 'c', 'Space chooses the highlighted option when open');
  check(reached.join() === '', `Space is not also transport (reached: ${reached.join()})`);
  key(document.body, ' ');
  check(reached.join() === ' ', 'Space elsewhere still reaches the global shortcut');

  // Escape inside a dialog closes only the pop-up; Enter chooses and is not also the default button
  const dialog = document.createElement('div');
  screen.appendChild(dialog);
  const seen: string[] = [];
  dialog.addEventListener('keydown', (e) => seen.push(e.key));
  const inDlg = new GemSelect(dialog, [300, 300, 60, 14], { label: 'In dialog', options: opts, value: 'a' });
  inDlg.open();
  key(inDlg.el, 'Escape');
  check(!inDlg.isOpen && seen.length === 0, 'Escape with the pop-up open does not reach the dialog');
  key(inDlg.el, 'Escape');
  check(seen.join() === 'Escape', 'Escape with it closed reaches the dialog');
  inDlg.open();
  key(inDlg.el, 'Enter');
  check(seen.join() === 'Escape', 'Enter in an open pop-up does not reach the default button');
  dialog.remove();

  // click outside dismisses; clicking the control again closes it
  down(s.el);
  check(s.isOpen, 'open again');
  down(document.body);
  check(!s.isOpen, 'click outside dismisses');
  down(s.el);
  down(s.el);
  check(!s.isOpen, 'clicking the control again closes it');

  // disabled control
  s.disabled = true;
  down(s.el);
  key(s.el, 'ArrowDown');
  check(!s.isOpen && s.el.getAttribute('aria-disabled') === 'true' && s.el.classList.contains('disabled') && s.el.tabIndex === -1, 'a disabled select does not open');
  s.disabled = false;

  // ---------------------------------------------------------------- long list: scrolls, stays inside the screen
  const sr = screen.getBoundingClientRect();
  const inside = (r: DOMRect) => r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5 && r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5;
  const L = mk(120, 40, long, 'v0');
  L.open();
  const lp = popup()!;
  check(lp.scrollHeight > lp.clientHeight, 'a long list scrolls');
  check(inside(lp.getBoundingClientRect()), 'long list inside the screen');
  key(L.el, 'End');
  check(lp.scrollTop > 0 && $('.msel-item.hot', lp)?.textContent === 'ITEM 59', 'End scrolls the last option into view');
  const hr = $('.msel-item.hot', lp)!.getBoundingClientRect();
  check(hr.bottom <= lp.getBoundingClientRect().bottom + 1 && hr.top >= lp.getBoundingClientRect().top - 1, 'the highlighted option is visible');
  key(L.el, 'Home');
  key(L.el, 'ArrowDown'); // v1 is disabled: Home lands on v0, ArrowDown skips to v2
  check($('.msel-item.hot', lp)?.textContent === 'ITEM 2', 'disabled options are skipped in a long list');
  L.close();

  // ---------------------------------------------------------------- edges: opens upwards at the bottom, shifts in from the right
  const H = screen.offsetHeight;
  const W = screen.offsetWidth;
  const bottom = mk(200, H - 18, long, 'v5');
  bottom.open();
  const bp = popup()!.getBoundingClientRect();
  const br = bottom.el.getBoundingClientRect();
  check(inside(bp), 'bottom: pop-up inside the screen');
  check(bp.bottom <= br.top + 1 / scale + 1, 'bottom: opens upwards, above its control');
  bottom.close();
  const right = mk(W - 40, 100, opts, 'a');
  right.open();
  check(inside(popup()!.getBoundingClientRect()), 'right edge: pop-up shifted inside the screen');
  const rr = popup()!.getBoundingClientRect();
  check(rr.width / scale >= 90 - 1, 'pop-up at least as wide as its control');
  right.close();
  const top = mk(200, 2, long, 'v5');
  top.open();
  const tp = popup()!.getBoundingClientRect();
  check(inside(tp) && tp.top >= top.el.getBoundingClientRect().bottom - 1, 'top: opens downwards inside the screen');
  top.close();
  for (const g of [s, L, bottom, right, top]) g.el.remove();

  // ---------------------------------------------------------------- the app's own selects keep their state and callbacks
  const tabEl = $$('.mtab').find((x) => x.textContent === 'ROLLS')!;
  tabEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  tabEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await tick();
  const speed = $('.gsel[aria-label="Roll speed"]')!;
  const before = app.recipe.rollSpeed;
  check(speed.textContent !== '', 'ROLLS SPEED shows the current speed');
  down(speed);
  const sp = $$('.msel-item', popup()!);
  const other = sp.find((i) => i.textContent !== speed.textContent)!;
  up(other);
  await tick();
  check(app.recipe.rollSpeed !== before && !popup(), 'choosing in the app changes the recipe through the same callback');
  const label = speed.textContent;
  app.setRecipe({ rollSpeed: before });
  await tick(100);
  check(speed.textContent !== label, 'the select follows the recipe when it changes elsewhere');

  const kits = $('.gsel[aria-label="Saved kits"]')!;
  check(kits.getAttribute('role') === 'listbox' && !kits.querySelector('select'), 'KITS list is a GEM list box');

  window.removeEventListener('keydown', spy);
  return 'passed';
}
