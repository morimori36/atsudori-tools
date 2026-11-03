import { test,expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { inventoryFixture,inventoryTraining } from '../helpers/inventory';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';
const file=(value:unknown)=>({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
async function seed(page:Page,fixture=inventoryFixture(),settings=inventoryTraining) {
  const {m,c}=fixture;await page.goto('./');
  await page.evaluate(({m,c,settings,keys})=>{[m,c,settings].forEach((value,i)=>localStorage.setItem(keys[i]!,JSON.stringify(value)));},{m,c,settings,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY,TRAINING_STORAGE_KEY]});
  await page.reload();await page.locator('nav [data-tab=materials]').click();return fixture;
}
const bytes=(page:Page)=>page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
for(const width of [1280,390,320])test(`inventory quantities, shared shortage and keyboard dialog at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const {c}=await seed(page);
  const paper=page.locator('[data-inventory-resource="paper"]');
  await expect(paper).toContainText('在庫未登録・不足数未算出');
  const character=page.locator('[data-bond-character="8201"]');await character.locator(':scope > summary').click();
  const rank=await character.locator('[aria-label="最終キャラランク"]').textContent();
  const opener=page.getByRole('button',{name:'素材在庫を編集',exact:true});await opener.focus();await opener.press('Enter');
  const dialog=page.getByRole('dialog',{name:'素材在庫を編集'});await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-inventory-row]')).toHaveCount(2);await expect(dialog.locator('[data-inventory-input="member-exp"]')).toHaveCount(0);
  const save=dialog.getByRole('button',{name:'在庫を保存',exact:true});
  await save.focus();await page.keyboard.press('Tab');await expect(dialog.locator('[data-inventory-query]')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(save).toBeFocused();
  await dialog.locator('[data-inventory-input="paper"]').fill('30');await dialog.locator('[data-inventory-input="copy"]').fill('1');await save.click();
  await expect(dialog.locator('[data-inventory-message]')).toHaveText('在庫を保存しました');
  await expect(paper.locator('dd')).toHaveText(['41 個','30 個','11 個']);
  await dialog.locator('[data-inventory-filter]').selectOption('unknown');await expect(dialog.locator('[data-inventory-row]')).toHaveCount(0);
  await dialog.locator('[data-inventory-filter]').selectOption('shortage');await expect(dialog.locator('[data-inventory-row]')).toHaveCount(2);
  await expect(character.locator('[aria-label="最終キャラランク"]')).toHaveText(rank!);await expect(character).toHaveAttribute('open','');
  if(width===390)await page.screenshot({path:'test-results/inventory-dialog-390.png'});
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await dialog.locator('[data-inventory-query]').focus();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
  for(const [value,expected] of [['0','41 個'],['','在庫未登録・不足数未算出'],['60','0 個'],['30','11 個']]) {
    await opener.click();await dialog.locator('[data-inventory-input="paper"]').fill(value!);await save.click();await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
    await expect(paper.locator('dd').last()).toHaveText(expected!);
  }
  const saved=JSON.parse((await bytes(page))!);expect(saved.resourceInventory).toEqual({paper:30,copy:1});delete saved.resourceInventory;expect(saved).toEqual(c);
  await page.getByRole('button',{name:'育成条件を変更'}).click();const training=page.getByRole('dialog',{name:'育成条件',exact:true});
  await training.locator('[data-training=snapRank]').selectOption('');await training.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(paper.locator('dd')).toHaveText(['31 個','30 個','1 個']);expect(JSON.parse((await bytes(page))!).resourceInventory).toEqual({paper:30,copy:1});
  await expect(character).toHaveAttribute('open','');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await page.locator('nav [data-tab=materials]').click();await expect(paper.locator('dd')).toHaveText(['31 個','30 個','1 個']);
});

test('invalid values and failed inventory saves protect persisted and in-memory balances',async({page})=>{
  const f=inventoryFixture();f.c.resourceInventory={paper:30};await seed(page,f);const before=await bytes(page);
  const opener=page.getByRole('button',{name:'素材在庫を編集',exact:true});await opener.click();const dialog=page.getByRole('dialog');
  for(const n of ['-1','0.5','9007199254740992','not a number']) {
    await dialog.locator('[data-inventory-input="paper"]').fill(n);await dialog.locator('[data-inventory-save]').click();await expect(dialog.getByRole('alert')).toContainText('安全な整数');expect(await bytes(page)).toBe(before);
  }
  await dialog.locator('[data-inventory-input="paper"]').fill('99');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('quota');};});
  await dialog.locator('[data-inventory-save]').click();await expect(dialog.getByRole('alert')).toContainText('保存できません');expect(await bytes(page)).toBe(before);
  await dialog.locator('[data-inventory-close]').click();await opener.click();await expect(dialog.locator('[data-inventory-input="paper"]')).toHaveValue('30');
  await page.reload();await page.evaluate(k=>localStorage.setItem(k,'{broken'),STORAGE_KEY);await page.reload();await page.locator('nav [data-tab=materials]').click();
  await expect(page.getByRole('button',{name:'素材在庫を編集',exact:true})).toHaveCount(0);expect(await bytes(page)).toBe('{broken');
});

test('inventory backup, omission preservation, explicit replace and orphaned resource updates',async({page})=>{
  const f=inventoryFixture();f.c.resourceInventory={paper:30,copy:0,retired:11};await seed(page,f);
  const exchange=async()=>{await page.locator('nav [data-tab=exchange]').click();};await exchange();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-button').click()]);const backup=JSON.parse(await readFile((await download.path())!,'utf8'));
  expect(backup.resourceInventory).toEqual(f.c.resourceInventory);
  const old=structuredClone(f.c);delete old.resourceInventory;
  const imported=async(value:unknown)=>{await page.locator('#import-file').setInputFiles(file(value));await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();};
  await imported(old);expect(JSON.parse((await bytes(page))!).resourceInventory).toEqual(backup.resourceInventory);
  await imported({...old,resourceInventory:{copy:2}});expect(JSON.parse((await bytes(page))!).resourceInventory).toEqual({copy:2});
  await imported({...old,resourceInventory:{}});expect(JSON.parse((await bytes(page))!).resourceInventory).toEqual({});
  await imported(backup);const before=await bytes(page);
  await page.locator('#import-file').setInputFiles(file({...old,resourceInventory:{paper:-1}}));await expect(page.getByRole('alert')).toContainText('素材在庫');expect(await bytes(page)).toBe(before);
  f.m.revision='next';f.m.materialDefinition!.catalogRevision='next';f.m.materialDefinition!.resources.find(r=>r.id==='paper')!.name='架空の改名紙';f.m.materialDefinition!.resources=f.m.materialDefinition!.resources.filter(r=>r.id!=='retired');
  await page.locator('#catalog-import').setInputFiles(file(f.m));await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();expect(await bytes(page)).toBe(before);
  await page.locator('nav [data-tab=materials]').click();await expect(page.locator('[data-inventory-resource="paper"]')).toContainText('架空の改名紙');
  await page.getByRole('button',{name:'素材在庫を編集',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('[data-inventory-scope]').selectOption('unsupported');
  await expect(dialog.locator('[data-inventory-unsupported="retired"]')).toContainText('登録値 11');await expect(dialog.locator('[data-inventory-input]')).toHaveCount(0);
  await dialog.locator('[data-inventory-save]').click();expect(JSON.parse((await bytes(page))!).resourceInventory.retired).toBe(11);
  await dialog.locator('[data-inventory-close]').click();await exchange();await page.locator('#data-reset summary').click();page.once('dialog',d=>d.accept());await page.locator('#reset-button').click();expect(JSON.parse((await bytes(page))!)).not.toHaveProperty('resourceInventory');
});

test('partial material requirements remain lower bounds and EXP stays outside inventory',async({page})=>{
  const f=inventoryFixture();f.c.resourceInventory={paper:60,'member-exp':999};await seed(page,f,{...inventoryTraining,gekisouSkillLevel:2});
  const paper=page.locator('[data-inventory-resource="paper"]');await expect(paper).toContainText('計算済み小計');await expect(paper).toContainText('不足数未確定');
  await expect(page.locator('[data-inventory-resource="member-exp"]')).toContainText('43 EXP（上限）');await expect(page.locator('[data-inventory-resource="member-exp"]')).toContainText('対象外');
  await page.getByRole('button',{name:'素材在庫を編集',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('[data-inventory-input="paper"]').fill('30');await dialog.locator('[data-inventory-save]').click();
  await expect(paper).toContainText('少なくとも 11 個不足');await dialog.locator('[data-inventory-scope]').selectOption('unsupported');await expect(dialog.locator('[data-inventory-unsupported="member-exp"]')).toContainText('対象外');
});

test('inventory search and paging retain edits across filters without listing every resource initially',async({page})=>{
  const f=inventoryFixture();f.m.materialDefinition!.resources.push(...Array.from({length:31},(_,i)=>({id:`extra-${i}`,name:`架空の追加素材${i}`,unit:'item' as const})));await seed(page,f);
  await page.getByRole('button',{name:'素材在庫を編集',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('[data-inventory-row]')).toHaveCount(2);
  await dialog.locator('[data-inventory-input="paper"]').fill('7');await dialog.locator('[data-inventory-scope]').selectOption('all');await expect(dialog.locator('[data-inventory-row]')).toHaveCount(20);await dialog.locator('[data-inventory-more]').click();await expect(dialog.locator('[data-inventory-row]')).toHaveCount(34);
  await dialog.locator('[data-inventory-query]').fill('追加素材30');await expect(dialog.locator('[data-inventory-row]')).toHaveCount(1);await dialog.locator('[data-inventory-save]').click();
  expect(JSON.parse((await bytes(page))!).resourceInventory.paper).toBe(7);await dialog.locator('[data-inventory-query]').fill('折紙');await expect(dialog.locator('[data-inventory-input="paper"]')).toHaveValue('7');
});
