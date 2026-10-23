import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultEventInput } from '../../src/domain/event-planner/model';
import type { EventPlannerInput } from '../../src/domain/event-planner/model';
import { EVENT_STORAGE_KEY } from '../../src/storage/event-planner';
import { exampleEventInput } from '../helpers/event-input';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';

const file = (value: unknown) => ({ name: 'fictional-event.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
const eventTab = (page: Page) => page.locator('nav [data-tab="event"]');
const card = (page: Page, kind: string, index = 0) => page.locator(`[data-kind="${kind}"][data-index="${index}"]`);
async function importInput(page: Page, input: EventPlannerInput): Promise<void> {
  await page.locator('[data-import-event]').setInputFiles(file(input));
  await page.locator('[data-apply-event]').click();
}
async function stored(page: Page): Promise<string | null> {
  return page.evaluate(key => localStorage.getItem(key), EVENT_STORAGE_KEY);
}
async function exported(page: Page, selector = '[data-export-event]'): Promise<string> {
  const download = page.waitForEvent('download'); await page.locator(selector).click();
  const path = await (await download).path(); return readFile(path!, 'utf8');
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('data:')) external.push(request.url()); });
  (page as Page & { audit: () => void }).audit = () => { expect(errors).toEqual([]); expect(external).toEqual([]); };
  await page.goto('./'); await eventTab(page).click();
});
test.afterEach(async ({ page }) => { (page as Page & { audit: () => void }).audit(); });

test('starts without a catalog and displays the acceptance route with legal CP steps', async ({ page }) => {
  expect(await stored(page)).toBeNull();
  await expect(page.locator('[data-common="normalMultiplier"]')).toHaveValue('15');
  await expect(page.locator('[data-common="targetPt"]')).toHaveValue('525000');
  await importInput(page, exampleEventInput());
  await expect(page.locator('[data-best-runs]')).toHaveText('87');
  await expect(page.locator('.event-best')).toContainText('80回'); await expect(page.locator('.event-best')).toContainText('7回');
  for (const text of ['10,000', '531,300', '174分', '1,600CP × 6回', '400CP × 1回', '0〜200単位', '4ペア・804通り'])
    await expect(page.locator('.event-best')).toContainText(text);
  await expect(card(page, 'normal').locator('[data-yield]')).toHaveText('1回：1,260pt / 120CP');
  await expect(card(page, 'challenge', 1).locator('[data-yield]')).toHaveText('200CP：8,610pt / 1,600CP：68,880pt');
  await expect(page.locator('.event-comparison > .event-ranking > li')).toHaveCount(4);
});

test('adds at most five per type, disables and removes candidates, and compares all 25 pairs', async ({ page }) => {
  for (const kind of ['normal', 'challenge']) {
    for (let i = 1; i < 5; i++) await page.locator(`[data-add="${kind}"]`).click();
    await expect(page.locator(`[data-add="${kind}"]`)).toBeDisabled();
    await expect(page.locator(`[data-kind="${kind}"]`)).toHaveCount(5);
  }
  await expect(page.locator('.event-best')).toContainText('25ペア・5,025通り');
  await expect(page.locator('.event-comparison > .event-ranking > li')).toHaveCount(10);
  await page.locator('.event-all-pairs > summary').click();
  await expect(page.locator('.event-all-pairs .event-ranking > li')).toHaveCount(25);
  await card(page, 'normal').locator('[data-candidate-field="enabled"]').uncheck();
  await expect(page.locator('.event-best')).toContainText('20ペア');
  for (let i = 0; i < 5; i++) await page.locator('[data-remove="normal"]').first().click();
  await expect(page.getByRole('heading', { name: '候補を選んでください' })).toBeVisible();
  await expect(page.locator('[data-add="normal"]')).toBeEnabled();
});

test('recalculates edits and keeps invalid drafts across tool switches without saving them', async ({ page }) => {
  await importInput(page, exampleEventInput()); const before = await stored(page);
  await page.locator('[data-common="targetPt"]').fill('');
  await expect(page.locator('[data-event-results] [role="alert"]')).toContainText('目標イベントpt');
  expect(await stored(page)).toBe(before);
  await page.locator('nav [data-tab="rating"]').click(); await eventTab(page).click();
  await expect(page.locator('[data-common="targetPt"]')).toHaveValue('');
  expect(await stored(page)).toBe(before);
  await page.locator('[data-common="targetPt"]').fill('1');
  await expect(page.locator('[data-best-runs]')).toHaveText('1');
  await expect(page.locator('.event-best')).toContainText('チャレンジライブは不要');
  await page.locator('[data-common="currentPt"]').fill('1');
  await expect(page.locator('[data-best-runs]')).toHaveText('0');
  await expect(page.locator('.event-best')).toContainText('目標は達成済み');
});

test('restores input, exports all settings, and leaves rating storage bytes intact', async ({ page }) => {
  const catalog = JSON.stringify(syntheticCatalog()), collection = JSON.stringify(syntheticCollection());
  await page.evaluate(({ catalog, collection }) => { localStorage.setItem('atsudori-tools.catalog.v1', catalog); localStorage.setItem('atsudori-tools.collection.v1', collection); }, { catalog, collection });
  await page.reload(); await eventTab(page).click(); await importInput(page, exampleEventInput());
  await card(page, 'normal').locator('[data-candidate-field="name"]').fill('架空のテスト候補');
  const snapshot = await stored(page);
  expect(JSON.parse(await exported(page))).toEqual(JSON.parse(snapshot!));
  await page.reload(); await eventTab(page).click();
  await expect(card(page, 'normal').locator('[data-candidate-field="name"]')).toHaveValue('架空のテスト候補');
  await expect(page.locator('[data-best-runs]')).toHaveText('87');
  await page.locator('nav [data-tab="rating"]').click();
  await expect(page.locator('.band-result .rating-total strong')).toHaveText('857');
  expect(await page.evaluate(() => localStorage.getItem('atsudori-tools.catalog.v1'))).toBe(catalog);
  expect(await page.evaluate(() => localStorage.getItem('atsudori-tools.collection.v1'))).toBe(collection);
});

test('rejects invalid imports without overwriting valid input or saved bytes', async ({ page }) => {
  await importInput(page, exampleEventInput()); const before = await stored(page);
  for (const bad of ['{malformed', { ...defaultEventInput(), schemaVersion: 2 }, { ...defaultEventInput(), targetPt: -1 }, { ...defaultEventInput(), normal: [] as unknown, extra: true }]) {
    await page.locator('[data-import-event]').setInputFiles(file(bad));
    await expect(page.locator('[data-import-preview] [role="alert"]')).toBeVisible();
    await expect(page.locator('[data-apply-event]')).toHaveCount(0);
    await expect(page.locator('[data-best-runs]')).toHaveText('87'); expect(await stored(page)).toBe(before);
  }
  await page.locator('[data-import-event]').setInputFiles(file(' '.repeat(65537)));
  await expect(page.locator('[data-import-preview]')).toContainText('64KiB'); expect(await stored(page)).toBe(before);
});

test('remains usable with corrupt rating storage and never overwrites it', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('atsudori-tools.catalog.v1', '{broken catalog'); localStorage.setItem('atsudori-tools.collection.v1', '{broken collection'); });
  await page.reload(); await eventTab(page).click();
  await importInput(page, exampleEventInput());
  await expect(page.locator('[data-best-runs]')).toHaveText('87');
  await expect(page.locator('[data-event-storage-warning]')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('atsudori-tools.catalog.v1'))).toBe('{broken catalog');
  expect(await page.evaluate(() => localStorage.getItem('atsudori-tools.collection.v1'))).toBe('{broken collection');
});

test('protects corrupt saves until an explicit validated replacement and exports the original', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{broken original'), EVENT_STORAGE_KEY);
  await page.reload(); await eventTab(page).click();
  await expect(page.locator('[data-event-storage-warning]')).toContainText('元JSONを保護中');
  await page.locator('[data-common="targetPt"]').fill('1');
  expect(await stored(page)).toBe('{broken original');
  expect(await exported(page, '[data-export-damaged]')).toBe('{broken original');
  await page.locator('[data-import-event]').setInputFiles(file(exampleEventInput()));
  expect(await stored(page)).toBe('{broken original');
  await page.locator('[data-apply-event]').click();
  await expect(page.locator('[data-event-storage-warning]')).toBeHidden();
  await expect(page.locator('[data-best-runs]')).toHaveText('87');
  expect(JSON.parse((await stored(page))!)).toEqual(exampleEventInput());
});

test('shows save failure and still exports current valid input', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.locator('[data-common="targetPt"]').fill('123');
  await expect(page.locator('[data-event-storage-warning]')).toContainText('保存できませんでした');
  await expect(page.locator('.save-state')).toHaveText('保存未完了');
  expect(await stored(page)).toBeNull();
  expect(JSON.parse(await exported(page)).targetPt).toBe(123);
});

test('edits rank bases, resets them, and exposes the actual search range', async ({ page }) => {
  await page.locator('.event-settings > summary').click();
  await page.locator('[data-common="maxUnits"]').fill('0');
  await page.locator('[data-common="normalMultiplier"]').fill('3');
  await page.locator('[data-common="targetPt"]').fill('100');
  await page.locator('[data-common="minutesPerRun"]').fill('1.25');
  await page.locator('[data-base-kind="normal"][data-rank="S"] [data-base-field="pt"]').fill('11');
  await page.locator('[data-base-kind="normal"][data-rank="S"] [data-base-field="cp"]').fill('2');
  await expect(page.locator('[data-best-runs]')).toHaveText('4');
  await expect(page.locator('.event-best')).toContainText('5分');
  await expect(page.locator('.event-best')).toContainText('0〜0単位');
  await page.locator('[data-reset-bases]').click();
  await expect(page.locator('[data-base-kind="normal"][data-rank="S"] [data-base-field="pt"]')).toHaveValue('75');
  await expect(page.locator('[data-best-runs]')).toHaveText('1');
});

test('handles disabled candidates and unreachable plans without stale results', async ({ page }) => {
  const input = defaultEventInput(); input.bases.normal.S = { pt: 0, cp: 0 }; input.bases.challenge.SS.pt = 0;
  await importInput(page, input);
  await expect(page.getByRole('heading', { name: '計算できる組み合わせがありません' })).toBeVisible();
  await expect(page.locator('[data-best-runs]')).toHaveCount(0);
  await card(page, 'normal').locator('[data-candidate-field="enabled"]').uncheck();
  await expect(page.getByRole('heading', { name: '候補を選んでください' })).toBeVisible();
  await card(page, 'normal').locator('[data-candidate-field="enabled"]').check();
  await page.locator('[data-common="currentPt"]').fill('525000');
  await expect(page.locator('[data-best-runs]')).toHaveText('0');
});

for (const width of [320, 375]) test(`works at ${width}px without horizontal overflow or iOS numeric-field zoom`, async ({ page }) => {
  await page.setViewportSize({ width, height: 812 }); await importInput(page, exampleEventInput());
  await expect(page.locator('[data-best-runs]')).toHaveText('87');
  const name = '<img src=x onerror=alert(1)>架空の候補';
  await card(page, 'normal').locator('[data-candidate-field="name"]').fill(name);
  await expect(page.locator('.event-best')).toContainText(name);
  await expect(page.locator('#event-planner img')).toHaveCount(0);
  for (const control of await page.locator('#event-planner input[type="number"]:visible, #event-planner select:visible').all()) {
    const dimensions = await control.evaluate(element => { const rect = element.getBoundingClientRect(); return { font: parseFloat(getComputedStyle(element).fontSize), left: rect.left, right: rect.right, height: rect.height }; });
    expect(dimensions.font).toBeGreaterThanOrEqual(16); expect(dimensions.height).toBeGreaterThanOrEqual(44);
    expect(dimensions.left).toBeGreaterThanOrEqual(0); expect(dimensions.right).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('[data-common="currentCP"]').fill('0');
  await expect(page.locator('[data-event-results] [role="alert"]')).toHaveCount(0);
});
