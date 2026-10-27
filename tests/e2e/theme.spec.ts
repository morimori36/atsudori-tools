import { test, expect } from '@playwright/test';

test('theme selection persists and system follows the device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const theme = page.getByLabel('表示テーマ');
  await expect(theme).toHaveValue('system');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light dark');
  await theme.selectOption('light');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await page.reload();
  await expect(theme).toHaveValue('light');
  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await theme.selectOption('system');
  const darkBackground = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
  const darkColor = await page.locator('html').evaluate(el => getComputedStyle(el).color);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.locator('html').evaluate(el => getComputedStyle(el).color)).not.toBe(darkColor);
  expect(darkBackground).toBeTruthy();
});
