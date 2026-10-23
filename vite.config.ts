import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.PAGES_BASE ?? '/atsudori-tools/',
  test: { include: ['tests/**/*.test.ts'], maxWorkers: 1 },
});
