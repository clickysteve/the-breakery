import { describe, expect, it } from 'vitest';
import { firstEnabled, lastEnabled, nextEnabled, placeHorizontal, placeVertical, type GemOption } from '../src/ui/gemSelect';
import { isTextEntry, isTransportKey } from '../src/ui/transportKey';
import { hasChrome, inChromium } from './chromium';

const o = (...disabled: boolean[]): GemOption[] => disabled.map((d, i) => ({ value: String(i), label: `O${i}`, disabled: d }));

describe('GEM select helpers', () => {
  it('moves over enabled options only, without wrapping', () => {
    const opts = o(false, true, false, true, true, false);
    expect(nextEnabled(opts, 0, 1)).toBe(2);
    expect(nextEnabled(opts, 2, 1)).toBe(5);
    expect(nextEnabled(opts, 5, 1)).toBe(5);
    expect(nextEnabled(opts, 5, -1)).toBe(2);
    expect(nextEnabled(opts, 0, -1)).toBe(0);
    expect(firstEnabled(o(true, false, false))).toBe(1);
    expect(lastEnabled(o(false, false, true))).toBe(1);
    expect(firstEnabled(o(true, true))).toBe(-1);
  });
  it('places the pop-up below, above, or on the roomier side, shortened to fit', () => {
    expect(placeVertical(20, 34, 100, 400)).toMatchObject({ y: 34, above: false, maxHeight: 100 });
    expect(placeVertical(360, 374, 100, 400)).toMatchObject({ y: 260, above: true, maxHeight: 100 });
    const tall = placeVertical(360, 374, 500, 400);
    expect(tall.above).toBe(true);
    expect(tall.y).toBeGreaterThanOrEqual(0);
    expect(tall.y + tall.maxHeight).toBeLessThanOrEqual(360);
    const tallTop = placeVertical(20, 34, 500, 400);
    expect(tallTop.above).toBe(false);
    expect(34 + tallTop.maxHeight).toBeLessThanOrEqual(400);
  });
  it('keeps the pop-up inside the screen horizontally', () => {
    expect(placeHorizontal(10, 100, 880)).toBe(10);
    expect(placeHorizontal(850, 100, 880)).toBe(778);
    expect(placeHorizontal(-5, 100, 880)).toBe(2);
  });
  it('owns Space: a focused GEM select or list is not a transport trigger', () => {
    const within = (role: string) => ({ tagName: 'DIV', isContentEditable: false, closest: (s: string) => (s.includes(`role="${role}"`) ? {} : null) });
    for (const role of ['combobox', 'listbox']) {
      expect(isTextEntry(within(role))).toBe(true);
      expect(isTransportKey({ key: ' ', code: 'Space', repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, target: within(role) } as any)).toBe(false);
    }
  });
});

it.skipIf(!hasChrome)('GEM select in real Chromium: selection, keys, Escape, click-outside, disabled, Space, positioning, app state', async () => {
  const result = await inChromium('/index.html?seed=4242', `import('/test/gemSelectBrowser.ts').then(m => m.run())`, ['--window-size=1760,940']);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toBe('passed');
}, 60000);
