import { defineConfig } from '@playwright/test';

const baseURL = `http://127.0.0.1:4173${process.env.PAGES_BASE ?? '/atsudori-tools/'}`;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL, browserName: 'chromium', trace: 'off' },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
