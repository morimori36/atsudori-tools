import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { displayOrderFixture } from '../helpers/display-order';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';

for (const legacy of [false, true]) test(`character order across views and JSON round trips, legacy=${legacy}`, async ({ page }) => {
  const { master, collection } = displayOrderFixture();
  if (legacy) master.characters.forEach(c => { delete c.displayOrder; });
  const expected = legacy ? ['8201', '8284', '8297', '8239', '8262'] : ['8262', '8239', '8284', '8297', '8201'];
  await page.goto('./');
  await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#catalog-import').setInputFiles({ name: 'fictional-order.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(master)) });
  await expect(page.getByText('マスタをImportしました', { exact: true })).toBeVisible();
  await page.locator('#import-file').setInputFiles({ name: 'fictional-owned.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(collection)) });
  await expect(page.getByText('所持データをImportしました', { exact: true })).toBeVisible();
  const keys = [CATALOG_STORAGE_KEY, STORAGE_KEY];
  const saved = await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), keys);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('nav [data-tab=progress]').click();
    await expect(page.locator('[data-character-rank]').first()).toHaveAttribute('data-character-rank', expected[0]!); // first card below
    expect(await page.locator('[data-character-rank]').evaluateAll(els => els.map(el => el.getAttribute('data-character-rank')))).toEqual(expected);
    expect(await page.locator('[data-bond-character]').evaluateAll(els => els.map(el => el.getAttribute('data-bond-character')))).toEqual(expected);
    await page.locator('nav [data-tab=items]').click();
    expect(await page.locator('.band-items').first().locator('input').evaluateAll(els => els.map(el => el.id))).toEqual(['item-8698', 'item-8696', 'item-8601', 'item-8694', 'item-8692']);
    await page.locator('nav [data-tab=progress]').click();
    await page.locator('[data-progress-band="8197"]').click();
    const second = legacy ? ['8328', '8314', '8306'] : ['8314', '8306', '8328'];
    expect(await page.locator('[data-character-rank]').evaluateAll(els => els.map(el => el.getAttribute('data-character-rank')))).toEqual(second);
    expect(await page.locator('[data-bond-character]').evaluateAll(els => els.map(el => el.getAttribute('data-bond-character')))).toEqual(second);
    await page.locator('[data-progress-band="8101"]').click();
    await page.locator('nav [data-tab=rating]').click();
    if (!legacy) expect(await page.locator('[data-rating-character]').evaluateAll(els => els.map(el => el.getAttribute('data-rating-character')))).toEqual([...expected, ...second]);
    await page.locator('nav [data-tab=snaps]').click();
    await expect(page.locator('.card-characters').first()).toHaveText(legacy ? '架空の青紙 / 架空の黄紙 / 架空の白紙 / 架空の赤紙 / 架空の緑紙' : '架空の赤紙 / 架空の黄紙 / 架空の緑紙 / 架空の白紙 / 架空の青紙');
    if (!legacy) expect(await page.locator('[data-filter=character]').evaluateAll(els => els.map(el => (el as HTMLInputElement).value).filter(Boolean))).toEqual([...expected, ...second]);
    expect(await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), keys)).toEqual(saved);
    await page.locator('nav [data-tab=exchange]').click();
    for (const [button, value] of [['#catalog-export', master], ['#export-button', collection]] as const) {
      const download = page.waitForEvent('download'); await page.locator(button).click();
      expect(JSON.parse(await readFile((await (await download).path())!, 'utf8'))).toEqual(value);
    }
    await page.reload();
  }
  // Refusing an incomplete replacement keeps both stored documents intact.
  delete master.characters[0]!.displayOrder;
  master.characters[1]!.displayOrder = 70;
  await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#catalog-import').setInputFiles({ name: 'incomplete-order.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(master)) });
  await expect(page.locator('[role=alert]').filter({ hasText: 'displayOrder' })).toContainText('displayOrder');
  expect(await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), keys)).toEqual(saved);
});
