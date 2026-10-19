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
  const groups = [['INGREDIENTS', 'KITS', 'LIBRARY'], ['RECIPE', 'CYMBALS', 'PERSONALITY', 'CHOP', 'ROLLS', 'DESTROY', 'MUTATE'], ['PATTERN', 'MIXER', 'BATCH', 'OUTPUT']];
  const tabs = $$('.mtab');
  check(tabs.length === 14, `14 tabs, got ${tabs.length}`);
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
  for (const t of ['CYMBALS', 'PERSONALITY', 'CHOP', 'ROLLS', 'MUTATE', 'RECIPE', 'KITS', 'INGREDIENTS', 'MIXER', 'OUTPUT', 'PATTERN']) {
    await chooseTab(t);
    const tab = $$('.mtab').find((x) => x.textContent === t)!;
    check(tab.classList.contains('on') && tab.getAttribute('aria-selected') === 'true', `${t} selected`);
    const panes = $$('.pane', tab.closest('.mwin')!);
    check(panes.filter((p) => !p.hidden).length === 1, `${t}: one pane shown`);
  }
  check(JSON.stringify(app.current.events) === before && JSON.stringify(app.recipe) === recipe, 'tab switching changes nothing');
  check(!$$('.mwin .btn').some((b) => /^MUT$/.test(b.textContent ?? '')), 'no MUT button left in RECIPE');

  // RECIPE tab: no GROOVE selector (GROOVE is the only generator); CHOP and ROLL GENERATION have their own row; no ENGINE selector; RANDOM RECIPE sits with the recipes
  await chooseTab('RECIPE');
  const recipeWin = win('RECIPE');
  const rbtn = (t: string) => $$('.btn', recipeWin).find((b) => b.textContent === t)!;
  const wr0 = () => rect(recipeWin);
  check(!$$('.btn', recipeWin).some((b) => b.textContent === 'GROOVE') && !$$('.label.head', recipeWin).some((l) => l.textContent === 'GENERATE'), 'no GROOVE selector and no GENERATE heading');
  check(rbtn('CHOP OFF') && rbtn('ROLLS OFF') && rbtn('RANDOM'), 'CHOP, ROLLS and RANDOM buttons in RECIPE');
  check(!app.rollGeneration && app.recipe.rollsOn === false && !app.current.events.some((e) => e.role === 'roll'), 'a new user: ROLL GENERATION off, and the break has no rolls');
  check(rect(rbtn('CHOP OFF')).top > rect(rbtn('RANDOM')).bottom && rect(rbtn('CHOP OFF')).top > rect($$('.btn', recipeWin).find((b) => b.textContent === 'DICE')!).bottom && Math.abs(rect(rbtn('CHOP OFF')).top - rect(rbtn('ROLLS OFF')).top) < 1, 'CHOP and ROLLS sit in their own row below the recipes and the BPM row');
  check(!$$('.btn').some((b) => /^ENGINE \d/.test(b.textContent ?? '')), 'no ENGINE 1 / ENGINE 2 selector anywhere');
  check(!visible(rbtn('USE GROOVE')), 'USE GROOVE only for LEGACY breaks');
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

  // Phase 13: TEMPO LOCK and the tempo DICE on the BPM row, the cymbals button opens CYMBALS, WILDCARD beside BAKE
  const down = (b: Element) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  check(visible(rbtn('LOCK')) && visible(rbtn('RND')), 'LOCK and RND on the BPM row');
  check(!app.tempoLock && !rbtn('LOCK').classList.contains('on') && !rbtn('RND').classList.contains('disabled'), 'TEMPO LOCK starts off');
  const bpm0 = app.recipe.bpm;
  const ev0 = JSON.stringify(app.current.events.map((e) => [e.cat, e.step, e.sub]));
  down(rbtn('RND'));
  await tick();
  check(app.recipe.bpm !== bpm0 && JSON.stringify(app.current.events.map((e) => [e.cat, e.step, e.sub])) === ev0, 'the tempo DICE changes the tempo, not the pattern');
  down(rbtn('LOCK'));
  await tick();
  const locked = app.recipe.bpm;
  check(app.tempoLock && rbtn('LOCK').classList.contains('on') && rbtn('RND').classList.contains('disabled'), 'TEMPO LOCK on: the tempo DICE is disabled');
  down(rbtn(STYLE_LABELS[app.recipe.style === 'dnb' ? 'funk' : 'dnb']!));
  await tick();
  check(app.recipe.bpm === locked, 'TEMPO LOCK keeps the tempo through a recipe change');
  down(rbtn('LOCK'));
  await tick();
  check(!app.tempoLock, 'TEMPO LOCK off again');
  app.undo();
  app.undo();
  await tick();
  check(app.recipe.style === styleBefore && app.recipe.bpm === bpm0, 'the recipe change and the tempo DICE are undo steps (TEMPO LOCK is not)');
  const cym = $$('.btn', recipeWin).find((b) => /^HAT \d+ OPN \d+ RDE \d+$/.test(b.textContent ?? ''));
  check(cym && visible(cym), 'the HATS · RIDE button in the CHOP and ROLLS row');
  down(cym!);
  await tick();
  check($$('.mtab').find((x) => x.textContent === 'CYMBALS')!.classList.contains('on'), 'it opens the CYMBALS tab');
  const cymPane = $$('.pane', recipeWin).find((p) => !p.hidden)!;
  check(['Closed hat activity', 'Open hat activity', 'Ride activity', 'Crash activity'].every((a) => cymPane.querySelector(`[aria-label="${a}"]`)), 'CLOSED HAT, OPEN HAT, RIDE and CRASH ACTIVITY bars');
  check(['AUTO', '1/4', '1/8', '1/16', '1/32', 'TRIPLET'].every((t) => $$('.btn', cymPane).some((b) => b.textContent === t && visible(b))), 'the SUBDIVISION buttons');
  check(['ACCENT', 'INDEPENDENT', 'ALTERNATE', 'LAYER', 'EXCLUSIVE', 'CALL & RESP'].every((t) => $$('.btn', cymPane).some((b) => b.textContent === t && visible(b))), 'the six PRIMARY RELATIONSHIP buttons');
  check($$('.btn.on', cymPane).filter((b) => b.textContent === 'ACCENT').length === 2, 'ACCENT is the default primary and open/closed relationship');
  check($$('.btn', cymPane).some((b) => b.textContent === 'CHOKE ON' && b.classList.contains('on')), 'OPEN-HAT CHOKE on by default');
  check(/HATS .* ON /.test(cymPane.textContent ?? '') && /CLOSED \d+/.test(cymPane.textContent ?? ''), 'the CYMBALS tab shows what this break chose and plays');
  for (const b of $$('.btn, .label, .range', cymPane).filter(visible)) check(rect(b).right <= wr.right + 1 && rect(b).bottom <= wr.bottom + 1, `${b.textContent} inside the CYMBALS tab`);
  app.setCym({ closed: 0, open: 0, ride: 0, crash: 0 });
  await tick();
  check(!app.current.events.some((e) => e.cat === 'hat' || e.cat === 'open' || e.cat === 'ride' || e.cat === 'crash'), 'activity 0: no cymbals at all');
  app.undo();
  await tick();
  await chooseTab('RECIPE');
  const bakeWin = $$('.mwin').find((w) => $$('.btn', w).some((b) => b.textContent === 'BAKE'))!;
  const bakeBtn = $$('.btn', bakeWin).find((b) => b.textContent === 'BAKE')!;
  const wildBtn = $$('.btn', bakeWin).find((b) => b.textContent === 'WILDCARD');
  check(wildBtn && visible(wildBtn) && Math.abs(rect(wildBtn).top - rect(bakeBtn).top) < 1 && rect(wildBtn).left >= rect(bakeBtn).right - 0.5 && rect(wildBtn).right <= rect(bakeWin).right + 1, 'WILDCARD sits beside BAKE');
  check(wildBtn!.scrollWidth <= wildBtn!.clientWidth + 1, 'the WILDCARD label fits');
  const wildBefore = JSON.stringify(app.recipe);
  down(wildBtn!);
  await tick();
  check(JSON.stringify(app.recipe) !== wildBefore && /^WILDCARD/.test(app.status), 'WILDCARD made a new break');
  app.undo();
  await tick();
  check(JSON.stringify(app.recipe) === wildBefore, 'one undo step undoes WILDCARD');

  // CHOP tab: the CHOP button opens it; ENABLED, AMOUNT, SLICE SIZE and RETRIGGER chop the same GROOVE; one undo step each
  const groove = JSON.stringify(app.current.events);
  const grooveSeeds = JSON.stringify(app.seeds);
  await press(rbtn('CHOP OFF'), 3, 3);
  check(recipeWin.querySelector('.mtab.on')?.textContent === 'CHOP', 'the CHOP button opens the CHOP tab');
  const cbtn = (t: string) => $$('.btn', recipeWin).filter(visible).find((b) => b.textContent === t)!;
  for (const t of ['DISABLED', 'RE-CHOP', 'LARGE', 'MEDIUM', 'SMALL', 'MICRO']) check(cbtn(t), `CHOP tab: ${t}`);
  check($$('.range', recipeWin).filter(visible).length === 2, 'CHOP tab: AMOUNT and RETRIGGER range bars (DESTROY has its own tab)');
  check($$('.label', recipeWin).filter(visible).some((l) => l.textContent === 'PATTERN = GROOVE'), 'CHOP tab: the state (the flow is in the report\'s tooltip since DESTROY took its row)');
  await press(cbtn('DISABLED'), 3, 3);
  check(app.chopped && JSON.stringify(app.current.events) !== groove && JSON.stringify(app.seeds) === grooveSeeds, 'ENABLED chops the same GROOVE (same seeds)');
  check(cbtn('ENABLED')?.classList.contains('on'), 'ENABLED shown on');
  await press(cbtn('MICRO'), 3, 3);
  check(app.chop.slice === 'micro' && cbtn('MICRO').classList.contains('on'), 'SLICE SIZE MICRO');
  for (const b of $$('.btn, .label, .range', recipeWin).filter(visible)) check(rect(b).right <= wr.right + 1 && rect(b).left >= wr.left - 1 && rect(b).bottom <= wr.bottom + 1, `${b.textContent} inside the RECIPE window (CHOP)`);
  const cb = $$('.btn, .range', recipeWin).filter(visible).map((b) => [b, rect(b)] as const);
  for (let i = 0; i < cb.length; i++) for (let j = i + 1; j < cb.length; j++) {
    const a = cb[i]![1], c = cb[j]![1];
    check(a.right <= c.left + 0.5 || c.right <= a.left + 0.5 || a.bottom <= c.top + 0.5 || c.bottom <= a.top + 0.5, `CHOP: ${cb[i]![0].textContent} overlaps ${cb[j]![0].textContent}`);
  }
  app.undo();
  app.undo();
  await tick();
  check(!app.chopped && JSON.stringify(app.current.events) === groove, 'CHOP undone back to the GROOVE');
  await chooseTab('RECIPE');

  // DESTROY tab: off by default; ENABLED destroys the same GROOVE (same seeds); one undo step
  await chooseTab('DESTROY');
  const dbtn = (t: string) => $$('.btn', recipeWin).filter(visible).find((b) => b.textContent === t)!;
  for (const t of ['DISABLED', 'RE-DESTROY', 'CHAOS', 'STUTTER', 'PITCH', 'REVERSE', 'GATE', 'TAPE STOP']) check(dbtn(t), `DESTROY tab: ${t}`);
  check(recipeWin.querySelector('[aria-label="Destroy master amount"]') && recipeWin.querySelector('[aria-label="Effect probability"]'), 'DESTROY tab: MASTER AMOUNT and PROBABILITY');
  check(recipeWin.querySelectorAll('[aria-label$=" on kick"]').length === 5, 'DESTROY tab: a matrix row of five effects for the kick');
  const preDestroy = JSON.stringify(app.current.events);
  await press(dbtn('DISABLED'), 3, 3);
  check(app.destroy2.on && JSON.stringify(app.seeds) === grooveSeeds, 'DESTROY enabled on the same seeds');
  check(JSON.stringify(app.current.events) !== preDestroy, 'DESTROY changed the events');
  for (const b of $$('.btn, .label, .range', recipeWin).filter(visible)) check(rect(b).right <= wr.right + 1 && rect(b).left >= wr.left - 1 && rect(b).bottom <= wr.bottom + 1, `${b.textContent} inside the RECIPE window (DESTROY)`);
  app.undo();
  await tick();
  check(!app.destroy2.on && JSON.stringify(app.current.events) === preDestroy, 'one undo step turns DESTROY off');
  await chooseTab('RECIPE');

  // ROLL GENERATION: the ROLLS button opens its tab; the switch is the user's, kept through recipe changes
  await press(rbtn('ROLLS OFF'), 3, 3);
  check(recipeWin.querySelector('.mtab.on')?.textContent === 'ROLLS', 'the ROLLS button opens the ROLLS tab');
  const lbtn = (t: string) => $$('.btn', recipeWin).filter(visible).find((b) => b.textContent === t)!;
  check(lbtn('DISABLED') && !lbtn('DISABLED').classList.contains('on'), 'ROLLS tab: generation shown off');
  await press(lbtn('DISABLED'), 3, 3);
  check(app.rollGeneration && app.recipe.rollsOn !== false && lbtn('ENABLED')?.classList.contains('on'), 'ROLL GENERATION switched on');
  await chooseTab('RECIPE');
  for (const s of ['HIP-HOP', 'ELECTRO', 'BROKEN', 'FUNK']) {
    await press(rbtn(s), 3, 3);
    check(app.rollGeneration && app.recipe.rollsOn !== false && rbtn('ROLLS ON')?.classList.contains('on'), `${s}: roll generation still on`);
  }
  await press(rbtn('ROLLS ON'), 3, 3);
  await press(lbtn('ENABLED'), 3, 3);
  await chooseTab('RECIPE');
  for (const s of ['HIP-HOP', 'ELECTRO', 'BROKEN', 'FUNK']) {
    await press(rbtn(s), 3, 3);
    check(!app.rollGeneration && app.recipe.rollsOn === false && !!rbtn('ROLLS OFF') && !app.current.events.some((e) => e.role === 'roll' && !e.manual), `${s}: roll generation still off, no new rolls`);
  }
  for (const b of $$('.btn, .label, .range', recipeWin).filter(visible)) check(rect(b).right <= wr0().right + 1 && rect(b).left >= wr0().left - 1, `${b.textContent} inside the RECIPE window (after the roll checks)`);
  if (app.hasEdits) app.revertAll();
  await tick();

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
  await press(rows[CATEGORIES.indexOf('hat')]![4]!.firstElementChild!, 4, 4);
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
  // Phase 15: the instructions moved behind [?] HELP beside the grid
  check(!$('.patternsvg')!.closest('.pane')!.textContent!.includes('CLICK: TOGGLE') && [...$('.patternsvg')!.closest('.pane')!.querySelectorAll('.btn')].some((x) => x.textContent === '?' && x.getAttribute('aria-label') === 'Pattern editing help'), 'editing help one click from the grid');

  // ---------------------------------------------------------------- rolls: grouped, expanded, edited one by one
  app.setRollsOn(true);
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
  // ---------------------------------------------------------------- Space toggles playback from any non-text control
  {
    const { player } = (window as unknown as { breakery: { player: { playing: boolean; stop(): void } } }).breakery;
    const space = async (target: Element, o: KeyboardEventInit = {}) => {
      (target as HTMLElement).focus?.();
      const ev = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true, ...o });
      target.dispatchEvent(ev);
      for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 25));
      return ev;
    };
    if (player.playing) player.stop();
    const btn = $$('.btn').find((b) => visible(b))!;
    const ev1 = await space(btn);
    check(ev1.defaultPrevented && player.playing, 'Space starts playback from a focused button');
    await chooseTab('MIXER');
    await space($$('.mtab').find((x) => x.textContent === 'PATTERN')!);
    check(!player.playing, 'Space stops playback from a focused tab after switching tabs');
    const slider = $$('.range, [role="slider"]').find((b) => visible(b));
    if (slider) {
      await space(slider);
      check(player.playing, 'Space starts playback from a focused slider');
      await space(slider, { repeat: true });
      check(player.playing, 'a held Space does not toggle');
      await space(slider, { shiftKey: true });
      check(player.playing, 'Shift+Space does not toggle');
      await space(slider);
      check(!player.playing, 'Space stops playback from a slider');
    }
    const box = document.createElement('input');
    box.type = 'text';
    document.body.appendChild(box);
    const ev2 = await space(box);
    check(!ev2.defaultPrevented && !player.playing, 'Space in a text field is left to the field');
    box.remove();
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    document.body.appendChild(cb);
    await space(cb);
    check(player.playing, 'Space starts playback from a focused checkbox');
    await space(document.body);
    check(!player.playing, 'Space stops playback from an empty area');
    cb.remove();
  }

  return 'passed';
}
