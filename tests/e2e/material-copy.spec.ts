import { chooseScreen } from '../helpers/navigation';
import { test,expect } from '@playwright/test';
import { maximumTrainingFixture } from '../helpers/maximum-training';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';

for(const width of [1280,390,320])test(`copy current material report at ${width}px`,async({page})=>{
  const {m,c}=maximumTrainingFixture();
  c.resourceInventory={paper:0,'member-exp':1000};
  await page.setViewportSize({width,height:900});
  await page.goto('./');
  await page.evaluate(({m,c,ck,sk})=>{
    localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));
  },{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});
  await page.reload();
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{
      (window as unknown as {copied:string}).copied=text;
    }}});
  });
  const saved=await page.evaluate(()=>JSON.stringify(localStorage));
  await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  const copy=page.getByRole('button',{name:'不足状況をコピー',exact:true});
  await expect(copy).toBeVisible();
  const box=await copy.boundingBox();expect(box!.x+box!.width).toBeLessThanOrEqual(width);
  await page.locator('[data-material-resource=paper] > summary').click();
  await copy.click();
  await expect(page.locator('[data-material-copy-status]')).toHaveText('不足状況をコピーしました');
  const text=await page.evaluate(()=>(window as unknown as {copied:string}).copied);
  expect(text).toContain('メンバー\tpaper\t架空の折紙\t個\t20\t0\t20\t計算済み小計');
  expect(text).toContain('メンバー\tmember-exp\t架空Member経験値\tEXP\t43\t1000\t0');
  expect(text).toContain('スナップ\tsnap-exp\t架空Snap経験値\tEXP\t126\t未登録\t未確認');
  expect(text).toContain('未計算：');expect(text).toContain('全体の不足は未確定');
  for(const card of [...m.members,...m.snaps])expect(text).not.toContain(card.title);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).toBe(saved);
  await expect(page.locator('[data-material-resource=paper]')).toHaveAttribute('open','');
  await page.getByRole('button',{name:'育成条件を変更',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'育成条件',exact:true});
  for(const select of await dialog.locator('select').all())await select.selectOption('');
  await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await copy.click();
  const next=await page.evaluate(()=>(window as unknown as {copied:string}).copied);
  expect(next).toContain('メンバー 特訓：変更しない');
  expect(next).not.toContain('\tpaper\t');expect(next).not.toContain('\tmember-exp\t');
  expect(next).toContain('スナップ\tsnap-exp\t');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}}}));
  await copy.click();
  await expect(page.locator('[data-material-copy-status]')).toContainText('コピーに失敗しました');
  await expect(page.locator('[data-material-copy-status]')).not.toContainText('コピーしました');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:undefined}));
  await copy.click();
  await expect(page.locator('[data-material-copy-status]')).toContainText('コピーに失敗しました');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
