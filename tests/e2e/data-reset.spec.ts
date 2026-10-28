import { test, expect } from '@playwright/test';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';
import { emptyCatalog } from '../../src/data/catalog/validate';
import { emptyCollection } from '../../src/storage/collection';
import { fictionalCatalog } from '../helpers/rank-rules';
import { syntheticCollection } from '../helpers/synthetic';

for (const width of [1280, 390]) test(`initialization is confirmed, isolated and validated at width ${width}`, async ({ page }) => {
  const m = await fictionalCatalog(), c = { ...syntheticCollection(m), tgwRank: 23 };
  await page.setViewportSize({ width, height: 844 });
  await page.goto('./');
  await page.evaluate(({ m, c, mk, ck }) => {
    localStorage.setItem(mk, JSON.stringify(m)); localStorage.setItem(ck, JSON.stringify(c));
    localStorage.setItem('unrelated', 'preserved');
  }, { m, c, mk: CATALOG_STORAGE_KEY, ck: STORAGE_KEY });
  await page.reload();
  await expect(page.locator('[data-tab=catalog]')).toHaveCount(0);
  await page.locator('nav [data-tab=exchange]').click();
  await expect(page.locator('#data-reset')).not.toHaveAttribute('open');
  await page.locator('#data-reset summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bytes = () => page.evaluate(() => ({ ...localStorage }));
  const before = await bytes();
  for (const id of ['reset-button', 'catalog-clear']) {
    page.once('dialog', d => d.dismiss()); await page.locator('#' + id).click();
    expect(await bytes()).toEqual(before);
  }
  page.once('dialog', d => d.accept()); await page.locator('#catalog-clear').click();
  await expect(page.getByRole('alert')).toContainText('先に「所持・育成データを初期化」');
  expect(await bytes()).toEqual(before);
  await page.locator('#data-reset summary').click();
  page.once('dialog', d => d.accept()); await page.locator('#reset-button').click();
  const afterOwned = await bytes();
  expect(JSON.parse(afterOwned[STORAGE_KEY]!)).toEqual(emptyCollection(m));
  expect(afterOwned[CATALOG_STORAGE_KEY]).toBe(before[CATALOG_STORAGE_KEY]);
  await page.locator('#data-reset summary').click();
  page.once('dialog', d => d.accept()); await page.locator('#catalog-clear').click();
  const afterMaster = await bytes();
  expect(JSON.parse(afterMaster[CATALOG_STORAGE_KEY]!)).toEqual(emptyCatalog());
  expect(afterMaster[STORAGE_KEY]).toBe(afterOwned[STORAGE_KEY]);
  expect(afterMaster.unrelated).toBe('preserved');
});

for (const id of ['reset-button', 'catalog-clear']) test(`${id} save failure preserves data`, async ({ page }) => {
  const m = await fictionalCatalog(), c = emptyCollection(m);
  await page.goto('./');
  await page.evaluate(({ m, c, mk, ck }) => {
    localStorage.setItem(mk, JSON.stringify(m));localStorage.setItem(ck, JSON.stringify(c));
  }, { m, c, mk: CATALOG_STORAGE_KEY, ck: STORAGE_KEY });
  await page.reload();await page.locator('nav [data-tab=exchange]').click();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.locator('#data-reset summary').click();page.once('dialog', d => d.accept());await page.locator('#' + id).click();
  await expect(page.getByRole('alert').filter({ hasText: '保存できません' })).toBeVisible();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await page.locator('nav [data-tab=members]').click();await expect(page.locator('[data-member-card]')).toHaveCount(m.members.length);
});
