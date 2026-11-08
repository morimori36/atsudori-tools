import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { starBudgetFixture } from '../helpers/star-budget';
import { STAR_BUDGET_STORAGE_KEY } from '../../src/storage/star-budget';

const menu = 'nav [data-tab="star-budget"]';
const field = (page: Page, name: string) => page.locator(`#star-budget-form [name="${name}"]`);
const balance = (page: Page, grade = 'premium') => page.locator(`[data-budget-balance="${grade}"]`);
async function setup(page: Page) {
  await page.goto('./');
  await page.evaluate(({ input, key }) => {
    localStorage.setItem(key, JSON.stringify(input));
    localStorage.setItem('atsudori-tools.economy-scenario.v4', '{"old":"preserve"}');
  }, { input: starBudgetFixture(), key: STAR_BUDGET_STORAGE_KEY });
  await page.reload(); await page.locator(menu).click();
}

test('starts independently with unknown definitions and saves manual assumptions without a catalog', async ({ page }) => {
  await page.goto('./'); await page.locator(menu).click();
  await expect(page.getByRole('heading', { name: 'スター予算', exact: true })).toBeVisible();
  await expect(page.locator('.budget-comparison thead th')).toHaveText(['項目', 'なし', 'Lite', 'Standard', 'Premium']);
  await expect(balance(page)).toHaveText('算出不可');
  expect(await page.evaluate(key => localStorage.getItem(key), STAR_BUDGET_STORAGE_KEY)).toBeNull();
  await page.locator('[data-section=daily] > summary').click();
  await field(page, 'definition.loginDaily.value').fill('3');
  await expect(field(page, 'definition.loginDaily.status')).toHaveValue('assumed');
  await expect(field(page, 'definition.loginDaily.basis')).toHaveValue('手入力の仮定');
  await field(page, 'definition.loginDaily.status').selectOption('confirmed');
  await field(page, 'definition.loginDaily.value').fill('4');
  await expect(field(page, 'definition.loginDaily.status')).toHaveValue('assumed');
  await expect(page.locator('.save-state')).toHaveText('スター予算 自動保存');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STAR_BUDGET_STORAGE_KEY);
  expect(stored.definition.loginDaily.value).toBe(4); expect(stored.definition.missionDaily.value).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('atsudori-tools.catalog.v1'))).toBeNull();
  await page.reload(); await page.locator(menu).click();
  await page.locator('[data-section=daily] > summary').click();
  await expect(field(page, 'definition.loginDaily.value')).toHaveValue('4');
  await expect(balance(page)).toHaveText('算出不可');
});

test('compares all passes, recalculates full exchanges immediately, and preserves other storage', async ({ page }) => {
  await setup(page);
  await expect(balance(page)).toHaveText('+106.17');
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('star-budget'))));
  await expect(page.locator('[data-budget-product=skill-sp] [data-product-cost]')).toHaveText('240');
  await field(page, 'selected-sr-1').uncheck(); await expect(balance(page)).toHaveText('+396.17');
  await field(page, 'selected-sr-1').check(); await field(page, 'scenario.rank').fill('12');
  await expect(balance(page)).toHaveText('+346.17');
  await expect(page.locator('[data-budget-product=skill-sp] [data-product-status]')).toContainText('未解放');
  await expect(page.locator('[data-budget-product=skill-sp] [data-product-cost]')).toHaveText('0');
  await field(page, 'scenario.rank').fill('13'); await field(page, 'scenario.storyEventPercent').fill('0');
  await expect(balance(page)).toHaveText('-51.33');
  await field(page, 'scenario.storyEventPercent').fill('100'); await field(page, 'scenario.seasonPremium').uncheck();
  await expect(balance(page)).toHaveText('-313.83');
  await field(page, 'scenario.seasonPremium').check(); await field(page, 'scenario.eventPremium').check();
  await expect(balance(page)).toHaveText('+106.17');
  await page.locator('[data-section=supply] > summary').click();
  await expect(page.locator('[data-budget-source=event-premium] td').first()).toHaveText('0');
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('star-budget'))))).toEqual(before);
  await page.reload(); await page.locator(menu).click(); await expect(balance(page)).toHaveText('+106.17');
  await expect(field(page, 'scenario.eventPremium')).toBeChecked();
});

test('edits price tiers and returns to unknown until a new tier is defined', async ({ page }) => {
  await setup(page);
  await page.locator('[data-section=products] > summary').click();
  await page.locator('[data-section=product-crystal-luck] > summary').click();
  await field(page, 'definition.products.0.tiers.0.starCost.value').fill('13');
  await expect(balance(page)).toHaveText('+101.17');
  await page.locator('[data-add-tier="0"]').click(); await expect(balance(page)).toHaveText('算出不可');
  await field(page, 'definition.products.0.tiers.1.starCost.value').fill('2');
  await field(page, 'definition.products.0.tiers.1.weeklyLimit.value').fill('3');
  await expect(balance(page)).toHaveText('+95.17');
  await page.locator('[data-remove-tier="0:1"]').click(); await expect(balance(page)).toHaveText('+101.17');
  await page.reload(); await page.locator(menu).click(); await expect(balance(page)).toHaveText('+101.17');
});

test('imports and exports versioned definitions, rejects invalid files atomically, and serves its schema', async ({ page }) => {
  await page.goto('./'); await page.locator(menu).click();
  const input = starBudgetFixture();
  input.definition.products[0]!.name = '<img src=x onerror="alert(1)">';
  await page.locator('[data-budget-file]').setInputFiles({ name: 'fictional-budget.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(balance(page)).toHaveText('+106.17');
  await expect(page.locator('[data-budget-message]')).toContainText('Import・保存しました');
  await expect(page.locator('[data-budget-product=crystal-luck] label')).toHaveText(input.definition.products[0]!.name);
  await expect(page.locator('#star-budget img')).toHaveCount(0);
  const pending = page.waitForEvent('download'); await page.locator('[data-budget-export]').click(); const file = await pending;
  const stream = await file.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(input);
  const before = await page.evaluate(key => localStorage.getItem(key), STAR_BUDGET_STORAGE_KEY);
  await page.locator('[data-budget-file]').setInputFiles({ name: 'future-budget.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...input, schemaVersion: 99 })) });
  await expect(page.locator('[data-budget-message]')).toContainText('未対応'); await expect(balance(page)).toHaveText('+106.17');
  expect(await page.evaluate(key => localStorage.getItem(key), STAR_BUDGET_STORAGE_KEY)).toBe(before);
  const response = await page.request.get('schemas/star-budget-v1.schema.json'); expect(response.ok()).toBe(true);
});

test('protects damaged saved bytes and allows recovery only after an explicit import', async ({ page }) => {
  const raw = '{"format":"atsudori-tools/star-budget","schemaVersion":0}';
  await page.goto('./'); await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STAR_BUDGET_STORAGE_KEY, raw });
  await page.reload(); await page.locator(menu).click();
  await expect(field(page, 'scenario.rank')).toBeDisabled(); await expect(balance(page)).toHaveCount(0);
  await expect(page.locator('.save-state')).toContainText('保護中');
  const pending = page.waitForEvent('download'); await page.locator('[data-budget-original]').click(); const file = await pending;
  const stream = await file.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), STAR_BUDGET_STORAGE_KEY)).toBe(raw);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-budget-file]').setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(starBudgetFixture())) });
  await expect(field(page, 'scenario.rank')).toBeEnabled(); await expect(balance(page)).toHaveText('+106.17');
});

test('keeps failed manual saves exportable and failed imports and resets leave current data intact', async ({ page }) => {
  await setup(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) { if (k === key) throw new Error('quota'); original.call(this, k, value); };
  }, STAR_BUDGET_STORAGE_KEY);
  await field(page, 'scenario.rank').fill('12'); await expect(balance(page)).toHaveText('+346.17');
  await expect(page.locator('.save-state')).toContainText('保存未完了');
  await expect(page.locator('[data-budget-message]')).toContainText('保存できません');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).scenario.rank, STAR_BUDGET_STORAGE_KEY)).toBe(13);
  const next = starBudgetFixture(); next.scenario.rank = 15;
  await page.locator('[data-budget-file]').setInputFiles({ name: 'cannot-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(next)) });
  await expect(page.locator('[data-budget-message]')).toContainText('現在のデータは変更していません');
  await expect(field(page, 'scenario.rank')).toHaveValue('12'); await expect(balance(page)).toHaveText('+346.17');
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-budget-reset]').click();
  await expect(page.locator('[data-budget-message]')).toContainText('保存できません');
  await expect(field(page, 'scenario.rank')).toHaveValue('12');
  const pending = page.waitForEvent('download'); await page.locator('[data-budget-export]').click(); const file = await pending;
  const stream = await file.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString()).scenario.rank).toBe(12);
});

test('retains invalid drafts across navigation and ignores an import overtaken by a newer edit', async ({ page }) => {
  await setup(page);
  await field(page, 'scenario.rank').fill('0'); await expect(page.locator('[data-budget-message]')).toContainText('未保存');
  await expect(balance(page)).toHaveCount(0);
  await page.locator('nav [data-tab=manual]').click(); await page.locator(menu).click();
  await expect(field(page, 'scenario.rank')).toHaveValue('0'); await expect(page.locator('.save-state')).toContainText('未保存');
  await field(page, 'scenario.rank').fill('13'); await expect(balance(page)).toHaveText('+106.17');
  await field(page, 'scenario.rank').focus();
  await field(page, 'scenario.rank').press('ControlOrMeta+A');
  await field(page, 'scenario.rank').pressSequentially('-');
  expect(await field(page, 'scenario.rank').evaluate(el => (el as HTMLInputElement).validity.badInput)).toBe(true);
  await expect(page.locator('.save-state')).toContainText('未保存');
  await page.locator('nav [data-tab=manual]').click(); await page.locator(menu).click();
  await expect(page.locator('.save-state')).toContainText('未保存');
  await expect(balance(page)).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).scenario.rank, STAR_BUDGET_STORAGE_KEY)).toBe(13);
  await field(page, 'scenario.rank').fill('13'); await expect(balance(page)).toHaveText('+106.17');
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () { return new Promise<string>(resolve => { (window as unknown as { releaseBudgetImport: () => void }).releaseBudgetImport = () => { void original.call(this).then(resolve); }; }); };
  });
  const next = starBudgetFixture(); next.scenario.rank = 12;
  await page.locator('[data-budget-file]').setInputFiles({ name: 'delayed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(next)) });
  await field(page, 'scenario.rank').fill('14');
  await page.evaluate(() => (window as unknown as { releaseBudgetImport: () => void }).releaseBudgetImport());
  await expect(field(page, 'scenario.rank')).toHaveValue('14');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).scenario.rank, STAR_BUDGET_STORAGE_KEY)).toBe(14);
});

test('keeps all four comparisons accessible on narrow dark screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await setup(page);
  await page.locator('[data-theme]').selectOption('dark');
  await expect(balance(page)).toHaveText('+106.17');
  const overflow = await page.evaluate(() => [...document.querySelectorAll('main,.panel,.budget-form-body,.form-grid,input')].filter(el => el.getBoundingClientRect().right > innerWidth).map(el => ({ tag: el.tagName, class: el.className, name: el.getAttribute('name'), right: el.getBoundingClientRect().right })).slice(0, 10));
  await page.screenshot({ path: '.cache/star-budget/mobile-before.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow)).toBe(true);
  const scroll = page.locator('.budget-comparison').locator('..');
  await balance(page).scrollIntoViewIfNeeded();
  expect(await scroll.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(balance(page)).toBeInViewport();
  const visible = await scroll.boundingBox(), premiumHeader = await page.locator('.budget-comparison thead th').last().boundingBox();
  expect(premiumHeader!.x).toBeGreaterThanOrEqual(visible!.x + 110);
  expect(premiumHeader!.x + premiumHeader!.width).toBeLessThanOrEqual(visible!.x + visible!.width + 1);
  expect(await field(page, 'scenario.rank').evaluate(el => getComputedStyle(el).fontSize)).toBe('16px');
  await page.screenshot({ path: '.cache/star-budget/mobile-dark.png', fullPage: true });
});
