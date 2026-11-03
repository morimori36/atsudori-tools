import { test,expect } from '@playwright/test';
import { characterExpFixture,expTraining } from '../helpers/character-exp';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';

for(const width of [1280,390,320])test(`shared EXP dialog, targets and bond disclosures at ${width}px`,async({page})=>{
  const {m,c}=characterExpFixture();
  await page.setViewportSize({width,height:844});await page.goto('./');
  await page.evaluate(({m,c,expTraining,keys})=>{[m,c,expTraining].forEach((v,i)=>localStorage.setItem(keys[i]!,JSON.stringify(v)));},{m,c,expTraining,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY,TRAINING_STORAGE_KEY]});
  await page.reload();await page.locator('nav [data-tab=materials]').click();
  const saved=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY,TRAINING_STORAGE_KEY]);
  const char=page.locator('[data-bond-character="8201"]');
  await expect(char.locator('[data-exp-owned]')).toContainText('+44 EXP');await expect(char.locator('[data-exp-unowned]')).toContainText('+56 EXP');
  await expect(char.locator('[aria-label="最終キャラランク"]')).toHaveText('30');
  await expect(page.locator('[data-exp-target]')).toHaveValue('30');
  await page.locator('[data-exp-target]').selectOption('32');await expect(char.locator('[data-exp-goal]')).toContainText('不足 13 EXP');
  await page.locator('[data-exp-target]').selectOption('28');await expect(page.locator('[data-bond-character="8202"] [data-exp-goal]')).toContainText('目標到達');
  await expect(char.locator('summary button')).toHaveCount(0);
  await char.locator(':scope > summary').press('Enter');await expect(char.locator('.bond-pairs')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
  const open=char.getByRole('button',{name:'育成・獲得EXPの詳細'});await open.focus();await open.press('Enter');
  const dialog=page.getByRole('dialog',{name:'架空奏者Aの育成・獲得EXP'});await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-exp-count]')).toContainText('メンバー 2枚 · スナップ 2枚');
  await expect(dialog.locator('[data-exp-card]')).toHaveCount(0); // non-additive: zero per-card, positive overall
  await dialog.locator('[data-exp-positive]').uncheck();await expect(dialog.locator('[data-exp-card]')).toHaveCount(4);
  await expect(dialog.locator('[data-exp-card="member-8301"]')).toContainText('特訓 1→2');
  await dialog.locator('[data-exp-ownership]').selectOption('unowned');await expect(dialog.locator('[data-exp-card]')).toHaveCount(4);
  await expect(dialog.locator('[data-exp-card="snap-8505"] [data-exp-final]')).toContainText('最終ランク 30');
  await dialog.locator('[data-exp-kind]').selectOption('member');await expect(dialog.locator('[data-exp-card]')).toHaveCount(2);
  await dialog.locator('[data-exp-query]').fill('8303');await expect(dialog.locator('[data-exp-card]')).toHaveCount(1);
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(open).toBeFocused();
  await expect(char).toHaveAttribute('open','');await expect(char.locator('.bond-pairs')).toBeVisible();
  await page.getByRole('button',{name:'育成条件を変更'}).click();
  await page.getByRole('dialog',{name:'育成条件',exact:true}).locator('[data-training=awakeningStage]').selectOption('');
  await page.getByRole('dialog',{name:'育成条件',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(char).toHaveAttribute('open','');await expect(char.locator('[data-exp-owned]')).toContainText('+28 EXP');
  await expect(page.locator('[data-exp-target]')).toHaveValue('28');
  await open.click();await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'閉じる',exact:true}).click();await expect(open).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY])).toEqual(saved.slice(0,2));
  if(width===390) {await open.click();await page.screenshot({path:'test-results/character-exp-390.png'});}
});

test('EXP candidates are paged, searchable and explain missing definitions',async({page})=>{
  const {m,c}=characterExpFixture();m.members.push(...Array.from({length:23},(_,i)=>({...m.members[0]!,id:8400+i,name:`架空の追加紙${i}`})));
  delete m.rankDefinition;
  await page.goto('./');await page.evaluate(({m,c,keys})=>{localStorage.setItem(keys[0]!,JSON.stringify(m));localStorage.setItem(keys[1]!,JSON.stringify(c));},{m,c,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY]});
  await page.reload();await page.locator('nav [data-tab=materials]').click();
  const char=page.locator('[data-bond-character="8201"]');await expect(char.locator('[data-exp-owned]')).toContainText('未算出');await char.locator(':scope > summary').click();
  await char.getByRole('button',{name:'育成・獲得EXPの詳細'}).click();const dialog=page.getByRole('dialog');
  await dialog.locator('[data-exp-ownership]').selectOption('unowned');await expect(dialog.locator('[data-exp-card]')).toHaveCount(20);
  await expect(dialog.locator('[data-exp-direct]').first()).toContainText('未算出');await dialog.locator('[data-exp-more]').click();await expect(dialog.locator('[data-exp-card]')).toHaveCount(27);
  await dialog.locator('[data-exp-query]').fill('追加紙22');await expect(dialog.locator('[data-exp-card]')).toHaveCount(1);
});
