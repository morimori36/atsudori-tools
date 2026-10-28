import { test,expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCatalog,syntheticCollection } from '../helpers/synthetic';
import { fictionalRules, fictionalCatalog } from '../helpers/rank-rules';
import { fictionalProfile } from '../helpers/conversion';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
const RANK_RULES_STORAGE_KEY='atsudori-tools.character-rank-rules.v1';
const file=(v:unknown)=>({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(typeof v==='string'?v:JSON.stringify(v))});
const tab=(p:Page,id:string)=>p.locator('nav [data-tab='+id+']').click();
const download=async(p:Page,id:string)=>{const [d]=await Promise.all([p.waitForEvent('download'),p.locator(id).click()]);return readFile((await d.path())!,'utf8');};
test.beforeEach(async({page})=>{
  const m=syntheticCatalog(),c={...syntheticCollection(m),characterProgress:{8201:{stamps:9,skillLevel5:97}}};
  await page.addInitScript(({m,c,k,s})=>{if(!localStorage.getItem(k)){localStorage.setItem(k,JSON.stringify(m));localStorage.setItem(s,JSON.stringify(c));}},{m,c,k:CATALOG_STORAGE_KEY,s:STORAGE_KEY});
  await page.goto('./');
});
test('missing rules retain manual ranks, ownership editing, backup and manual-only profile export',async({page})=>{
  const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText(/推定 —.*EXP —.*手動上書き中.*使用ランク 3/);
  await tab(page,'rating');await expect(page.locator('.band-result .rating-total strong')).toHaveText('857');
  await tab(page,'exchange');expect(await download(page,'#export-button')).toContain('skillLevel5');
  await page.locator('#conversion-profile-file').setInputFiles(file(await fictionalProfile()));await expect(page.locator('#conversion-preview')).toBeEnabled();await download(page,'#conversion-preview');
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await tab(page,'progress');await page.locator('#rank-8201').fill('');await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('[data-effective-rank]')).toHaveText('—');await expect(page.locator('[data-total-character-rank]')).toContainText('未算出');
  await tab(page,'rating');await expect(page.locator('.band-result')).toContainText('ランク定義');
  await tab(page,'exchange');await expect(page.locator('#conversion-preview')).toBeDisabled();await expect(page.locator('#conversion-export')).toContainText('ランク定義');
  await tab(page,'members');await page.locator('[data-member-card="8301"] input[name=liveSkillLevel][value="2"]').check();await tab(page,'exchange');expect(JSON.parse(await download(page,'#export-button')).members[0].liveSkillLevel).toBe(2);
});
test('imports, backs up and restores all static definitions with catalog alone',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await expect(page.locator('nav [data-tab=rules]')).toHaveCount(0);
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file(await fictionalCatalog()));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();

  await tab(page,'exchange');const backup=await download(page,'#catalog-export');expect(JSON.parse(backup).rankDefinition.rankThresholds).toEqual((await fictionalRules()).rankThresholds);
  expect(JSON.parse(backup).rankDefinition.totalRankBonuses).toEqual((await fictionalRules()).totalRankBonuses);
  expect(JSON.parse(backup).rankDefinition).not.toHaveProperty('catalog');
  expect(await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await tab(page,'progress');await page.locator('#rank-8201').fill('');await page.locator('#progress-form button[type=submit]').click();
  await page.reload();await tab(page,'progress');await expect(page.locator('[data-effective-rank]')).toHaveText('2');
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file(syntheticCatalog()));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();

  await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(backup));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'progress');await expect(page.locator('[data-effective-rank]')).toHaveText('2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('saved legacy definitions remain untouched and do not enable estimation or migration UI',async({page})=>{
  const raw=JSON.stringify(await fictionalRules());
  await page.evaluate(({k,raw})=>localStorage.setItem(k,raw),{k:RANK_RULES_STORAGE_KEY,raw});await page.reload();
  const before=await page.evaluate(()=>({...localStorage}));
  await tab(page,'exchange');
  await expect(page.locator('[data-tab=catalog], #rank-rules, #rank-rules-file')).toHaveCount(0);
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText('推定 —');
  expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
});
