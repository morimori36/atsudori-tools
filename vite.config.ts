import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.PAGES_BASE ?? '/atsudori-tools/',
  // Preserve native light-dark(): the fallback follows only the system scheme,
  // whereas the UI also supports an explicit color-scheme on the document.
  build: { cssTarget: ['chrome123', 'firefox120', 'safari17.5'] },
  test: { include: ['tests/**/*.test.ts'], maxWorkers: 1 },
});
