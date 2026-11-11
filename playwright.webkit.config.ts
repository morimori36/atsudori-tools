import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/** Safari-engine coverage complements Chromium locally and in CI. */
export default defineConfig({
  ...base,
  testMatch: ['bond-theory.spec.ts','growth-bonds.spec.ts','materials.spec.ts','character-exp.spec.ts','resource-inventory.spec.ts','conversion.spec.ts','rank-rules.spec.ts','total-rank-bonus.spec.ts','progress-cards.spec.ts','star-budget.spec.ts','star-budget-ui.spec.ts'],
  use: {...base.use,...devices['iPhone 13'],browserName:'webkit'},
});
