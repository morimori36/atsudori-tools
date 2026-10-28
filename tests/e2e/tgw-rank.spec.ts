import {test,expect} from '@playwright/test';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';

for(const width of [1280,390]) test(`TGW draft, persistence and legacy import at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const master=syntheticCatalog(), collection=syntheticCollection(master);
  await page.addInitScript(({master,collection,ck,sk})=>{
    if(!localStorage.getItem(ck)){localStorage.setItem(ck,JSON.stringify(master));localStorage.setItem(sk,JSON.stringify(collection));}
  },{master,collection,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});
  await page.goto('/');
  const tab=async(name:string)=>{await page.locator(`nav [data-tab="${name}"]`).click();};
  await tab('progress');const input=page.locator('#tgwRank');
  await expect(input).toHaveValue('');
  await input.fill('1');await tab('members');await tab('progress');await expect(input).toHaveValue('1');
  await page.getByRole('button',{name:'ランク・アイテムを保存',exact:true}).click();
  await page.reload();await tab('progress');await expect(input).toHaveValue('1');
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).tgwRank,STORAGE_KEY)).toBe(1);
  await input.fill('0');await page.getByRole('button',{name:'ランク・アイテムを保存',exact:true}).click();
  expect(await input.evaluate(el=>(el as HTMLInputElement).validity.valid)).toBe(false);
  await input.fill('1');
  await tab('exchange');
  const download=page.waitForEvent('download');await page.locator('#export-button').click();
  const path=await (await download).path();
  const {readFile}=await import('node:fs/promises');const exported=JSON.parse(await readFile(path!,'utf8'));
  expect(exported.tgwRank).toBe(1);
  const file=(value:unknown)=>({name:'collection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await page.locator('#import-file').setInputFiles(file(collection));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await tab('progress');await expect(input).toHaveValue('1');
  await tab('exchange');await page.locator('#import-file').setInputFiles(file(exported));await expect(page.getByText('所持データをImportしました', {exact:true})).toBeVisible();
  await tab('progress');await expect(input).toHaveValue('1');await input.fill('');
  await page.getByRole('button',{name:'ランク・アイテムを保存',exact:true}).click();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).tgwRank,STORAGE_KEY)).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
