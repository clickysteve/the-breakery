import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths: the same build works at the custom domain root and under /<repo>/.
  base: './',
  server: { port: 5213 },
  // `npm run evaluate` runs the scripts/ files (reports), `npm test` the unit tests.
  test: { include: process.env.BREAKERY_SCRIPTS ? ['scripts/**/*.test.ts'] : ['test/**/*.test.ts'] },
} as never);
