import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { starBudgetFixture } from '../helpers/star-budget';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { STORAGE_KEY, CATALOG_STORAGE_KEY } from '../../src/storage/local';

const menu = 'nav [data-tab="star-budget"]';
const field = (page: Page, name: string) => page.locator(`#star-budget-form [name="${name}"]`);
const balance = (page: Page) => page.locator('[data-budget-balance=premium]');
const file = (value: unknown) => ({ name: 'fictional.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
const catalog = () => {
  const m = syntheticCatalog();
  return { ...m, starBudgetDefinition: { ...starBudgetFixture().definition, revision: m.revision } };
};
async function setup(page: Page) {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('atsudori-tools.star-budget.v1', 'damaged legacy bytes'));
  await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#catalog-import').setInputFiles(file(catalog()));
  await expect(page.getByText('マスタをImportしました', { exact: true })).toBeVisible();
  const { rank, ...starBudgetScenario } = starBudgetFixture().scenario;
  await page.locator('#import-file').setInputFiles(file({ ...syntheticCollection(), resourceInventory: { fictional: 4 }, ownedStampIds: [], tgwRank: rank!, starBudgetScenario }));
  await expect(page.getByText('所持データをImportしました', { exact: true })).toBeVisible();
  await page.locator(menu).click();
}
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);

test('requires catalog definitions and ignores legacy storage', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('atsudori-tools.star-budget.v1', 'broken'));
  await page.reload(); await page.locator(menu).click();
  await expect(page.getByText('マスタにスター予算定義がない', { exact: false })).toBeVisible();
  await expect(balance(page)).toHaveCount(0);
  await expect(page.locator('[data-budget-file],[data-budget-export],[data-add-tier]')).toHaveCount(0);
});

test('catalog import alone enables calculation using unsaved reading defaults', async ({ page }) => {
  await page.goto('./'); await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#catalog-import').setInputFiles(file(catalog()));
  await expect(page.getByText('マスタをImportしました', { exact: true })).toBeVisible();
  await page.locator(menu).click();
  await expect(page.locator('.budget-comparison thead th')).toHaveText(['項目', 'なし', 'Lite', 'Standard', 'Premium']);
  await expect(balance(page)).toHaveText('算出不可');
  await expect(field(page, 'scenario.rank')).toHaveValue('');
  await expect(field(page, 'selected-sr-1')).toBeChecked();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('calculates from catalog, persists all personal controls and keeps ownership', async ({ page }) => {
  await setup(page); await expect(balance(page)).toHaveText('+106.17');
  const before = await saved(page);
  await field(page, 'selected-sr-1').uncheck(); await expect(balance(page)).toHaveText('+396.17');
  await field(page, 'selected-sr-1').check();
  await field(page, 'scenario.rank').fill('12'); await expect(balance(page)).toHaveText('+346.17');
  await field(page, 'scenario.rank').fill('13');
  await field(page, 'scenario.storyEventPercent').fill('0'); await expect(balance(page)).toHaveText('-51.33');
  await field(page, 'scenario.storyEventPercent').fill('100');
  await field(page, 'scenario.seasonPremium').uncheck(); await expect(balance(page)).toHaveText('-313.83');
  await field(page, 'scenario.seasonPremium').check();
  await field(page, 'scenario.eventPremium').check();
  await field(page, 'scenario.includeArena').check();
  expect((await saved(page)).starBudgetScenario).toMatchObject({ storyEventPercent: 100, eventPremium: true, seasonPremium: true, includeArena: true });
  await field(page, 'scenario.storyEventPercent').fill(''); await expect(balance(page)).toHaveText('算出不可');
  expect((await saved(page)).starBudgetScenario.storyEventPercent).toBeNull();
  for (const checkbox of await page.locator('[name^=selected-]').all()) await checkbox.uncheck();
  expect((await saved(page)).starBudgetScenario.selectedProducts).toEqual([]);
  const after = await saved(page);
  for (const key of ['members', 'snaps', 'resourceInventory', 'ownedStampIds', 'characterRanks', 'bandItems']) expect(after[key]).toEqual(before[key]);
  expect(after.starBudgetScenario).not.toHaveProperty('rank');
  await page.reload(); await page.locator(menu).click();
  await expect(field(page, 'scenario.includeArena')).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('atsudori-tools.star-budget.v1'))).toBe('damaged legacy bytes');
});

test('shares TGW rank with character ranks and keeps unknown rank unknown', async ({ page }) => {
  await setup(page);
  await field(page, 'scenario.rank').fill('12');
  await page.locator('nav [data-tab=progress]').click();
  await expect(page.locator('#tgwRank')).toHaveValue('12');
  await page.locator('#tgwRank').fill('14');
  await page.locator('#progress-save').click();
  await page.locator(menu).click(); await expect(field(page, 'scenario.rank')).toHaveValue('14');
  await field(page, 'scenario.rank').fill('');
  expect(await saved(page)).not.toHaveProperty('tgwRank');
  await expect(balance(page)).toHaveText('算出不可');
  await page.reload(); await page.locator(menu).click();
  await expect(field(page, 'scenario.rank')).toHaveValue('');
});

test('exports common collection, preserves omitted fields, accepts explicit empty values and catalog updates', async ({ page }) => {
  await setup(page);
  await field(page, 'selected-sr-1').uncheck();
  const before = await saved(page);
  await page.locator('nav [data-tab=exchange]').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-button').click()]);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(before);
  await page.locator('#import-file').setInputFiles(file(before));
  await expect(page.getByText('所持データをImportしました', { exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await page.locator('#import-file').setInputFiles(file(syntheticCollection()));
  expect((await saved(page)).starBudgetScenario).toEqual(before.starBudgetScenario);
  const next = catalog(); next.revision = 'next'; next.starBudgetDefinition.revision = 'next';
  await page.locator('#catalog-import').setInputFiles(file(next));
  await expect(page.getByText('マスタをImportしました', { exact: true })).toBeVisible();
  expect((await saved(page)).starBudgetScenario).toEqual(before.starBudgetScenario);
  await page.locator('#import-file').setInputFiles(file({ ...before, starBudgetScenario: { storyEventPercent: null, eventPremium: false, seasonPremium: false, includeArena: false, selectedProducts: [] } }));
  await page.locator(menu).click();
  await expect(field(page, 'scenario.eventPremium')).not.toBeChecked();
  await expect(field(page, 'selected-sr-1')).not.toBeChecked();
  await page.locator('nav [data-tab=exchange]').click();
  await page.getByText('データの初期化', { exact: true }).click();
  page.once('dialog', dialog => dialog.accept()); await page.locator('#reset-button').click();
  await page.locator(menu).click();
  await expect(field(page, 'selected-sr-1')).toBeChecked();
  await expect(field(page, 'scenario.rank')).toHaveValue('');
  expect(await saved(page)).not.toHaveProperty('starBudgetScenario');
});

test('failed saves and invalid numbers keep confirmed collection intact', async ({ page }) => {
  await setup(page);
  const before = await saved(page);
  await field(page, 'scenario.storyEventPercent').fill('101');
  await expect(page.locator('[data-budget-message]')).toContainText('未保存');
  expect(await saved(page)).toEqual(before);
  await field(page, 'scenario.storyEventPercent').fill('100');
  await page.evaluate(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new Error('quota'); original.call(this, k, v); }; }, STORAGE_KEY);
  await field(page, 'scenario.rank').fill('12');
  await expect(page.locator('.save-state')).toContainText('未保存');
  expect(await saved(page)).toEqual(before);
  await page.locator('nav [data-tab=manual]').click(); await page.locator(menu).click();
  await expect(field(page, 'scenario.rank')).toHaveValue('13');
});

test('damaged collection is protected and invalid catalog never overwrites it', async ({ page }) => {
  await setup(page);
  await page.locator('nav [data-tab=exchange]').click();
  const before = await saved(page), raw = await page.evaluate(key => localStorage.getItem(key), CATALOG_STORAGE_KEY);
  const invalid = catalog(); invalid.starBudgetDefinition.products.pop();
  await page.locator('#catalog-import').setInputFiles(file(invalid));
  expect(await saved(page)).toEqual(before);
  expect(await page.evaluate(key => localStorage.getItem(key), CATALOG_STORAGE_KEY)).toEqual(raw);
  await page.evaluate(key => localStorage.setItem(key, 'broken collection'), STORAGE_KEY);
  await page.reload(); await page.locator(menu).click();
  await expect(field(page, 'scenario.rank')).toBeDisabled();
  await expect(balance(page)).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('broken collection');
});

test('keeps four comparisons accessible at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await setup(page);
  await page.locator('[data-theme]').selectOption('dark');
  await expect(balance(page)).toHaveText('+106.17');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await balance(page).scrollIntoViewIfNeeded();
  const scroll = page.locator('.budget-comparison').locator('..');
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(balance(page)).toBeInViewport();
  await page.screenshot({ path: '.cache/star-budget/catalog-mobile.png', fullPage: true });
});
