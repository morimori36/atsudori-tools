import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';
import { multiMemberFixture } from '../helpers/multi-member';

async function openRating(page: Page, pending = false) {
  const { master, collection } = multiMemberFixture();
  master.members.push({ ...master.members[0]!, id: 8305, cardType: 8 });
  collection.members.push({ ...collection.members[0]!, cardId: 8305 });
  if (pending) {
    master.members[0]!.rarity = 91;
    master.memberLevelLimits.push(...master.memberLevelLimits.filter(row => row.rarity === 4).map(row => ({ ...row, rarity: 91 })));
  }
  await page.addInitScript(({ master, collection, catalogKey, collectionKey }) => {
    if (!localStorage.getItem(catalogKey)) localStorage.setItem(catalogKey, JSON.stringify(master));
    if (!localStorage.getItem(collectionKey)) localStorage.setItem(collectionKey, JSON.stringify(collection));
  }, { master, collection, catalogKey: CATALOG_STORAGE_KEY, collectionKey: STORAGE_KEY });
  await page.goto('./#rating');
  return page.locator('.rating-breakdown');
}

test('mobile rating edit restores selection, focus and scroll after saving or closing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  const detail = await openRating(page);
  const color = page.getByLabel('色別合計', { exact: true });
  await color.selectOption('8');
  await color.selectOption('7');
  const snap = detail.locator('[data-rating-edit="snaps"]');
  await snap.focus();
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '現在の所持・育成を編集' });
  await expect(dialog.getByRole('button', { name: '閉じる' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('summary')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(snap).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(y);

  const rating = detail.locator('.slot-rating').first();
  const before = await rating.textContent();
  await page.keyboard.press('Enter');
  await dialog.locator('label[for="snaps-8501-snapRank-2"]').click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rating).not.toHaveText(before!);
  await expect(snap).toBeFocused();
  await expect(color).toHaveValue('7');
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(snap).toBeFocused();

  await page.locator('input[name="rating-mode"][value="potential"]').check();
  const member = detail.locator('[data-card-id="8301"]');
  await member.click();
  await expect(dialog.locator('input[name="trainingStage"][value="1"]')).toBeChecked();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.locator('label[for="members-8301-trainingStage-2"]').click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('input[name="rating-mode"][value="potential"]')).toBeChecked();
  await expect(color).toHaveValue('7');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(stored.snaps).toContainEqual({ supportCardId: 8501, rank: 2, level: 2 });
  expect(stored.members.find((row: { cardId: number }) => row.cardId === 8301)).toMatchObject({ trainingStage: 2, level: 2 });
});

test('pending candidate targets its own card and a failed save preserves both the draft and stored data', async ({ page }) => {
  const detail = await openRating(page, true);
  const dialog = page.getByRole('dialog', { name: '現在の所持・育成を編集' });
  await expect(detail.getByText('選出未確定', { exact: true })).toBeVisible();
  await detail.locator('[data-card-id="8301"]').click();
  await page.evaluate(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        Storage.prototype.setItem = setItem;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      setItem.call(this, name, value);
    };
  }, STORAGE_KEY);
  const bytes = () => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  const before = await bytes();
  const ownership = dialog.locator('[data-ownership-toggle]');
  await ownership.click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByText(/ブラウザに保存できませんでした/)).toBeVisible();
  await expect(ownership).toHaveAttribute('aria-pressed', 'false');
  expect(await bytes()).toBe(before);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(detail.locator('[data-card-id="8301"]')).toHaveCount(0);
  await expect(detail.locator('[data-card-id="8302"]')).toBeVisible();
  await expect(detail).toHaveAttribute('data-rating-character', '8201');
  const stored = JSON.parse((await bytes())!);
  expect(stored.members.map((row: { cardId: number }) => row.cardId)).toEqual([8302, 8303, 8304, 8305]);
});
