import { expect, it } from 'vitest';
import { hasChrome, inChromium } from './chromium';

it.skipIf(!hasChrome)('OUTPUT: the master output chain live and in TAKEAWAY, in real Chromium Web Audio', async () => {
  const result = await inChromium('/test/mixer-test.html', `import('/test/outputBrowser.ts').then(m => m.run())`);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toContain('passed');
}, 60000);
