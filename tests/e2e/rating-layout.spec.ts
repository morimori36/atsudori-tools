import { expect, test } from '@playwright/test';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';
import { ratingLayoutFixture } from '../helpers/rating-layout';

for (const width of [320, 375, 390, 1280]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`band and breakdown selection survive recalculation at ${width}px in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme });
    const { master, collection } = ratingLayoutFixture();
    await page.addInitScript(({ master, collection, catalogKey, collectionKey }) => {
      localStorage.setItem(catalogKey, JSON.stringify(master));
      localStorage.setItem(collectionKey, JSON.stringify(collection));
    }, { master, collection, catalogKey: CATALOG_STORAGE_KEY, collectionKey: STORAGE_KEY });
    await page.goto('./#rating');
    const mobile = width < 700;
    const list = page.locator('.rating-band-list');
    const summary = list.locator('summary');
    const currentBand = page.locator('.band-result');
    const heading = page.locator('#rating-character-heading');
    const bandButtons = mobile ? list : page.locator('.rating-band-picker > fieldset');
    const pickBand = async (id: string) => {
      if (mobile) await summary.click();
      const button = bandButtons.locator(`button[value="${id}"]`);
      await expect(button).toBeVisible();
      await button.click();
      await expect(currentBand).toHaveAttribute('data-band', id);
      await expect(mobile ? summary : button).toBeFocused();
      if (mobile) await expect(list).not.toHaveAttribute('open', '');
    };
    const pick = async (kind: string, id: string) => {
      const selector = `[data-rating-pick="${kind}"]`;
      const control = mobile ? page.locator(`select${selector}`) : page.locator(`button${selector}[value="${id}"]`);
      if (mobile) await control.selectOption(id);
      else {
        await control.focus();
        await control.press('Enter');
        await expect(control).toHaveAttribute('aria-pressed', 'true');
      }
      await expect(control).toBeFocused();
    };
    const assertLayout = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const bounds = await page.locator('.rating-slot-value').first().boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    };
    await expect(currentBand).toHaveAttribute('data-band', '8101');
    await expect(page.locator('.slot-rating').first()).toBeVisible();
    if (mobile) {
      await expect(summary).toContainText(master.bands[0]!.name);
      await expect(list).not.toHaveAttribute('open', '');
    }
    await pick('color', '8');
    await pick('character', '8239');
    await expect(heading).toHaveText('架空の黄紙');
    await assertLayout();

    await pickBand('8197');
    await expect(currentBand.locator('.rating-total')).toContainText('合計は保留');
    await pick('character', '8306');
    await expect(heading).toHaveText('架空の星紙');
    await page.getByRole('button', { name: '計算待ちの理由' }).click();
    await expect(page.getByRole('tooltip').filter({ hasText: 'アイテムに未設定' })).toBeVisible();
    await page.keyboard.press('Escape');
    await assertLayout();

    await pickBand('8101');
    await expect(currentBand).toHaveAttribute('data-color', '8');
    await expect(heading).toHaveText('架空の黄紙');
    await page.getByRole('radio', { name: '育成後', exact: true }).check();
    await expect(heading).toHaveText('架空の黄紙');
    await page.getByRole('button', { name: '育成条件を変更' }).click();
    await page.getByRole('dialog', { name: '育成条件' }).locator('[data-training=trainingStage]').selectOption('1');
    await page.keyboard.press('Escape');
    await expect(heading).toHaveText('架空の黄紙');
    await expect(currentBand).toHaveAttribute('data-color', '8');
    await pickBand('8197');
    await expect(heading).toHaveText('架空の星紙');
    await assertLayout();
  });
}
