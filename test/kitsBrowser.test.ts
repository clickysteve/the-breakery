import { expect, it } from 'vitest';
import { hasChrome, inChromium } from './chromium';

// Kits in a real browser: migration of the first release's saved kits, import, save, reload and
// export through the running app, with real IndexedDB and localStorage.
it.skipIf(!hasChrome)('kits: migration, save, reload and export in real Chromium', async () => {
  const result = await inChromium('/test/kits-test.html', `import('/test/kitsBrowser.ts').then(m => m.run())`);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toBe('passed');
}, 90000);
