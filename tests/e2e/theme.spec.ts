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

test('rating summaries keep readable contrast in both themes', async ({ page }) => {
  await page.goto('/');
  const contrast = async (theme: 'light' | 'dark') => {
    await page.getByLabel('表示テーマ').selectOption(theme);
    return page.evaluate(() => {
      const summary = document.createElement('div');
      summary.className = 'color-summary';
      summary.style.setProperty('--card-color', '#888888');
      summary.innerHTML = '<span class="color-label"><small>小計</small></span>';
      document.body.append(summary);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const luminance = (color: string) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
      };
      const background = luminance(getComputedStyle(summary).backgroundColor);
      const text = luminance(getComputedStyle(summary.querySelector('small')!).color);
      summary.remove();
      return (Math.max(background, text) + 0.05) / (Math.min(background, text) + 0.05);
    });
  };
  expect(await contrast('light')).toBeGreaterThanOrEqual(4.5);
  expect(await contrast('dark')).toBeGreaterThanOrEqual(4.5);
});
