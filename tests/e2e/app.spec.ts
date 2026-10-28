import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {fictionalCatalog} from '../helpers/rank-rules';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
test('provisional selection notices remain available by hover and keyboard',async({page})=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);
  m.members.push({...m.members[0]!,id:8302,title:'別の架空カード'});
  m.snaps.push({...m.snaps[0]!,id:8504,title:'別の架空Snap'});
  c.members.push({...c.members[0]!,cardId:8302});c.snaps.push({...c.snaps[0]!,supportCardId:8504});
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('ties.json',m));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'exchange');await page.locator('#import-file').setInputFiles(file('ties-owned.json',c));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await tab(page,'rating');const tip=page.locator('.selection-tooltip').first();
  await expect(tip).toBeHidden();await page.locator('.note-marker').first().hover();
  await expect(tip).toBeVisible();await expect(tip).toContainText('ゲーム内の選出順は未確認');
  await page.keyboard.press('Escape');await expect(tip).toBeHidden();
  await page.locator('.note-marker').first().focus();await expect(tip).toBeVisible();
});
const file=(name:string,value:unknown)=>({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
async function tab(page:Page,name:string):Promise<void>{await page.locator('nav [data-tab="'+name+'"]').click();}
async function openRank(page:Page,id=8201):Promise<void>{
  await page.locator(`[data-character-rank="${id}"]`).scrollIntoViewIfNeeded();
}
async function openItems(page:Page):Promise<void>{
  await page.locator('[data-progress-scroll="items"]').scrollIntoViewIfNeeded();
}
async function catalog(page:Page):Promise<void>{
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('fictional-catalog.json',syntheticCatalog()));
  await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await rules(page);await tab(page,'exchange');
}
async function rules(page:Page,m=syntheticCatalog()):Promise<void>{
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('fictional-catalog.json',await fictionalCatalog(m)));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
}
async function collection(page:Page):Promise<void>{
  await tab(page,'exchange');await page.locator('#import-file').setInputFiles(file('fictional-collection.json',syntheticCollection()));
  await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
}
test.beforeEach(async({page})=>{
  const errors:string[]=[];const external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:4173/')&&!req.url().startsWith('data:'))external.push(req.url());});
  await page.goto('./');
  (page as Page & {audit?:()=>void}).audit=()=>{expect(errors).toEqual([]);expect(external).toEqual([]);};
});
test.afterEach(async({page})=>{(page as Page & {audit?:()=>void}).audit?.();});
test('empty catalog boots and manual path computes fictional values',async({page})=>{
  await expect(page.getByRole('heading',{name:'マスタ未登録',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
  await tab(page,'manual');await page.locator('#manual-example').click();await page.locator('#manual-form button[type=submit]').click();
  await expect(page.locator('#manual-output strong')).toHaveText('1,082');
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});
test('catalog import, owned registration, growth, band total and display-only potential',async({page})=>{
  await catalog(page);
  await tab(page,'members');await page.locator('[data-member-card="8301"] [data-ownership-toggle]').click();
  await tab(page,'snaps');await page.locator('[data-snap-card="8501"] [data-ownership-toggle]').click();
  await tab(page,'progress');await openRank(page);await page.locator('#rank-8201').fill('3');await openItems(page);await page.locator('#item-8601').fill('1');
  await page.locator('#progress-form button[type=submit]').click();
  await tab(page,'rating');await expect(page.locator('.band-result .rating-total strong')).toHaveText('857');
  await page.locator('input[name=rating-mode][value=potential]').check();
  await expect(page.locator('.band-result .rating-total strong')).toHaveText('1,214');
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).members[0].level,STORAGE_KEY)).toBe(1);
  await page.reload();await expect(page.locator('.band-result .rating-total strong')).toHaveText('857');
  await tab(page,'snaps');await page.locator('[data-snap-card="8501"] input[name=snapRank][value="2"]').check();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).snaps[0].level,STORAGE_KEY)).toBe(2);
  await tab(page,'rating');await expect(page.locator('.band-result .rating-total strong')).toHaveText('948');
  await tab(page,'snaps');await page.locator('[data-snap-card="8501"] [data-ownership-toggle]').click();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).snaps,STORAGE_KEY)).toEqual([]);
  await tab(page,'members');await page.locator('[data-member-card="8301"] input[name=trainingStage][value="2"]').check();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).members[0].level,STORAGE_KEY)).toBe(2);
  await page.locator('[data-member-card="8301"] [data-ownership-toggle]').click();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).members,STORAGE_KEY)).toEqual([]);
});
test('catalog and collection JSON export/import round trips stay independent',async({page})=>{
  await catalog(page);await collection(page);
  const collectionBytes=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-button').click()]);
  const exported=await readFile((await download.path())!,'utf8');expect(JSON.parse(exported)).toEqual(syntheticCollection());
  await tab(page,'exchange');
  const revised=await fictionalCatalog();revised.revision='test-2';
  await page.locator('#catalog-import').setInputFiles(file('revision.json',revised));await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(collectionBytes);
  await page.locator('nav [data-tab=exchange]').click();
  const [md]=await Promise.all([page.waitForEvent('download'),page.locator('#catalog-export').click()]);
  const masterText=await readFile((await md.path())!,'utf8');
  await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file('roundtrip.json',masterText));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await collection(page);await page.reload();await expect(page.locator('.band-result .rating-total strong')).toHaveText('857');
});
test('invalid JSON, missing data, invalid values and future schemas leave existing bytes intact',async({page})=>{
  await catalog(page);await collection(page);
  const before=await page.evaluate(()=>({...localStorage}));
  await tab(page,'exchange');
  const incomplete=syntheticCatalog();incomplete.memberTraining=[];
  for(const value of ['{broken',incomplete,{...syntheticCatalog(),schemaVersion:2}]){
    await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file('bad.json',value));
    await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('#catalog-apply')).toHaveCount(0);
  }
  await tab(page,'exchange');
  const bad=syntheticCollection();bad.members[0]!.level=99;
  for(const value of ['{bad',bad,{...syntheticCollection(),schemaVersion:2}]){
    await page.locator('#import-file').setInputFiles(file('bad-owned.json',value));
    await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('#apply-import')).toHaveCount(0);
  }
  expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
});
test('catalog imports reject removed owned references and namespace changes',async({page})=>{
  await catalog(page);await collection(page);
  const before=await page.evaluate(()=>({...localStorage}));
  for(const next of [{...syntheticCatalog(),members:[]},{...syntheticCatalog(),catalogId:'different'}]) {
    await page.locator('#catalog-import').setInputFiles(file('incompatible.json',next));
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
  }
});
test('corrupt catalog and intact collection recover without overwriting either on boot',async({page})=>{
  const c=JSON.stringify(syntheticCollection());
  await page.evaluate(({ck,sk,c})=>{localStorage.setItem(ck,'{broken-catalog');localStorage.setItem(sk,c);},{ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY,c});
  await page.reload();await expect(page.locator('#autosave-warning')).toContainText('破損');
  expect(await page.evaluate(k=>localStorage.getItem(k),CATALOG_STORAGE_KEY)).toBe('{broken-catalog');
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(c);
  await tab(page,'exchange');
  await tab(page,'exchange');await page.locator('.json-exchange > details:not(#data-reset) > summary').click();
  const [original]=await Promise.all([page.waitForEvent('download'),page.locator('#catalog-original').click()]);
  expect(await readFile((await original.path())!,'utf8')).toBe('{broken-catalog');
  await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles(file('restore.json',syntheticCatalog()));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'rating');await expect(page.locator('.band-result .rating-total strong')).toHaveText('857');
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(c);
});
test('corrupt collection remains protected until explicit replacement',async({page})=>{
  await catalog(page);await page.evaluate(k=>localStorage.setItem(k,'{broken-owned'),STORAGE_KEY);
  await page.reload();await tab(page,'members');await page.locator('[data-member-card="8301"] [data-ownership-toggle]').click();
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe('{broken-owned');
  await tab(page,'exchange');
  await page.locator('.json-exchange > details:not(#data-reset) > summary').click();
  const [original]=await Promise.all([page.waitForEvent('download'),page.locator('#damaged-backup').click()]);
  expect(await readFile((await original.path())!,'utf8')).toBe('{broken-owned');
  await collection(page);await page.reload();await expect(page.locator('.band-result .rating-total strong')).toHaveText('857');
});
test('storage quota failure rejects imports and keeps existing memory and bytes',async({page})=>{
  await catalog(page);await collection(page);
  const before=await page.evaluate(()=>({...localStorage}));
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
  await page.locator('#import-file').setInputFiles(file('new.json',{...syntheticCollection(),members:[]}));
  await expect(page.getByRole('alert')).toContainText('保存できません');
  expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-button').click()]);
  expect(JSON.parse(await readFile((await download.path())!,'utf8'))).toEqual(syntheticCollection());
});
test('imported strings render as text without active markup',async({page})=>{
  const m=syntheticCatalog();m.members[0]!.title='<img src=x onerror=alert(1)>';
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('text.json',m));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'members');await expect(page.locator('.card-title')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('img')).toHaveCount(0);
});
test('static subpath serves assets, schemas and all license notices',async({page,request,baseURL})=>{
  const basePath=new URL(baseURL!).pathname;expect(new URL(page.url()).pathname).toBe(basePath);
  const script=await page.locator('script[type=module]').getAttribute('src');expect(script?.startsWith(basePath+'assets/')).toBe(true);
  for(const path of ['schemas/catalog-v1.schema.json','schemas/collection-v1.schema.json','THIRD_PARTY_NOTICES.txt','VITE_LICENSE.txt']){
    const response=await request.get(path);expect(response.ok()).toBeTruthy();
    expect((await response.text()).length).toBeGreaterThan(200);
  }
  await expect(page.locator('footer')).toContainText('非公式');
});
test('mobile width supports data entry, results and notices without body overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await catalog(page);await collection(page);
  for(const name of ['rating','members','progress','exchange','manual']){
    await tab(page,name);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  }
});

test('rank estimation, manual progress, overrides, reset, persistence and export use imported values',async({page})=>{
  await catalog(page);await collection(page);await tab(page,'progress');
  const summary=page.locator('[data-rank-summary]');
  await expect(summary).toContainText(/推定 1.*EXP 3.*手動上書き中.*使用ランク 3/);
  await openRank(page);await page.locator('#rank-8201').fill('');await page.locator('#progress-8201-stamps').fill('9');
  await page.locator('#progress-form button[type=submit]').click();
  await expect(summary).toContainText(/推定 2.*EXP 17.*自動推定.*使用ランク 2/);
  await expect(page.locator('[data-total-character-rank]')).toContainText('総合キャラクターランク 2');
  await tab(page,'rating');
  // Imported rank2: per-channel floors124/235/393, then floor752*1.118=840.
  await expect(page.locator('.band-result .rating-total strong')).toHaveText('840');
  await page.locator('input[name=rating-mode][value=potential]').check();
  await expect(page.locator('.band-result .rating-total strong')).toHaveText('1,197');
  await tab(page,'progress');await openRank(page);await page.locator('#rank-8201').fill('7');await page.locator('#progress-form button[type=submit]').click();
  await page.reload();await tab(page,'progress');await expect(summary).toContainText('使用ランク 7');
  await openRank(page);await expect(page.locator('#progress-8201-stamps')).toHaveValue('9');
  await tab(page,'exchange');const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#export-button').click()]);
  const json=await readFile((await d.path())!,'utf8');expect(JSON.parse(json).characterRanks).toEqual({'8201':7});expect(JSON.parse(json).characterProgress).toEqual({'8201':{stamps:9}});
  await page.locator('#import-file').setInputFiles(file('roundtrip.json',json));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await tab(page,'progress');await openRank(page);await page.locator('#rank-8201').fill('');await page.locator('#progress-form button[type=submit]').click();await expect(summary).toContainText('使用ランク 2');
});
test('counts three skill contributions using fictional thresholds and preserves legacy progress',async({page})=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);c.characterRanks={};
  m.memberAwakening.push({...m.memberAwakening[0]!,stage:5,leaderSkillLevel:5});m.members[0]!.liveSkillLevels.push(5);m.members[0]!.gekisouSkillLevels.push(5);
  c.characterProgress={8201:{skillLevel2:83,skillLevel5:97}};
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('skills.json',m));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();await rules(page,m);
  await tab(page,'exchange');await page.locator('#import-file').setInputFiles(file('owned.json',c));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText('EXP 3');await expect(page.locator('input[name*=skillLevel]')).toHaveCount(0);
  await page.locator('#progress-form button[type=submit]').click();expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).characterProgress,STORAGE_KEY)).toEqual(c.characterProgress);
  await tab(page,'members');for(const name of ['awakeningStage','liveSkillLevel','gekisouSkillLevel'])await page.locator('[data-member-card="8301"] input[name="'+name+'"][value="5"]').check();
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText(/推定 7.*EXP 88.*自動推定.*使用ランク 7/);
  await openRank(page);await expect(page.locator('[data-character-rank="8201"] li').filter({hasText:'架空スキル集計'})).toContainText('3 → 2件62 EXP');
  await page.reload();await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText('EXP 88');
});
test('manual progress uses imported nonuniform thresholds and survives JSON round trips',async({page})=>{
  await catalog(page);await collection(page);await tab(page,'progress');await openRank(page);
  await page.locator('#rank-8201').fill('');await page.locator('#progress-8201-songClears').fill('10');await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('[data-rank-summary]')).toContainText(/推定 3.*EXP 25.*自動推定.*使用ランク 3/);
  await page.reload();await tab(page,'progress');await openRank(page);await expect(page.locator('#progress-8201-songClears')).toHaveValue('10');
  await expect(page.locator('[data-character-rank="8201"] li').filter({hasText:'架空進捗B'})).toContainText('10 → 2件22 EXP');
  await tab(page,'exchange');const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#export-button').click()]);const json=await readFile((await d.path())!,'utf8');
  expect(JSON.parse(json).characterProgress).toEqual({'8201':{songClears:10}});await page.locator('#import-file').setInputFiles(file('progress.json',json));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await tab(page,'progress');await expect(page.locator('[data-rank-summary]')).toContainText('EXP 25');
});

test('switching targets and bands retains drafts, previews, saves and reloads',async({page})=>{
  const m=syntheticCatalog();
  m.characters.push({id:8202,bandId:8101,name:'架空奏者B'});
  m.bands.push({id:8102,name:'架空バンドB'});
  m.characters.push({id:8210,bandId:8102,name:'架空奏者C'});
  await page.setViewportSize({width:390,height:844});
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('catalog.json',m));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();await rules(page,m);
  await collection(page);await tab(page,'progress');
  await page.locator('#rank-8201').fill('7');
  await expect(page.locator('[data-character-rank="8201"] [data-effective-rank]')).toHaveText('7');
  await page.locator('#progress-8201-stamps').fill('4');
  await openRank(page,8202);await page.locator('#rank-8202').fill('3');
  await openItems(page);await page.locator('#item-8601').fill('2');
  await page.locator('[data-progress-band="8102"]').click();await page.locator('#rank-8210').fill('2');
  await page.locator('[data-progress-band="8101"]').click();await openRank(page);
  await expect(page.locator('#rank-8201')).toHaveValue('7');await expect(page.locator('#progress-8201-stamps')).toHaveValue('4');
  await expect(page.locator('[data-character-rank="8201"] [data-effective-rank]')).toHaveText('7');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.locator('#progress-form button[type=submit]').click();
  await page.reload();await tab(page,'progress');
  await expect(page.locator('#rank-8201')).toHaveValue('7');await expect(page.locator('#progress-8201-stamps')).toHaveValue('4');
  await openRank(page,8202);await expect(page.locator('#rank-8202')).toHaveValue('3');
  await openItems(page);await expect(page.locator('#item-8601')).toHaveValue('2');
  await page.locator('[data-progress-band="8102"]').click();await expect(page.locator('#rank-8210')).toHaveValue('2');
});

test('collapsed invalid rank opens for correction and failed explicit save stays visible',async({page})=>{
  await catalog(page);await collection(page);await tab(page,'progress');await openRank(page);
  await page.locator('#rank-8201').fill('0');
  const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('#rank-8201')).toBeVisible();
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await page.locator('#rank-8201').fill('7');
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};});
  await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('[data-progress-state]')).toHaveText('ブラウザ保存未完了');
  await expect(page.locator('.save-state')).toHaveText('保存未完了');
  await expect(page.locator('#autosave-warning')).toContainText('保存');
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
});

for (const replacement of ['import', 'reset'] as const) test(`${replacement} discards progress drafts before subsequent save and reload`,async({page})=>{
  await catalog(page);await collection(page);await tab(page,'progress');
  await page.locator('#rank-8201').fill('7');
  await page.locator('#progress-8201-stamps').fill('9');
  await page.locator('[data-progress-section="total-rank"] summary').click();
  await page.locator('#totalRankBonus').fill('99');
  await openItems(page);await page.locator('#item-8601').fill('2');
  await tab(page,'exchange');
  if(replacement==='import') {
    const imported={...syntheticCollection(),characterProgress:{8201:{stamps:4}}};
    await page.locator('#import-file').setInputFiles(file('replacement.json',imported));
    await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  } else {
    await tab(page,'exchange');await page.locator('#data-reset summary').click();page.once('dialog',d=>d.accept());await page.locator('#reset-button').click();
  }
  const replacementData=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),STORAGE_KEY);
  await tab(page,'progress');await openRank(page);
  await expect(page.locator('#rank-8201')).toHaveValue(replacement==='import'?'3':'');
  await expect(page.locator('#progress-8201-stamps')).toHaveValue(replacement==='import'?'4':'');
  await page.locator('[data-progress-section="total-rank"] summary').click();
  await expect(page.locator('#totalRankBonus')).toHaveValue(replacement==='import'?'50':'');
  await openItems(page);await expect(page.locator('#item-8601')).toHaveValue(replacement==='import'?'1':'0');
  await page.locator('#progress-form button[type=submit]').click();
  await page.reload();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),STORAGE_KEY)).toEqual({...replacementData,characterProgress:replacementData.characterProgress??{}});
});

test('catalog replacement removes obsolete progress drafts and retains surviving edits',async({page})=>{
  const m=syntheticCatalog();
  m.characters.push({id:8202,bandId:8101,name:'架空奏者B'});
  m.bandItems.push({id:8602,bandId:8101,name:'架空アイテムB'});
  m.bandItemLevels.push({itemId:8602,level:1});
  m.bandItemEffects.push({...m.bandItemEffects[0]!,itemId:8602});
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('expanded.json',m));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'progress');await page.locator('#rank-8201').fill('3');
  await openRank(page,8202);await page.locator('#rank-8202').fill('7');await page.locator('#progress-8202-stamps').fill('9');
  await openItems(page);await page.locator('#item-8601').fill('2');await page.locator('#item-8602').fill('1');
  await tab(page,'exchange');await page.locator('#catalog-import').setInputFiles(file('smaller.json',syntheticCatalog()));await expect(page.getByText('マスタをImportしました', {exact:true})).toBeVisible();
  await tab(page,'progress');await openRank(page);
  await expect(page.locator('#rank-8201')).toHaveValue('3');
  await expect(page.locator('[data-character-rank="8202"]')).toHaveCount(0);
  await openItems(page);await expect(page.locator('#item-8601')).toHaveValue('2');
  await page.locator('#progress-form button[type=submit]').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();await tab(page,'progress');
  await expect(page.locator('#rank-8201')).toHaveValue('3');await openItems(page);await expect(page.locator('#item-8601')).toHaveValue('2');
  const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),STORAGE_KEY);
  expect(saved.characterRanks).toEqual({8201:3});expect(saved.characterProgress).toEqual({});expect(saved.bandItems).toEqual({8601:2});
});
