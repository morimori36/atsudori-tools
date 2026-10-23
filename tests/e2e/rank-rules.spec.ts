import { test,expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCatalog,syntheticCollection } from '../helpers/synthetic';
import { fictionalRules } from '../helpers/rank-rules';
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
  await page.locator('#conversion-profile-file').setInputFiles(file(await fictionalProfile()));await page.locator('#conversion-profile-apply').click();await page.locator('#conversion-complete').check();await page.locator('#conversion-preview').click();await expect(page.locator('#conversion-download')).toBeVisible();
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await tab(page,'progress');await page.locator('[data-rank-summary]').click();await page.locator('#rank-8201').fill('');await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('[data-effective-rank]')).toHaveText('—');await expect(page.locator('[data-total-character-rank]')).toContainText('未算出');
  await tab(page,'rating');await expect(page.locator('.band-result')).toContainText('ランク定義');
  await tab(page,'exchange');await expect(page.locator('#conversion-preview')).toBeDisabled();await expect(page.locator('.conversion-panel')).toContainText('ランク定義');
  await tab(page,'members');await page.locator('[data-member-card="8301"] input[name=liveSkillLevel][value="2"]').check();await tab(page,'exchange');expect(JSON.parse(await download(page,'#export-button')).members[0].liveSkillLevel).toBe(2);
});
test('imports rules independently, estimates only after confirmation, and backs up/restores definitions',async({page})=>{
  await page.setViewportSize({width:375,height:812});const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await tab(page,'rules');await page.locator('#rank-rules-file').setInputFiles(file(await fictionalRules()));
  expect(await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY)).toBeNull();await page.locator('#rank-rules-apply').click();
  await expect(page.locator('#rank-rules')).toContainText('test-9');await expect(page.locator('#rank-rules')).toContainText('一致');
  const backup=await download(page,'#rank-rules-export');expect(JSON.parse(backup)).toEqual(await fictionalRules());
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText(/推定 2.*EXP 17.*使用ランク 3/);
  await page.locator('[data-rank-summary]').click();await page.locator('#rank-8201').fill('');await page.locator('#progress-form button[type=submit]').click();
  await page.reload();await tab(page,'progress');await expect(page.locator('[data-effective-rank]')).toHaveText('2');
  const saved=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await page.evaluate(k=>localStorage.removeItem(k),RANK_RULES_STORAGE_KEY);await page.reload();await tab(page,'rules');await page.locator('#rank-rules-file').setInputFiles(file(backup));await page.locator('#rank-rules-apply').click();
  await tab(page,'progress');await expect(page.locator('[data-effective-rank]')).toHaveText('2');expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(saved);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('rejects invalid JSON, duplicate thresholds, incompatible versions and master bytes without writes',async({page})=>{
  const rules=await fictionalRules();await tab(page,'rules');await page.locator('#rank-rules-file').setInputFiles(file(rules));await page.locator('#rank-rules-apply').click();
  const before=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,RANK_RULES_STORAGE_KEY]);
  const duplicate=structuredClone(rules);duplicate.achievements[0]!.thresholds=[3,3];
  for(const bad of ['{',duplicate,{...rules,schemaVersion:83},{...rules,catalog:{...rules.catalog,revision:'future'}},{...rules,catalog:{...rules.catalog,sha256:'a'.repeat(64)}}]){
    await page.locator('#rank-rules-file').setInputFiles(file(bad));await expect(page.locator('#rank-rules-apply')).toHaveCount(0);await expect(page.locator('#rank-rules [role=status]')).toBeVisible();
    expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,RANK_RULES_STORAGE_KEY])).toEqual(before);
  }
});
test('preserves damaged rules until explicit recovery and preserves previous bytes after quota failure',async({page})=>{
  await page.evaluate(k=>localStorage.setItem(k,'{damaged'),RANK_RULES_STORAGE_KEY);await page.reload();await tab(page,'rules');
  await expect(page.locator('#rank-rules')).toContainText('元JSONを保護');expect(await download(page,'#rank-rules-original')).toBe('{damaged');
  const rules=await fictionalRules();await page.locator('#rank-rules-file').setInputFiles(file(rules));await page.locator('#rank-rules-apply').click();const before=await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY);
  const next={...rules,version:'test-10'};await page.locator('#rank-rules-file').setInputFiles(file(next));await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});await page.locator('#rank-rules-apply').click();
  await expect(page.locator('#rank-rules')).toContainText('ブラウザ保存未完了');expect(await page.evaluate(k=>localStorage.getItem(k),RANK_RULES_STORAGE_KEY)).toBe(before);expect(JSON.parse(await download(page,'#rank-rules-export')).version).toBe('test-10');
});
test('catalog replacement disables stale rules while preserving overrides, progress and original definition bytes',async({page})=>{
  await tab(page,'rules');await page.locator('#rank-rules-file').setInputFiles(file(await fictionalRules()));await page.locator('#rank-rules-apply').click();
  const before=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,RANK_RULES_STORAGE_KEY]);
  const changed=syntheticCatalog();changed.revision='test-10';await tab(page,'catalog');await page.locator('#catalog-import').setInputFiles(file(changed));await page.locator('#catalog-apply').click();
  await tab(page,'rules');await expect(page.locator('#rank-rules')).toContainText('推定を停止');
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText(/推定 —.*手動上書き中.*使用ランク 3/);
  expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,RANK_RULES_STORAGE_KEY])).toEqual(before);
});
