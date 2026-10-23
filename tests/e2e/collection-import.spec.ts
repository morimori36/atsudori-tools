import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { STORAGE_KEY } from '../../src/storage/local';

const file = (value: unknown) => ({ name: 'fictional-import.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(value)) });
const current = () => ({ ...syntheticCollection(), characterProgress: {
  8201: { stamps: 8, bondRankTotal: 30, liveClears: 100, songClears: 10, skillLevel5: 2 },
} });
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.locator('nav [data-tab=catalog]').click();
  await page.locator('#catalog-import').setInputFiles(file(syntheticCatalog()));
  await page.locator('#catalog-apply').click();
  await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#import-file').setInputFiles(file(current()));
  await page.locator('#apply-import').click();
});

test('older ownership imports retain progress through confirmation, reload and export on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const incoming = { ...syntheticCollection(), members: [], snaps: [], characterRanks: { 8201: 7 }, bandItems: { 8601: null } };
  const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await page.locator('#import-file').setInputFiles(file(incoming));
  await expect(page.locator('#preserve-import-progress')).toBeChecked();
  await expect(page.locator('.import-preview')).toContainText('キャラクター進捗 1人');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#apply-import').click();
  const expected = { ...incoming, characterProgress: current().characterProgress };
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(expected);
  await page.reload();
  await page.locator('nav [data-tab=exchange]').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-button').click()]);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(expected);
});

test('sparse progress honors explicit zero, and full replacement remains an explicit choice', async ({ page }) => {
  await page.locator('#import-file').setInputFiles(file({ ...syntheticCollection(), characterProgress: { 8201: { stamps: 0 } } }));
  await page.locator('#apply-import').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).characterProgress, STORAGE_KEY))
    .toEqual({ 8201: { ...current().characterProgress[8201], stamps: 0 } });

  await page.locator('#import-file').setInputFiles(file(syntheticCollection()));
  await page.locator('#preserve-import-progress').uncheck();
  await expect(page.locator('.import-preview')).toContainText('キャラクター進捗 0人');
  await page.locator('#apply-import').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(syntheticCollection());
  await page.locator('#import-file').setInputFiles(file(syntheticCollection()));
  await expect(page.locator('#preserve-import-progress')).toBeChecked();
});

test('failed saving preserves previous storage and exports the updated ownership with progress', async ({ page }) => {
  const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  const incoming = { ...syntheticCollection(), members: [] };
  await page.locator('#import-file').setInputFiles(file(incoming));
  await page.locator('#apply-import').click();
  await expect(page.locator('#autosave-warning')).toContainText('保存');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-button').click()]);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8')))
    .toEqual({ ...incoming, characterProgress: current().characterProgress });
});
