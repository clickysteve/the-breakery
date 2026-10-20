import { expect, it } from 'vitest';
import { hasChrome, inChromium } from './chromium';

// Phase 17 in real Chromium: grid clicks land in the containing cell, PAINT places the chosen sample, the name builder's columns.
it.skipIf(!hasChrome)('Phase 17 in real Chromium: grid cells, PAINT and the two-column name builder', async () => {
  const result = await inChromium('/index.html?seed=4242', `import('/test/phase17Browser.ts').then(m => m.run())`, ['--window-size=1760,940']);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toBe('passed');
}, 90000);
