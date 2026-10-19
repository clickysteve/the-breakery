/**
 * Browser-only checks of Phase 16 in the real app (Chromium), invoked by phase16Browser.test.ts:
 * the CHOP tab's ENABLED works on a hand-edited four-bar groove (it used to be greyed out), the
 * ROLLS tab applies the observed settings without BAKE and says what is in the pattern, RE-ROLL
 * is a button in the tab, and every press is one undo step.
 */
import type { App } from '../src/app/app';
import { TPB, TPS } from '../src/engine/types';

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
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
const tab = (name: string) => $$('.mtab').find((t) => t.textContent === name)!;
const pane = (name: string) => $$(`.pane[aria-label="${name}"]`)[0]!;
const btn = (root: ParentNode, text: RegExp) => $$('.btn', root).find((b) => text.test(b.textContent ?? ''))!;
const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;

export async function run(): Promise<string> {
  for (let i = 0; i < 100 && !(window as unknown as { breakery?: unknown }).breakery; i++) await tick(50);
  const app = (window as unknown as { breakery: { app: App } }).breakery.app;
  await wait(() => app.current.events.length, 'the first break');
  app.newPatch();
  app.setRecipe({ bars: 4 });
  const seeds = JSON.stringify(app.seeds);

  // ---------------------------------------------------------------- CHOP: OFF at 54% / SMALL / 39%, a hand edit, then ENABLED from the tab
  app.setChop({ on: false, amount: 0.54, slice: 'small', retrigger: 0.39 });
  const free = [1, 3, 5, 7, 9, 11, 13, 15].find((s) => !app.current.events.some((e) => e.cat === 'perc' && e.bar === 1 && e.step === s))!;
  app.addHit('perc', TPB + free * TPS);
  check(app.hasEdits, 'a hand edit');
  press(tab('CHOP'));
  await tick(20);
  const chop = pane('CHOP');
  const enable = btn(chop, /^(ENABLED|DISABLED)$/);
  const label = (): string => enable.textContent ?? '';
  check(label() === 'DISABLED' && !enable.classList.contains('disabled'), `CHOP ENABLED is available (${enable.className})`);
  const groove = JSON.stringify(app.current.events);
  const depth = () => (app as unknown as { undoStack: string[] }).undoStack.length;
  let d = depth();
  press(enable);
  await wait(() => app.chop.on, 'CHOP on');
  await tick(700); // the press's gesture settles into one undo step
  check(label() === 'ENABLED' && app.chopped && JSON.stringify(app.current.events) !== groove, 'CHOP transforms the current groove');
  check(JSON.stringify(app.seeds) === seeds, 'no BAKE: the seeds are the same');
  check(depth() === d + 1, `one undo step (${depth() - d})`);
  const reChop = btn(chop, /^RE-CHOP$/);
  check(!reChop.classList.contains('disabled'), 'RE-CHOP is available');
  const first = JSON.stringify(app.current.events);
  press(reChop);
  await wait(() => JSON.stringify(app.current.events) !== first, 'RE-CHOP');
  press(enable);
  await wait(() => !app.chop.on, 'CHOP off');
  check(JSON.stringify(app.current.events) === groove, 'off gives the groove back exactly');

  // ---------------------------------------------------------------- ROLLS: the observed settings, ENABLED from the tab, then RE-ROLL
  press(tab('ROLLS'));
  await tick(20);
  const rolls = pane('ROLLS');
  app.setRolls({ rolls: 0.93, rollLength: 3, rollSpeed: '32', rollDynamics: 'alternating', rollPlace: 'phrase', rollTargets: ['snare'] });
  if (app.rollGeneration) app.setRollsOn(false);
  await tick(20);
  const status = () => $$('.label', rolls).map((l) => l.textContent ?? '').find((t) => /ROLL/.test(t) && /·/.test(t)) ?? '';
  check(/^ROLL GENERATION OFF · /.test(status()), `off: ${status()}`);
  const reroll = btn(rolls, /^RE-ROLL$/);
  check(reroll && reroll.classList.contains('disabled'), 'RE-ROLL waits for ROLL GENERATION');
  check(inside(reroll.getBoundingClientRect(), rolls.getBoundingClientRect()), 'RE-ROLL is inside the ROLLS tab');
  const rollOn = btn(rolls, /^(ENABLED|DISABLED)$/);
  press(rollOn);
  await wait(() => app.rollGeneration, 'ROLL GENERATION on');
  await tick(700);
  check(/^(\d+ ROLLS? · \d+ RETRIGGERS?|0 ROLLS · .+)/.test(status()), `on: ${status()}`);
  check(JSON.stringify(app.seeds) === seeds, 'still no BAKE');
  check(!reroll.classList.contains('disabled'), 'RE-ROLL is available');
  const take = app.recipe.rollTake ?? 0;
  d = depth();
  press(reroll);
  await wait(() => (app.recipe.rollTake ?? 0) > take, 'RE-ROLL');
  await tick(700);
  check(depth() === d + 1, `RE-ROLL is one undo step (${depth() - d})`);
  check(JSON.stringify(app.seeds) === seeds, 'RE-ROLL is not BAKE');
  app.undo();
  check((app.recipe.rollTake ?? 0) === take, 'undo returns to the previous take');
  return 'passed';
}
