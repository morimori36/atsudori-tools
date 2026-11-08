import { test,expect } from '@playwright/test';
import { economyFixture } from '../helpers/economy';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { ECONOMY_STORAGE_KEY } from '../../src/storage/economy';

for(const width of [1280,390,320])test(`economy inputs, unknowns, presets and result export at ${width}px`,async({page})=>{
  const f=economyFixture();delete f.c.resourceInventory!['member-exp'];
  Object.assign(f.scenario.live,{enabled:true,lbPerDay:2,playId:'alto',playsPerDay:1,skipsPerDay:0});
  await page.setViewportSize({width,height:900});
  await page.goto('./');await page.evaluate(({m,c,s,ck,sk,ek})=>{
    localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));localStorage.setItem(ek,JSON.stringify(s));
  },{m:f.m,c:f.c,s:f.scenario,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY,ek:ECONOMY_STORAGE_KEY});
  await page.reload();const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await page.locator('nav [data-tab=economy]').click();
  await expect(page.getByRole('heading',{name:'素材・経済シミュレーター',exact:true})).toBeVisible();
  const material=page.locator('[data-economy-resource=member-exp]');await expect(material).toContainText('未登録');await expect(material).toContainText('未確認');await expect(material).toContainText('66');
  await page.getByRole('button',{name:'7日',exact:true}).click();
  await expect(page.locator('[name=endDate]')).toHaveValue('2024-01-07');await expect(page.locator('[data-economy-dirty]')).toContainText('未反映');
  await page.locator('nav [data-tab=materials]').click();await page.locator('nav [data-tab=economy]').click();await expect(page.locator('[name=endDate]')).toHaveValue('2024-01-07');
  await page.getByRole('button',{name:'試算して条件を保存'}).click();await expect(page.locator('[data-economy-message]')).toHaveText('条件を保存し、試算を更新しました');
  await expect(page.getByRole('heading',{name:'7日間の試算',exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'結果・前提をExport'}).click();
  const file=await download;const stream=await file.createReadStream();let text='';for await(const chunk of stream!)text+=chunk.toString();
  const result=JSON.parse(text);expect(result.period.days).toBe(7);expect(result.ledger).toHaveLength(28);expect(result.trainingSettings).toBeDefined();expect(result.scenario.live.lbPerDay).toBe(2);
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await page.locator('nav [data-tab=economy]').click();await expect(page.getByRole('heading',{name:'7日間の試算',exact:true})).toBeVisible();
});
test('protects damaged conditions, restores by import, and refuses a future version without changes',async({page})=>{
  const f=economyFixture();await page.goto('./');await page.evaluate(({m,c,ck,sk,ek})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));localStorage.setItem(ek,'{"broken":true}');},{m:f.m,c:f.c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY,ek:ECONOMY_STORAGE_KEY});
  await page.reload();await page.locator('nav [data-tab=economy]').click();await expect(page.getByText('保存した試算条件を読み込めません。元JSONを保護しています。')).toBeVisible();
  const input=page.locator('[data-economy-file]');await input.setInputFiles({name:'conditions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.scenario))});
  await expect(page.locator('[data-economy-message]')).toHaveText('試算条件をImportしました');
  const before=await page.evaluate(k=>localStorage.getItem(k),ECONOMY_STORAGE_KEY);
  await page.locator('[data-economy-file]').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...f.scenario,schemaVersion:2}))});
  await expect(page.locator('[data-economy-message]')).toContainText('不正');expect(await page.evaluate(k=>localStorage.getItem(k),ECONOMY_STORAGE_KEY)).toBe(before);
});
test('edits allocations, compares passes and keeps the collection untouched',async({page})=>{
  const f=economyFixture();f.c.resourceInventory!['tokens-b']=14;
  await page.goto('./');await page.evaluate(({m,c,s,ck,sk,ek})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));localStorage.setItem(ek,JSON.stringify(s));},{m:f.m,c:f.c,s:f.scenario,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY,ek:ECONOMY_STORAGE_KEY});
  await page.reload();await page.locator('nav [data-tab=economy]').click();
  await page.locator('[data-economy-detail=flows] > summary').click();await page.getByRole('button',{name:'用途配分を追加',exact:true}).click();
  await page.locator('[name=spend-resource-0-0]').selectOption('tokens-b');await page.locator('[name=spend-quantity-0-0]').fill('7');
  await page.getByRole('button',{name:'試算して条件を保存'}).click();await expect(page.locator('[data-economy-resource=tokens-b]')).toContainText('7');
  await page.locator('[data-economy-detail=pass] > summary').click();await page.getByRole('button',{name:'パスなし・各契約を比較'}).click();
  await expect(page.getByRole('heading',{name:'同じ条件でのパス比較'})).toBeVisible();
  await page.getByRole('button',{name:'育成条件を変更',exact:true}).click();const dialog=page.getByRole('dialog',{name:'育成条件',exact:true});await dialog.locator('[data-training=liveSkillLevel]').selectOption('');await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.getByRole('heading',{name:'同じ条件でのパス比較'})).not.toBeVisible();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).resourceInventory['tokens-b'],STORAGE_KEY)).toBe(14);
});
test('starts without a catalog and can calculate after importing one',async({page})=>{
  const f=economyFixture();await page.goto('./');await page.locator('nav [data-tab=economy]').click();await expect(page.getByText('供給定義が未登録です。供給・交換を計算できません')).toBeVisible();
  await page.locator('nav [data-tab=exchange]').click();await page.locator('#catalog-import').setInputFiles({name:'catalog.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.m))});
  await page.locator('nav [data-tab=economy]').click();await page.getByRole('button',{name:'試算して条件を保存'}).click();await expect(page.locator('[data-economy-message]')).toHaveText('条件を保存し、試算を更新しました');
});
