import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/** Safari-engine coverage complements Chromium locally and in CI. */
export default defineConfig({
  ...base,
  testMatch: ['conversion.spec.ts','rank-rules.spec.ts','total-rank-bonus.spec.ts'],
  use: {...base.use,...devices['iPhone 13'],browserName:'webkit'},
});
