/**
 * Browser-only checks of Phase 17 in the real app (Chromium), invoked by phase17Browser.test.ts:
 * a click anywhere in a SNAP cell of the PATTERN grid places the hit in that cell (10% to 90% of
 * the cell, every SNAP including the triplets), the hover frame shows the same cell, a PAINT
 * choice is the sample a click places, and the TAKEAWAY name builder is two columns numbered
 * down each column (one column when narrow).
 */
import type { App } from '../src/app/app';
import { SNAPS } from '../src/app/app';
import { CATEGORIES, TPB, TPS } from '../src/engine/types';

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
const button = (label: string, root: ParentNode = document) => $$<HTMLButtonElement>('.mdialog .mbutton', root).find((b) => b.textContent === label)!;
const key = (k: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

export async function run(): Promise<string> {
  for (let i = 0; i < 100 && !(window as unknown as { breakery?: unknown }).breakery; i++) await tick(50);
  const app = (window as unknown as { breakery: { app: App } }).breakery.app;
  await wait(() => app.current.events.length, 'the first break');
  app.newPatch();
  app.setRecipe({ bars: 2 });
  app.clearPattern();
  await tick(20);
  check(app.current.events.length === 0, 'an empty pattern');

  // ---------------------------------------------------------------- the grid: the cell that contains the click
  const svg = $<SVGSVGElement>('svg.patternsvg')!;
  check(svg, 'the pattern grid');
  const r = svg.getBoundingClientRect();
  const w = Number(svg.getAttribute('width'));
  const scale = r.width / w;
  const cw = (w - 2) / (2 * 16);
  const row = CATEGORIES.indexOf('perc');
  const clientX = (t: number) => r.left + (1 + (t / TPS) * cw) * scale;
  const clientY = r.top + (10 + row * 14 + 7) * scale;
  const at = (type: string, t: number, buttons = 0) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: clientX(t), clientY, buttons }));
  const hover = $('.gridhover')!;
  const percAt = () => app.current.events.filter((e) => e.cat === 'perc').map((e) => e.bar * TPB + e.step * TPS + e.sub);
  let n = 0;
  for (const snap of SNAPS) {
    app.setSnap(snap);
    for (const start of [0, 5 * snap, TPB - snap, TPB, 2 * TPB - snap]) {
      for (const f of [0.1, 0.25, 0.49, 0.51, 0.75, 0.9]) {
        at('pointermove', start + f * snap);
        check(hover.style.display === 'block' && hover.dataset.cell === `perc|${start}`, `hover at ${f} of the ${snap}-tick cell at ${start}: ${hover.dataset.cell}`);
        at('pointerdown', start + f * snap, 1);
        at('pointerup', start + f * snap);
        const placed = percAt();
        check(placed.length === 1 && placed[0] === start, `click at ${f} of the ${snap}-tick cell at ${start} placed ${placed.join(',')}`);
        app.undo();
        check(percAt().length === 0, 'undo removes it');
        n++;
      }
    }
  }
  check(n === SNAPS.length * 30, `${n} clicks`);

  // ---------------------------------------------------------------- PAINT: the chosen sample is what a click places
  app.setSnap(12);
  const kit = app.ingredients.kit().perc;
  if (kit.length) {
    const id = kit[kit.length - 1]!;
    app.setPaint('perc', id);
    await tick(20);
    check($$('.label, div').some((l) => (l as HTMLElement).dataset.paint === id), 'the PERC row shows the PAINT choice');
    at('pointerdown', 3 * 12 + 2, 1);
    at('pointerup', 3 * 12 + 2);
    const e = app.current.events.find((x) => x.cat === 'perc');
    check(e?.sample === id && e.bar * TPB + e.step * TPS + e.sub === 36, `painted ${e?.sample} at ${e?.step}`);
    app.setPaint('perc', null);
  }

  // ---------------------------------------------------------------- TAKEAWAY: two columns, numbered down each column
  key('t');
  await wait(() => $('.mdialog')?.textContent?.includes('TAKEAWAY'), 'the TAKEAWAY dialog');
  const box = $('.mdialog')!;
  const rows = () => $$('[data-part]', box).map((x) => x.getBoundingClientRect());
  const cols = (rs: DOMRect[]) => [...new Set(rs.map((x) => Math.round(x.left)))];
  let rs = rows();
  check(rs.length === 7, `7 components (${rs.length})`);
  check(cols(rs).length === 2, `two columns (${cols(rs).join(',')})`);
  const left = Math.min(...rs.map((x) => x.left));
  const order = rs.map((x) => (Math.round(x.left) === Math.round(left) ? 0 : 1));
  check(order.join('') === '0000111', `1-4 left, 5-7 right (${order.join('')})`);
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6]] as const) check(rs[b]!.top > rs[a]!.top, `component ${b + 1} is under ${a + 1}`);
  check(Math.abs(rs[4]!.top - rs[0]!.top) < 1, '5 is level with 1');
  const nb = $('.namebox', box)!;
  nb.style.width = '240px';
  await tick(20);
  rs = rows();
  check(cols(rs).length === 1 && rs.every((x, i) => i === 0 || x.top > rs[i - 1]!.top), 'one column, in order, when narrow');
  nb.style.width = '';
  button('Cancel').click();
  return 'passed';
}
