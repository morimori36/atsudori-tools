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
  await page.reload();await page.locator('nav [data-tab=inventory]').click();return fixture;
}
const bytes=(page:Page)=>page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
for(const width of [1280,390,320])test(`inventory autosave, zero, missing and reload at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const {c}=await seed(page);
  const paper=page.locator('[data-inventory-row="paper"]'),input=paper.locator('input');
  await expect(paper.locator('[data-inventory-status]')).toHaveText('未登録');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('[data-inventory-input="member-exp"]')).toHaveCount(0);
  await expect(page.locator('[data-inventory-row]')).toHaveCount(3);
  for(const [value,expected] of [['30',30],['0',0],['',undefined],['60',60]]) {
    await input.fill(value as string);
    await expect.poll(async()=>JSON.parse((await bytes(page))!).resourceInventory?.paper).toBe(expected);
    await expect(input).toBeFocused();await expect(page.locator('.save-state')).toHaveText('自動保存済み');
    await expect(paper.locator('[data-inventory-status]')).toHaveText(value===''?'未登録':'登録済み');
  }
  await page.locator('[data-inventory-input="copy"]').fill('1');
  // Navigating away before the debounce fires flushes the existing autosave queue.
  await page.locator('nav [data-tab=materials]').click();
  await expect(page.locator('[data-inventory-input],[data-inventory-resource],[data-inventory-totals],[data-bond-character]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/不足数|現在庫/);
  await expect(page.locator('[data-material-total]')).toContainText('架空の折紙');
  await page.reload();await page.locator('nav [data-tab=inventory]').click();await expect(input).toHaveValue('60');
  await expect(page.locator('[data-inventory-input="copy"]')).toHaveValue('1');
  const saved=JSON.parse((await bytes(page))!);expect(saved.resourceInventory).toEqual({paper:60,copy:1});delete saved.resourceInventory;expect(saved).toEqual(c);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/inventory-${width}.png`,fullPage:true});
});

test('invalid values, failed autosaves and damaged storage remain protected',async({page})=>{
  const f=inventoryFixture();f.c.resourceInventory={paper:30};await seed(page,f);const before=await bytes(page);
  const input=page.locator('[data-inventory-input="paper"]'),row=page.locator('[data-inventory-row="paper"]');
  for(const n of ['-1','0.5','9007199254740992','1e3']) {
    await input.fill(n);await input.press('Tab');await expect(row.getByRole('alert')).toContainText('安全な整数');expect(await bytes(page)).toBe(before);
  }
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('quota');};});
  await input.fill('99');await input.press('Tab');await expect(row.getByRole('alert')).toContainText('保存できません');expect(await bytes(page)).toBe(before);
  await page.locator('nav [data-tab=members]').click();await page.locator('nav [data-tab=inventory]').click();
  await expect(input).toHaveValue('99');await expect(row.locator('[data-inventory-status]')).toHaveText('登録済み');
  await page.reload();await page.locator('nav [data-tab=inventory]').click();await expect(input).toHaveValue('30');
  await page.evaluate(k=>localStorage.setItem(k,'{broken'),STORAGE_KEY);await page.reload();await page.locator('nav [data-tab=inventory]').click();
  await input.fill('100');await input.press('Tab');await expect(row.getByRole('alert')).toContainText('保存できません');expect(await bytes(page)).toBe('{broken');
  await page.locator('nav [data-tab=progress]').click();await expect(page.locator('[data-exp-goal] strong').first()).toHaveText('未算出');await expect(page.locator('[data-exp-detail]').first()).toBeDisabled();
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
  await page.locator('nav [data-tab=inventory]').click();await expect(page.locator('[data-inventory-row="paper"]')).toContainText('架空の改名紙');
  await page.locator('.inventory-unsupported > summary').click();
  await expect(page.locator('[data-inventory-unsupported="retired"]')).toContainText('登録値 11');await expect(page.locator('[data-inventory-input="retired"]')).toHaveCount(0);
  await page.locator('[data-inventory-input="paper"]').fill('31');await expect.poll(async()=>JSON.parse((await bytes(page))!).resourceInventory?.paper).toBe(31);
  expect(JSON.parse((await bytes(page))!).resourceInventory.retired).toBe(11);
  await exchange();await page.locator('#data-reset summary').click();page.once('dialog',d=>d.accept());await page.locator('#reset-button').click();expect(JSON.parse((await bytes(page))!)).not.toHaveProperty('resourceInventory');
});

test('partial requirements and unsupported EXP never introduce shortage UI',async({page})=>{
  const f=inventoryFixture();f.c.resourceInventory={paper:60,'member-exp':999};await seed(page,f,{...inventoryTraining,gekisouSkillLevel:2});
  await expect(page.locator('[data-inventory-input="member-exp"]')).toHaveCount(0);
  await page.locator('.inventory-unsupported > summary').click();await expect(page.locator('[data-inventory-unsupported="member-exp"]')).toContainText('対象外');
  await page.locator('nav [data-tab=materials]').click();await expect(page.locator('[data-material-total]')).toContainText('計算済み');
  await expect(page.locator('[data-material-total]')).toContainText('43 EXP（上限）');await expect(page.locator('main')).not.toContainText(/不足数|現在庫/);
});

test('all inventory rows and search matches preserve concurrent edits and invalid drafts',async({page})=>{
  const f=inventoryFixture();f.m.materialDefinition!.resources.push(...Array.from({length:31},(_,i)=>({id:`extra-${i}`,name:`架空の追加素材${i}`,unit:'item' as const})));await seed(page,f);
  await expect(page.locator('[data-inventory-row]')).toHaveCount(34);
  await expect(page.locator('[data-inventory-more]')).toHaveCount(0);
  const paper=page.locator('[data-inventory-input="paper"]');
  await expect(paper).toHaveAttribute('type','number');
  await expect(paper).toHaveAttribute('min','0');
  await expect(paper).toHaveAttribute('step','1');
  await paper.fill('7');
  await page.locator('[data-inventory-input="copy"]').fill('0');
  await page.locator('[data-inventory-input="extra-30"]').fill('123');
  await page.locator('[data-inventory-query]').fill('追加素材');
  await expect(page.locator('[data-inventory-row]')).toHaveCount(31);
  await page.locator('[data-inventory-query]').fill('no-matching-resource');
  await expect(page.locator('[data-inventory-row]')).toHaveCount(0);
  await page.locator('[data-inventory-query]').fill('追加素材30');await expect(page.locator('[data-inventory-row]')).toHaveCount(1);
  await expect.poll(async()=>JSON.parse((await bytes(page))!).resourceInventory?.paper).toBe(7);
  await page.locator('[data-inventory-query]').fill('折紙');await expect(page.locator('[data-inventory-input="paper"]')).toHaveValue('7');
  await page.locator('[data-inventory-input="paper"]').fill('-1');await page.locator('[data-inventory-query]').fill('追加素材30');
  await page.locator('[data-inventory-query]').fill('折紙');await expect(page.locator('[data-inventory-input="paper"]')).toHaveValue('-1');
  await page.locator('[data-inventory-query]').fill('');
  await expect(page.locator('[data-inventory-input="copy"]')).toHaveValue('0');
  await expect(page.locator('[data-inventory-input="extra-30"]')).toHaveValue('123');
  await page.reload();await page.locator('nav [data-tab=inventory]').click();
  await expect(page.locator('[data-inventory-row]')).toHaveCount(34);
  await expect(paper).toHaveValue('7');
  await expect(page.locator('[data-inventory-input="copy"]')).toHaveValue('0');
  await expect(page.locator('[data-inventory-input="extra-30"]')).toHaveValue('123');
});


test('partial number input never clears saved stock and wheel does not change it',async({page})=>{
  const f=inventoryFixture();f.c.resourceInventory={paper:30};await seed(page,f);
  const input=page.locator('[data-inventory-input="paper"]');
  const before=await bytes(page);
  await input.fill('');await input.pressSequentially('-');
  expect(await input.evaluate((el:HTMLInputElement)=>el.validity.badInput)).toBe(true);
  await expect(page.locator('[data-inventory-row="paper"]').getByRole('alert')).toContainText('安全な整数');
  expect(await bytes(page)).toBe(before);
  await page.locator('[data-inventory-query]').fill('複製');
  await page.locator('[data-inventory-query]').fill('折紙');
  expect(await input.evaluate((el:HTMLInputElement)=>el.validity.badInput)).toBe(true);
  await input.press('Tab');expect(await bytes(page)).toBe(before);
  await input.fill('12');await input.pressSequentially('3');
  await expect(input).toHaveValue('123');
  await input.hover();await page.mouse.wheel(0,-100);
  await expect(input).toHaveValue('123');await expect(input).toBeFocused();
  await expect.poll(async()=>JSON.parse((await bytes(page))!).resourceInventory.paper).toBe(123);
  await input.fill('');await input.press('Tab');
  await expect.poll(async()=>JSON.parse((await bytes(page))!).resourceInventory.paper).toBeUndefined();
  await page.reload();await page.locator('nav [data-tab=inventory]').click();await expect(input).toHaveValue('');
});
