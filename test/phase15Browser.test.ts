import { expect, it } from 'vitest';
import { hasChrome, inChromium } from './chromium';

// Phase 15 in real Chromium: NEW PATCH, the WILDCARD status line and report, TAKEAWAY names, 13 tracks.
it.skipIf(!hasChrome)('Phase 15 in real Chromium: new patch, wildcard report, export names, 13 tracks', async () => {
  const result = await inChromium('/index.html?seed=4242', `import('/test/phase15Browser.ts').then(m => m.run())`, ['--window-size=1760,940']);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toBe('passed');
}, 90000);
