import { test,expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCatalog,syntheticCollection } from '../helpers/synthetic';
import { fictionalRules, fictionalCatalog } from '../helpers/rank-rules';
import { fictionalProfile } from '../helpers/conversion';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { RANK_RULES_STORAGE_KEY } from '../../src/ui/rank-rules';
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
  await tab(page,'catalog');await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(await fictionalCatalog()));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'catalog');await expect(page.locator('#rank-rules')).toContainText('test-9');
  await tab(page,'exchange');const backup=await download(page,'#catalog-export');expect(JSON.parse(backup).rankDefinition.rankThresholds).toEqual((await fictionalRules()).rankThresholds);
  expect(JSON.parse(backup).rankDefinition.totalRankBonuses).toEqual((await fictionalRules()).totalRankBonuses);
  expect(JSON.parse(backup).rankDefinition).not.toHaveProperty('catalog');
  expect(await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await tab(page,'progress');await page.locator('#rank-8201').fill('');await page.locator('#progress-form button[type=submit]').click();
  await page.reload();await tab(page,'progress');await expect(page.locator('[data-effective-rank]')).toHaveText('2');
  await tab(page,'catalog');await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(syntheticCatalog()));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'catalog');await expect(page.locator('#rank-rules')).toContainText('未登録');
  await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(backup));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'progress');await expect(page.locator('[data-effective-rank]')).toHaveText('2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('offers saved legacy definitions for verified migration without changing legacy or ownership bytes',async({page})=>{
  const rules=await fictionalRules();const raw=JSON.stringify(rules,null,1);
  await page.evaluate(({k,raw})=>localStorage.setItem(k,raw),{k:RANK_RULES_STORAGE_KEY,raw});await page.reload();
  const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await expect(page.getByText('旧ランク定義が保存されています。', {exact:false})).toBeVisible();
  await tab(page,'catalog');await expect(page.locator('#rank-rules-apply')).toBeVisible();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).rankDefinition,CATALOG_STORAGE_KEY)).toBeUndefined();
  await page.locator('#rank-rules-apply').click();
  await tab(page,'catalog');await expect(page.locator('#rank-rules')).toContainText('catalogへ統合しました');
  expect(await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY)).toBe(raw);
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await page.reload();await tab(page,'catalog');await expect(page.locator('#rank-rules-apply')).toHaveCount(0);
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText(/推定 2.*EXP 17/);
});
test('rejects invalid legacy definitions without changing catalog, collection or original source',async({page})=>{
  const rules=await fictionalRules();await tab(page,'catalog');
  const before=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY,RANK_RULES_STORAGE_KEY]);
  const duplicate=structuredClone(rules);duplicate.achievements[0]!.thresholds=[3,3];
  for(const bad of ['{',duplicate,{...rules,schemaVersion:83},{...rules,catalog:{...rules.catalog,revision:'future'}},{...rules,catalog:{...rules.catalog,sha256:'a'.repeat(64)}}]){
    await page.locator('#rank-rules-file').setInputFiles(file(bad));await expect(page.locator('#rank-rules-apply')).toHaveCount(0);await expect(page.locator('#rank-rules [role=status]')).toBeVisible();
    expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY,RANK_RULES_STORAGE_KEY])).toEqual(before);
  }
});
test('legacy file imports automatically and failed persistence protects existing definitions',async({page})=>{
  await page.evaluate(k=>localStorage.setItem(k,'{damaged'),RANK_RULES_STORAGE_KEY);await page.reload();await tab(page,'catalog');
  await expect(page.locator('#rank-rules')).toContainText('元JSONを保護');expect(await download(page,'#rank-rules-original')).toBe('{damaged');
  const before=await page.evaluate(k=>localStorage.getItem(k),CATALOG_STORAGE_KEY);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
  await page.locator('#rank-rules-file').setInputFiles(file(await fictionalRules()));
  await expect(page.locator('#rank-rules')).toContainText('マスタを保存できません');
  expect(await page.evaluate(k=>localStorage.getItem(k),CATALOG_STORAGE_KEY)).toBe(before);
  await page.reload();await tab(page,'catalog');
  await page.locator('#rank-rules-file').setInputFiles(file(await fictionalRules()));
  await expect(page.locator('#rank-rules')).toContainText('catalogへ統合しました');
  expect(await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY)).toBe('{damaged');
  await expect(page.locator('#rank-rules-apply')).toHaveCount(0);
});
test('a native catalog wins over an incompatible saved legacy definition',async({page})=>{
  const old=await fictionalRules();old.catalog.revision='old';const raw=JSON.stringify(old);
  await page.evaluate(({k,raw})=>localStorage.setItem(k,raw),{k:RANK_RULES_STORAGE_KEY,raw});await page.reload();
  const catalog=await fictionalCatalog();catalog.rankDefinition!.version='native-10';
  await tab(page,'catalog');await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(catalog));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'catalog');await expect(page.locator('#rank-rules')).toContainText('native-10');await expect(page.locator('#rank-rules-apply')).toHaveCount(0);
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText(/推定 2.*EXP 17/);
  expect(await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY)).toBe(raw);
});
test('editing a table that invalidates embedded ranks reports issues without crashing backup/export',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await tab(page,'catalog');await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file(await fictionalCatalog()));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'catalog');await page.locator('#catalog-table').selectOption('characterRankLevels');await page.locator('#catalog-row').selectOption('3');
  page.once('dialog',d=>d.accept());await page.locator('#catalog-delete').click();
  await tab(page,'catalog');await expect(page.locator('#rank-rules')).toContainText('推定を停止');
  await tab(page,'exchange');expect(JSON.parse(await download(page,'#catalog-export')).rankDefinition.rankThresholds).toHaveLength(4);
  await tab(page,'exchange');await expect(page.locator('#export-button')).toBeVisible();
  expect(errors).toEqual([]);
});
