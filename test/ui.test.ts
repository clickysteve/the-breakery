import { expect, it } from 'vitest';
import { hasChrome, inChromium } from './chromium';

// The interface in a real browser: one tab system, the mixer grid and its controls, click-to-toggle
// editing with shift+click selection and a drag threshold, and grouped rolls expanded and edited.
it.skipIf(!hasChrome)('the interface: tabs, mixer, grid editing and rolls in real Chromium', async () => {
  const result = await inChromium('/index.html?seed=4242', `import('/test/uiBrowser.ts').then(m => m.run())`, ['--window-size=1760,940']);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toBe('passed');
}, 60000);
