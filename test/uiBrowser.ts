/** Browser-only checks of the interface (the real app in Chromium), invoked by ui.test.ts. */
import type { App } from '../src/app/app';
import { CATEGORIES } from '../src/engine/types';
import { STYLE_DEFS } from '../src/engine/styles';

const STYLE_LABELS = Object.fromEntries(Object.entries(STYLE_DEFS).map(([k, d]) => [k, d.label])) as Record<string, string>;

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];
const rect = (e: Element) => e.getBoundingClientRect();
const visible = (e: Element) => !!(e as HTMLElement).offsetParent;

function win(tabLabel: string): HTMLElement {
  const t = $$('.mtab').find((x) => x.textContent === tabLabel);
  check(t, `tab ${tabLabel}`);
  return t.closest('.mwin') as HTMLElement;
}
async function chooseTab(label: string): Promise<void> {
  const t = $$('.mtab').find((x) => x.textContent === label)!;
  t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await tick();
}
/** A pointer press (and release) on an element at a point in its own pixels, moving by dx, dy before release. */
async function press(target: Element, x: number, y: number, o: { shift?: boolean; button?: number; dx?: number; dy?: number } = {}): Promise<void> {
  const r = rect(target);
  const base = { bubbles: true, cancelable: true, pointerId: 1, button: o.button ?? 0, shiftKey: !!o.shift, clientX: r.left + x, clientY: r.top + y };
  target.dispatchEvent(new PointerEvent('pointerdown', base));
  if (o.dx || o.dy) for (let i = 1; i <= 4; i++) target.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: base.clientX + ((o.dx ?? 0) * i) / 4, clientY: base.clientY + ((o.dy ?? 0) * i) / 4 }));
  target.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: base.clientX + (o.dx ?? 0), clientY: base.clientY + (o.dy ?? 0) }));
  await new Promise((r) => setTimeout(r, 5)); // the gesture closes after the release (main.ts)
}

export async function run(): Promise<string> {
  for (let i = 0; i < 100 && !(window as unknown as { breakery?: unknown }).breakery; i++) await new Promise((r) => setTimeout(r, 50));
  const app = (window as unknown as { breakery: { app: App } }).breakery.app;
  const scale = rect($('#screen')!).width / 880;
  const px = (n: number) => n * scale; // logical pixels → CSS pixels

  // ---------------------------------------------------------------- one tab system
  const groups = [['INGREDIENTS', 'KITS'], ['RECIPE', 'ROLLS', 'MUTATE'], ['PATTERN', 'MIXER', 'BATCH', 'OUTPUT']];
  const tabs = $$('.mtab');
  check(tabs.length === 9, `9 tabs, got ${tabs.length}`);
  for (const g of groups) {
    const bar = win(g[0]!).querySelector('.titlebar')!;
    check(JSON.stringify($$('.mtab', bar).map((t) => t.textContent)) === JSON.stringify(g), `tab group ${g}`);
  }
  const h0 = rect(tabs[0]!).height;
  const font = getComputedStyle(tabs[0]!).fontFamily;
  for (const t of tabs) {
    const cs = getComputedStyle(t);
    check(Math.abs(rect(t).height - h0) < 0.5 && cs.fontFamily === font && cs.borderRadius === '0px', `tab ${t.textContent} geometry`);
  }
  check(!$$('.mbutton, .btn').some((b) => visible(b) && parseFloat(getComputedStyle(b).borderRadius) > 0), 'no rounded buttons');

  // BATCH is a lower tab: PATTERN is the default, and tab switches keep the batch
  check(win('PATTERN').querySelector('.mtab.active, .mtab[aria-selected="true"]')?.textContent === 'PATTERN', 'PATTERN is the default tab');
  app.bakeBatch();
  const seeds = JSON.stringify(app.batch.map((c) => c.seeds));
  await chooseTab('BATCH');
  const cands = $$('.candidate').filter(visible);
  check(cands.length === 8, `8 candidates visible, got ${cands.length}`);
  check(rect(cands[0]!).width > px(120), 'candidates are wide');
  await chooseTab('MIXER');
  await chooseTab('PATTERN');
  check(JSON.stringify(app.batch.map((c) => c.seeds)) === seeds, 'batch kept across tabs');

  // tab switching keeps state and does not touch playback
  const before = JSON.stringify(app.current.events);
  const recipe = JSON.stringify(app.recipe);
  for (const t of ['ROLLS', 'MUTATE', 'RECIPE', 'KITS', 'INGREDIENTS', 'MIXER', 'OUTPUT', 'PATTERN']) {
    await chooseTab(t);
    const tab = $$('.mtab').find((x) => x.textContent === t)!;
    check(tab.classList.contains('on') && tab.getAttribute('aria-selected') === 'true', `${t} selected`);
    const panes = $$('.pane', tab.closest('.mwin')!);
    check(panes.filter((p) => !p.hidden).length === 1, `${t}: one pane shown`);
  }
  check(JSON.stringify(app.current.events) === before && JSON.stringify(app.recipe) === recipe, 'tab switching changes nothing');
  check(!$$('.mwin .btn').some((b) => /^MUT$/.test(b.textContent ?? '')), 'no MUT button left in RECIPE');

  // RECIPE tab: ENGINE is its own labelled row (a generator, not a recipe); RANDOM RECIPE sits with the recipes
  await chooseTab('RECIPE');
  const recipeWin = win('RECIPE');
  const rbtn = (t: string) => $$('.btn', recipeWin).find((b) => b.textContent === t)!;
  const engines = ['ENGINE 1', 'ENGINE 2'].map(rbtn);
  check(engines.every(Boolean) && rbtn('RANDOM'), 'ENGINE 1, ENGINE 2 and RANDOM buttons in RECIPE');
  check($$('.label.head', recipeWin).some((l) => l.textContent === 'ENGINE'), 'an ENGINE heading');
  check(rect(engines[0]!).top > rect(rbtn('RANDOM')).bottom && rect(engines[0]!).top > rect($$('.btn', recipeWin).find((b) => b.textContent === 'DICE')!).bottom, 'ENGINE sits in its own row below the recipes and the BPM row');
  check(engines[1]!.classList.contains('on') && !engines[0]!.classList.contains('on'), 'ENGINE 2 shown selected');
  check(!$$('.btn', recipeWin).some((b) => b.textContent === 'ENGINE' || b.textContent === 'ENGINE 3'), 'no engine button posing as a recipe');
  const wr = rect(recipeWin);
  for (const b of $$('.btn, .label, .range', recipeWin).filter(visible)) check(rect(b).right <= wr.right + 1 && rect(b).left >= wr.left - 1 && rect(b).bottom <= wr.bottom + 1, `${b.textContent} inside the RECIPE window`);
  const btns = $$('.btn', recipeWin).filter(visible).map((b) => [b, rect(b)] as const);
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i]![1], c = btns[j]![1];
    check(a.right <= c.left + 0.5 || c.right <= a.left + 0.5 || a.bottom <= c.top + 0.5 || c.bottom <= a.top + 0.5, `${btns[i]![0].textContent} overlaps ${btns[j]![0].textContent}`);
  }
  const styleBefore = app.recipe.style;
  rbtn('RANDOM').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  await tick();
  check(app.recipe.style !== styleBefore && app.recipe.engine === 2, 'RANDOM RECIPE chose another recipe and kept ENGINE 2');
  check($$('.btn.on', recipeWin).some((b) => b.textContent === (STYLE_LABELS[app.recipe.style])), 'the chosen recipe is shown selected');
  app.undo();
  await tick();
  check(app.recipe.style === styleBefore, 'RANDOM RECIPE undone');

  // ---------------------------------------------------------------- mixer layout and controls
  await chooseTab('MIXER');
  const grid = $('.mixgrid')!;
  const pane = grid.closest('.pane')!;
  const cells = [...grid.children] as HTMLElement[];
  const rows: HTMLElement[][] = [];
  for (let i = 6; i < 6 + CATEGORIES.length * 6; i += 6) rows.push(cells.slice(i, i + 6));
  check(rows.length === CATEGORIES.length && rows.every((r) => r.length === 6), 'eleven rows of six cells');
  const lefts = rows[0]!.map((c) => rect(c).left);
  const heads = cells.slice(0, 6).map((c) => rect(c).left);
  rows.forEach((r, i) => {
    const mid = (e: Element) => rect(e).top + rect(e).height / 2;
    const m0 = mid(r[1]!);
    r.forEach((c, j) => {
      check(Math.abs(rect(c).left - lefts[j]!) < 0.5, `row ${i} column ${j} aligned`);
      check(Math.abs(mid(c) - m0) < px(1), `row ${i} column ${j} centred`);
    });
    if (i) check(Math.abs(rect(r[0]!).top - rect(rows[i - 1]![0]!).top - (rect(rows[1]![0]!).top - rect(rows[0]![0]!).top)) < 0.5, `row ${i} spacing`);
  });
  heads.forEach((x, j) => check(Math.abs(x - lefts[j]!) < 0.5, `heading ${j} aligned`));
  const pr = rect(pane);
  for (const c of cells) check(rect(c).right <= pr.right + 0.5 && rect(c).bottom <= pr.bottom + 0.5, 'mixer inside its pane');
  // the master: below the channels, its level under the channel levels
  const masterLevel = grid.querySelectorAll('.range')[CATEGORIES.length * 2]!;
  check(rect(masterLevel).top > rect(rows.at(-1)![1]!).bottom && Math.abs(rect(masterLevel.parentElement!).left - lefts[1]!) < 0.5, 'master aligned under LEVEL');
  // controls work
  const [, levelCell, , muteCell, soloCell] = rows[0]!;
  await press(levelCell!.firstElementChild!, rect(levelCell!).width * 0.25, rect(levelCell!).height / 2);
  check(app.mix.kick.gain < 0.6 && app.mix.kick.gain > 0.2, `kick level follows the bar: ${app.mix.kick.gain}`);
  await press(muteCell!.firstElementChild!, 4, 4);
  check(app.mix.kick.mute && !app.audible('kick'), 'MUTE');
  await press(rows[1]![4]!.firstElementChild!, 4, 4);
  await press(rows[6]![4]!.firstElementChild!, 4, 4);
  check(app.mix.snare.solo && app.mix.hat.solo && app.audible('snare') && app.audible('hat') && !app.audible('ghost'), 'several SOLOs');
  check(soloCell!.firstElementChild!.getAttribute('aria-pressed') !== 'true', 'kick not soloed');
  app.clearMix();
  app.setChannel('kick', 1, 0);

  // ---------------------------------------------------------------- grid: click toggles, shift+click selects, drag moves
  await chooseTab('PATTERN');
  app.setStyle('funk');
  app.setRecipe({ bars: 2 });
  const svg = $<SVGSVGElement>('.patternsvg')!;
  const perc = CATEGORIES.indexOf('perc');
  const RH = 14;
  const TOP = 10;
  const rowY = (row: number) => px(TOP + row * RH + RH / 2);
  const stepX = (step: number) => px(1 + (step + 0.25) * (rect(svg).width / scale - 2) / (2 * 16));
  const free = [...Array(32).keys()].find((s) => !app.current.events.some((e) => e.cat === 'perc' && e.bar * 16 + e.step === s))!;
  const n0 = app.current.events.length;
  await press(svg, stepX(free), rowY(perc));
  check(app.current.events.length === n0 + 1, 'click on an empty place adds a hit');
  await press(svg, stepX(free), rowY(perc));
  check(app.current.events.length === n0, 'click on a hit deletes it');
  app.undo();
  check(app.current.events.length === n0 + 1, 'undo brings it back');
  const added = app.current.events.find((e) => e.cat === 'perc' && e.bar * 16 + e.step === free)!;
  app.select(null);
  await press(svg, stepX(free), rowY(perc), { shift: true });
  check(app.selected === added.ref && app.current.events.length === n0 + 1, 'shift+click selects and keeps the hit');
  // a small wobble is still a click (it toggles, it does not move)
  await press(svg, stepX(free), rowY(perc), { dx: px(2) });
  check(!app.current.events.some((e) => e.cat === 'perc' && e.bar * 16 + e.step === free) && app.current.events.length === n0, 'a click with a 2px wobble deletes, not moves');
  app.undo();
  // a deliberate drag moves it and keeps it
  const target = [...Array(32).keys()].find((s) => s > free + 2 && !app.current.events.some((e) => e.cat === 'perc' && e.bar * 16 + e.step === s));
  if (target !== undefined) {
    await press(svg, stepX(free), rowY(perc), { dx: stepX(target) - stepX(free) });
    check(app.current.events.some((e) => e.cat === 'perc' && e.bar * 16 + e.step === target) && !app.current.events.some((e) => e.cat === 'perc' && e.bar * 16 + e.step === free), 'a drag moves the hit');
    check(app.current.events.length === n0 + 1, 'a drag does not delete');
  }
  check($('.patternsvg')!.closest('.pane')!.textContent!.includes('CLICK: TOGGLE'), 'instructions near the grid');

  // ---------------------------------------------------------------- rolls: grouped, expanded, edited one by one
  app.setStyle('breakcore');
  app.setRecipe({ bars: 8, rolls: 1, rollSpeed: '64', rollPlace: 'anywhere', rollTargets: ['snare', 'hat', 'kick'] });
  await tick();
  const g = $$('.rollgroup');
  check(g.length > 0, 'dense rolls drawn as groups at eight bars');
  const gr = rect(g[0]!);
  await press(svg, gr.left - rect(svg).left + gr.width / 2, gr.top - rect(svg).top + gr.height / 2);
  check(/expanded/.test(app.status), `a click expands a grouped roll: ${app.status}`);
  const rollRects = $$('rect.hit', svg).filter((r) => r.getAttribute('fill') === 'url(#rollfill)');
  check(rollRects.length > 0, 'roll hits drawn one by one after expanding');
  const rr = rect(rollRects[0]!);
  await press(svg, rr.left - rect(svg).left + rr.width / 2, rr.top - rect(svg).top + rr.height - 1, { shift: true });
  const sel = app.selectedEvent;
  check(sel && sel.role === 'roll', 'shift+click selects one roll hit');
  app.setHitVelocity(5);
  check(app.selectedEvent?.vel === 5, 'a roll hit has its own velocity');
  const rolls0 = app.rollCount.hits;
  app.deleteHit();
  check(app.rollCount.hits === rolls0 - 1, 'a roll hit deletes on its own');
  return 'passed';
}
