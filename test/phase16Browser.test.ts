import { expect, it } from 'vitest';
import { hasChrome, inChromium } from './chromium';

// Phase 16 in real Chromium: CHOP enables on a hand-edited groove, ROLLS and RE-ROLL work from the tab, no BAKE.
it.skipIf(!hasChrome)('Phase 16 in real Chromium: CHOP and ROLLS on the current groove from their tabs', async () => {
  const result = await inChromium('/index.html?seed=4242', `import('/test/phase16Browser.ts').then(m => m.run())`, ['--window-size=1760,940']);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toBe('passed');
}, 90000);
