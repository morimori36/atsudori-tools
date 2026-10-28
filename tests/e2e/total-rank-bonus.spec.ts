import {test,expect} from '@playwright/test';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {fictionalRules} from '../helpers/rank-rules';
import {STORAGE_KEY} from '../../src/storage/local';
const file=(value:unknown)=>({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});

test('legacy ownership stays readable; unknown bonus holds rating; explicit zero survives reload',async({page})=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);delete c.totalRankBonus;
  await page.goto('./');await page.locator('nav [data-tab=exchange]').click();
  await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(m));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await page.locator('nav [data-tab=exchange]').click();await page.locator('#import-file').setInputFiles(file(c));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await page.locator('nav [data-tab=rating]').click();await expect(page.locator('.band-result .rating-total strong')).toHaveText('—');
  await expect(page.locator('.band-result')).toContainText('総合ランクボーナス');
  await page.locator('nav [data-tab=progress]').click();await page.locator('[data-progress-section=total-rank] summary').click();await page.locator('#totalRankBonus').fill('0');await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('[data-total-rank-bonus]')).toContainText('+0（手入力）');
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).totalRankBonus,STORAGE_KEY)).toBe(0);
  await page.reload();await page.locator('nav [data-tab=progress]').click();await expect(page.locator('#totalRankBonus')).toHaveValue('0');
  await page.locator('nav [data-tab=rating]').click();await expect(page.locator('.band-result .rating-total strong')).not.toHaveText('—');
  await page.locator('nav [data-tab=progress]').click();await page.locator('[data-progress-section=total-rank] summary').click();await page.locator('#totalRankBonus').fill('');await page.locator('#progress-form button[type=submit]').click();
  await page.locator('nav [data-tab=rating]').click();await expect(page.locator('.band-result .rating-total strong')).toHaveText('—');
});

test('imported bonus thresholds drive the rating and maximum training uses current ranks',async({page})=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);delete c.totalRankBonus;
  const rules=await fictionalRules(m);rules.totalRankBonuses=[{rank:0,bonus:13},{rank:4,bonus:29}];
  await page.goto('./');await page.locator('nav [data-tab=exchange]').click();await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(m));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await page.locator('nav [data-tab=exchange]').click();await page.locator('#import-file').setInputFiles(file(c));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  const {format,schemaVersion,catalog,...rankDefinition}=rules;
  await page.locator('nav [data-tab=exchange]').click();await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file({...m,rankDefinition}));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await page.locator('nav [data-tab=progress]').click();await expect(page.locator('[data-total-rank-bonus]')).toContainText('+13（ランク定義から算出）');
  await page.locator('nav [data-tab=rating]').click();await expect(page.locator('.band-result .rating-total strong')).toHaveText('732');
  await page.locator('input[name=rating-mode][value=potential]').check();
  await page.locator('nav [data-tab=progress]').click();await expect(page.locator('[data-total-rank-bonus]')).toContainText('+13');
  await page.locator('#rank-8201').fill('7');
  await expect(page.locator('[data-total-rank-bonus]')).toContainText('+29');
  await page.locator('#progress-form button[type=submit]').click();await page.locator('nav [data-tab=rating]').click();
  await page.locator('input[name=rating-mode][value=current]').check();await expect(page.locator('.band-result .rating-total strong')).toHaveText('854');
  await page.reload();await expect(page.locator('.band-result .rating-total strong')).toHaveText('854');
});

test('manual calculation requires an explicit bonus rather than silently using a legacy constant',async({page})=>{
  await page.goto('./');await page.locator('nav [data-tab=manual]').click();await page.locator('#manual-example').click();
  await page.locator('#manualTotalRankBonus').fill('');await page.locator('#manual-form button[type=submit]').click();
  await expect(page.locator('#manual-output strong')).toHaveCount(0);
  await page.locator('#manualTotalRankBonus').fill('50');await page.locator('#manual-form button[type=submit]').click();
  await expect(page.locator('#manual-output strong')).toHaveText('1,082');
});
