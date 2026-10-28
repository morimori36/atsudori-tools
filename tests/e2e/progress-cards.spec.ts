import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { fictionalCatalog } from '../helpers/rank-rules';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';

for (const width of [1440, 390, 320]) test(`compact rank and item cards preserve independent drafts at ${width}px`, async ({ page }) => {
  const m = syntheticCatalog();
  for (let n = 2; n <= 5; n++) m.characters.push({ id: 8200+n, bandId: 8101, name: `架空奏者${n}` });
  for (let n = 2; n <= 5; n++) {
    m.bands.push({ id: 8100+n, name: `架空バンド${n}` });
    m.characters.push({ id: 8220+n, bandId: 8100+n, name: `別の架空奏者${n}` });
    m.bandItems.push({ id: 8600+n, bandId: 8100+n, name: `架空アイテム${n}` });
    m.bandItemLevels.push({ itemId: 8600+n, level: n });
    m.skillTargets.push({ id: 8700+n, targetType: 3, bandId: 8100+n, characterId: 0, cardType: 0, tagId: 0 });
    m.bandItemEffects.push({ itemId: 8600+n, level: n, effectType: 1000, valueBp: 100, targetIds: [8700+n] });
  }
  const catalog = await fictionalCatalog(m), owned = syntheticCollection(m);
  await page.setViewportSize({ width, height: 844 });
  await page.goto('./');
  await page.evaluate(({catalog, owned, keys}) => {
    localStorage.setItem(keys[0]!, JSON.stringify(catalog));
    localStorage.setItem(keys[1]!, JSON.stringify(owned));
  }, { catalog, owned, keys: [CATALOG_STORAGE_KEY, STORAGE_KEY] });
  await page.reload(); await page.locator('nav [data-tab=progress]').click();
  const characters = page.locator('[data-progress-scroll=characters]'), items = page.locator('[data-progress-scroll=items]');
  await expect(characters.locator('article')).toHaveCount(5);
  await expect(items.locator('article')).toHaveCount(5);
  const numeric = page.locator('#progress-8201-stamps');
  await expect(numeric).toHaveAttribute('inputmode', 'numeric');
  const inputSize = await numeric.evaluate(el => ({ font: parseFloat(getComputedStyle(el).fontSize), height: el.getBoundingClientRect().height }));
  expect(inputSize.font).toBeGreaterThanOrEqual(16);
  expect(inputSize.height).toBeGreaterThanOrEqual(44);
  const boxes = await characters.locator('article').evaluateAll(els => els.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width })));
  expect(new Set(boxes.map(b => b.y)).size).toBe(1);
  expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.width);
  expect(await characters.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(width < 700);
  if (width < 700) {
    expect(boxes[1]!.x).toBeLessThan(width); // next card peeks into the viewport
    await characters.evaluate(el => { el.scrollLeft = 240; });
    expect(await characters.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    expect(await items.evaluate(el => el.scrollLeft)).toBe(0);
  }
  await page.locator('#rank-8201').fill('');
  await page.locator('#progress-8201-stamps').fill('9');
  await expect(page.locator('[data-character-rank="8201"] [data-estimated-rank]')).toHaveText('2');
  await page.locator('#rank-8202').fill('3');
  await page.locator('#rank-8203').fill('7');
  for (let n = 1; n <= 5; n++) await page.locator(`#item-${8600+n}`).fill(String(n === 1 ? 2 : n));
  const itemScroll = await items.evaluate(el => el.scrollLeft);
  await page.locator('[data-progress-band="8102"]').click();
  await expect(page.locator('#rank-8222')).toBeVisible();
  await expect(page.locator('[data-progress-band="8102"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await items.evaluate(el => el.scrollLeft)).toBe(itemScroll);
  await page.locator('#rank-8222').fill('2');
  await page.locator('[data-progress-band="8101"]').click();
  await expect(page.locator('#progress-8201-stamps')).toHaveValue('9');
  await expect(page.locator('#rank-8202')).toHaveValue('3');
  await expect(page.locator('[data-total-character-rank]')).toContainText('19'); // 2+3+7+1+1+2+1+1+1
  await page.locator('#progress-form button[type=submit]').click();
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY);
  expect(saved.bandItems).toEqual({ 8601:2, 8602:2, 8603:3, 8604:4, 8605:5 });
  expect(saved.characterProgress).toEqual({8201:{stamps:9}});
  expect(saved.characterRanks).toEqual({8202:3,8203:7,8222:2});
  await page.reload(); await page.locator('nav [data-tab=progress]').click();
  await expect(page.locator('#progress-8201-stamps')).toHaveValue('9');
  await page.locator('nav [data-tab=exchange]').click();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-button').click();
  const exported = JSON.parse(await readFile((await (await downloadPromise).path())!, 'utf8'));
  expect(exported).toEqual(saved);
  await page.locator('#import-file').setInputFiles({ name:'cards.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(exported)) });
  await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await page.locator('nav [data-tab=progress]').click();
  await expect(page.locator('#rank-8203')).toHaveValue('7');
  await page.locator('#item-8605').fill('1'); // in range but absent from master
  await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('#item-8605')).toHaveValue('1');
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY)).toEqual(saved);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
