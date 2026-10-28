import {fictionalCatalog} from '../helpers/rank-rules';
import { test, expect } from '@playwright/test';
import type {Page} from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { fictionalProfile } from '../helpers/conversion';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';
import { PROFILE_STORAGE_KEY } from '../../src/ui/conversion-export';
const file=(v:unknown)=>({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(v))});
const master=()=>{const m=syntheticCatalog();m.members[0]!.liveSkillLevels=[1,2,3,4,5];m.members[0]!.gekisouSkillLevels=[1,2,3,4,5];return m;};
const download=async(page:Page,id:string)=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(id).click()]);return JSON.parse(await readFile((await d.path())!,'utf8'));};
const profile=async(page:Page)=>{await page.locator('#conversion-profile-file').setInputFiles(file(await fictionalProfile(master())));await expect(page.locator('#conversion-export')).toContainText('プロファイルを更新しました');await expect(page.locator('#conversion-preview')).toBeEnabled();};
test.beforeEach(async({page})=>{
  await page.goto('./');await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#catalog-import').setInputFiles(file(await fictionalCatalog(master())));await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  const owned=syntheticCollection(master());owned.characterRanks={};
  await page.locator('#import-file').setInputFiles(file(owned));await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
});
test('one-click exports, shared saved settings and reload never change real ownership',async({page})=>{
  await profile(page);
  const before=await page.evaluate(([c,m])=>[localStorage.getItem(c!),localStorage.getItem(m!)],[STORAGE_KEY,CATALOG_STORAGE_KEY]);
  expect((await download(page,'#conversion-preview')).roster).toEqual([{id:8301,outLive:1,outGeki:1}]);
  expect((await download(page,'#conversion-profile-backup')).format).toBe('atsudori-tools/conversion-profile');
  expect((await download(page,'#catalog-export')).catalogId).toBe(master().catalogId);
  await page.locator('#conversion-export summary').filter({hasText:'仮育成設定'}).click();
  await page.locator('#conversion-training').check();
  await page.locator('[data-training=liveSkillLevel]').selectOption('4');await page.locator('[data-training=gekisouSkillLevel]').selectOption('4');
  expect((await download(page,'#conversion-preview')).roster).toEqual([{id:8301,outLive:4,outGeki:4}]);
  expect(await page.evaluate(([c,m])=>[localStorage.getItem(c!),localStorage.getItem(m!)],[STORAGE_KEY,CATALOG_STORAGE_KEY])).toEqual(before);
  await page.reload();await page.locator('nav [data-tab=exchange]').click();
  expect((await download(page,'#conversion-preview')).roster).toEqual([{id:8301,outLive:4,outGeki:4}]);
  for(const width of [320,375,390,1280]) {await page.setViewportSize({width,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.screenshot({path:'test-results/json-exchange-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:812});await page.screenshot({path:'test-results/json-exchange-mobile.png',fullPage:true});
  await page.locator('[data-file=import-file]').focus();
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-file=import-file]').press('Enter');await (await chooser).setFiles([]);
});
test('profile updates immediately use new definitions; mismatches and failed persistence preserve previous profile',async({page})=>{
  await profile(page);
  const p=await fictionalProfile(master());p.version='fictional-update';
  if(p.program.op==='object') p.program.fields.nonce={op:'literal',value:'updated-definition'};
  // Recompute the contract checksum after changing the declaration.
  const {digest}=await import('../../src/domain/conversion/profile');
  const {checksum:_,...base}=p;p.checksum=await digest(base);
  await page.locator('#conversion-profile-file').setInputFiles(file(p));await expect(page.locator('#conversion-export')).toContainText('プロファイルを更新しました');
  expect((await download(page,'#conversion-profile-backup')).version).toBe('fictional-update');
  expect((await download(page,'#conversion-preview')).nonce).toBe('updated-definition');
  const before=await page.evaluate(k=>localStorage.getItem(k),PROFILE_STORAGE_KEY);
  await page.locator('#conversion-profile-file').setInputFiles(file({unknown:true}));await expect(page.locator('#conversion-export')).not.toContainText('検証中…');
  expect(await page.evaluate(k=>localStorage.getItem(k),PROFILE_STORAGE_KEY)).toBe(before);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
  await page.locator('#conversion-profile-file').setInputFiles(file(await fictionalProfile(master())));await expect(page.locator('#conversion-export')).toContainText('保存できません');
  expect((await download(page,'#conversion-profile-backup')).version).toBe('fictional-update');
});
test('catalog drift and missing item facts block downloads',async({page})=>{
  await profile(page);const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()));
  const changed=master();changed.revision='changed';
  await page.locator('#catalog-import').setInputFiles(file(changed));await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  await expect(page.locator('#conversion-export')).toContainText('一致しません');await expect(page.locator('#conversion-preview')).toBeDisabled();
  const before=await page.evaluate(k=>localStorage.getItem(k),PROFILE_STORAGE_KEY);
  await page.locator('#conversion-profile-file').setInputFiles(file(await fictionalProfile(master())));await expect(page.locator('#conversion-export')).toContainText('一致しません');
  expect(await page.evaluate(k=>localStorage.getItem(k),PROFILE_STORAGE_KEY)).toBe(before);
  const owned=syntheticCollection(master());owned.bandItems={};await page.locator('#import-file').setInputFiles(file(owned));await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
  await expect(page.locator('#conversion-export')).toContainText('所持状態が未入力');expect(downloads).toEqual([]);
});

test('shared training controls retain focus and share values with rating across navigation',async({page})=>{
  await page.locator('nav [data-tab=rating]').click();
  await page.locator('[data-training=awakeningStage]').focus();
  await page.locator('[data-training=awakeningStage]').selectOption('2');
  await expect(page.locator('[data-training=awakeningStage]')).toBeFocused();
  await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#conversion-export summary').filter({hasText:'仮育成設定'}).click();
  await expect(page.locator('[data-training=awakeningStage]')).toHaveValue('2');
  await page.locator('[data-training=liveSkillLevel]').focus();
  await page.locator('[data-training=liveSkillLevel]').selectOption('3');
  await expect(page.locator('[data-training=liveSkillLevel]')).toBeFocused();
  await page.locator('nav [data-tab=rating]').click();
  await expect(page.locator('[data-training=liveSkillLevel]')).toHaveValue('3');
});

test('corrupt profiles remain recoverable until successful automatic replacement',async({page})=>{
  const raw='{"unknown":"original"}';await page.evaluate(([k,v])=>localStorage.setItem(k!,v!),[PROFILE_STORAGE_KEY,raw]);
  await page.reload();await page.locator('nav [data-tab=exchange]').click();
  await expect(page.locator('#conversion-export')).toContainText('元JSONを保護');
  await page.locator('#conversion-profile-file').setInputFiles(file({invalid:true}));
  await expect(page.locator('#conversion-export')).toContainText('profile.invalid');
  expect(await page.evaluate(k=>localStorage.getItem(k),PROFILE_STORAGE_KEY)).toBe(raw);
  await profile(page);
  expect(await page.evaluate(k=>localStorage.getItem(k),PROFILE_STORAGE_KEY)).not.toBe(raw);
});
