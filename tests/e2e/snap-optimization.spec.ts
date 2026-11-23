import { chooseScreen } from '../helpers/navigation';
import {test,expect} from '@playwright/test';
import {fictionalCatalog} from '../helpers/rank-rules';
import {snapOptimizationFixture} from '../helpers/snap-optimization';
const file=(value:unknown)=>({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
for(const width of [1280,390])test(`optimizes shared and dedicated Snaps and preserves owned JSON at ${width}px`,async({page})=>{
  const {master,collection}=snapOptimizationFixture();
  await page.setViewportSize({width,height:844});await page.goto('./');
  await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
  await page.locator('#catalog-import').setInputFiles(file(await fictionalCatalog(master)));
  await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  await page.locator('#import-file').setInputFiles(file(collection));
  await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
  const bytes=()=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
  const before=await bytes();
  await chooseScreen(page, page.locator('nav [data-tab=rating]'));
  const row=page.locator('[data-rating-slot]');
  const selectCharacter = async (index: number) => {
    if ((page.viewportSize()?.width ?? 1280) <= 700) {
      await page.getByLabel('キャラクター', { exact: true }).selectOption({ index });
    } else {
      await page.locator('.rating-rail [data-rating-pick="character"]').nth(index).click();
    }
  };
  const snap = row.locator('[data-rating-role="snap"]');
  await expect(row).toHaveCount(1);
  await expect(snap).toContainText('架空専用Snap');
  await expect(row.locator('.slot-rating')).toHaveText('793');
  await selectCharacter(1);
  await expect(snap).toContainText('架空共有Snap');
  await expect(row.locator('.slot-rating')).toHaveText('857');
  await expect(page.locator('.color-total strong')).toHaveText('1,650');
  await page.locator('input[name=rating-mode][value=potential]').check();
  await expect(snap).toContainText('架空共有Snap');
  await expect(row.locator('.slot-rating')).toHaveText('1,282');
  await selectCharacter(0);
  await expect(snap).toContainText('架空専用Snap');
  await expect(row.locator('.slot-rating')).toHaveText('1,187');
  await expect(page.locator('.color-total strong')).toHaveText('2,469');
  expect(await bytes()).toEqual(before);
  await page.reload();
  await expect(page.locator('.color-total strong')).toHaveText('1,650');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('E chooses Snap score over member rating and keeps allocation when rating is pending',async({page})=>{
  const {master,collection}=snapOptimizationFixture();
  master.snaps[1]!.characterIds=[8202];
  // Independently invented asymmetry: a stronger B tempts C to consume the shared Snap.
  master.members[1]!.maxStats={performance:303,technic:609,visual:921};
  await page.goto('./');
  await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
  await page.locator('#catalog-import').setInputFiles(file(await fictionalCatalog(master)));
  await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  await page.locator('#import-file').setInputFiles(file(collection));
  await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
  const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
  await chooseScreen(page, page.locator('nav [data-tab=rating]'));
  const row=page.locator('[data-rating-slot]');
  const selectCharacter = async (index: number) => {
    if ((page.viewportSize()?.width ?? 1280) <= 700) {
      await page.getByLabel('キャラクター', { exact: true }).selectOption({ index });
    } else {
      await page.locator('.rating-rail [data-rating-pick="character"]').nth(index).click();
    }
  };
  const snap = row.locator('[data-rating-role="snap"]');
  for(const mode of ['current','potential']) {
    await page.locator(`input[name=rating-mode][value=${mode}]`).check();
    await selectCharacter(0);
    await expect(snap).toContainText('架空共有Snap');
    await expect(row.locator('.slot-rating')).toHaveCount(1);
    await selectCharacter(1);
    await expect(snap).toContainText('架空専用Snap');
    await expect(row.locator('.slot-rating')).toHaveCount(1);
  }
  expect(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
  collection.bandItems={};
  await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
  await page.locator('#import-file').setInputFiles(file(collection));
  await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
  await chooseScreen(page, page.locator('nav [data-tab=rating]'));
  await selectCharacter(1);
  await expect(snap).toContainText('架空専用Snap');
  await expect(row.locator('.slot-rating')).toHaveCount(0);
  await expect(page.locator('.color-total')).toContainText('保留');
});
