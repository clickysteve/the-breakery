import { expect, it } from 'vitest';
import { hasChrome, inChromium } from './chromium';

it.skipIf(!hasChrome)('renders mixer and export audio in real Chromium Web Audio', async () => {
  const result = await inChromium('/test/mixer-test.html', `import('/test/mixerBrowser.ts').then(m => m.run())`);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  expect(result.value).toContain('passed');
}, 60000);
