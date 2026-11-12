import {test,expect} from '@playwright/test';
import {sealDefinition} from '../helpers/seal-budget';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
import {chooseScreen} from '../helpers/navigation';
for(const width of [1280,375])test(`seal budget import, change and reload at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('./#exchange');
 const m={...syntheticCatalog(),sealBudgetDefinition:sealDefinition()};
 await page.locator('#catalog-import').setInputFiles({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))});
 await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
 await chooseScreen(page,page.locator('nav [data-tab=seal-budget]'));
 await expect(page.locator('[data-seal-balance]')).toHaveText('0');
 await page.locator('[name=cm]').check();await expect(page.locator('[data-seal-income]')).toHaveText('2,640');
 for(const event of [0,1,2])for(const paid of [0,1,2]){
  await page.locator(`[name=event][value="${event}"]`).check();await page.locator(`[name=paid][value="${paid}"]`).check();
  await expect(page.locator('[data-seal-income]')).toHaveText((2640+660*event+240*paid).toLocaleString('ja-JP'));
 }
 await page.locator('[name=pass]').check();await page.locator('[name=paid][value="2"]').check();await page.locator('[name=event][value="1"]').check();await page.locator('[data-seal-product]').check();
 await expect(page.locator('[data-seal-balance]')).toHaveText('3,713');
 await page.reload();await expect(page.locator('[name=paid][value="2"]')).toBeChecked();await expect(page.locator('[name=event][value="1"]')).toBeChecked();await expect(page.locator('[name=cm]')).toBeChecked();await expect(page.locator('[data-seal-balance]')).toHaveText('3,713');
 await page.screenshot({path:`.cache/seal-budget-${width}.png`,fullPage:true});
 expect(await page.locator('#seal-budget-form select').count()).toBe(0);
 expect(await page.locator('[data-seal-results] li').count()).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const checkbox=await page.locator('[name=cm]').boundingBox();expect(checkbox!.width).toBeLessThanOrEqual(44);
});
test('protects damaged storage and reports saving failure without changing results',async({page})=>{
 const m={...syntheticCatalog(),sealBudgetDefinition:sealDefinition()};
 await page.goto('./#seal-budget');await page.evaluate(({m,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,'broken');},{m,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
 await expect(page.locator('[name=cm]')).toBeDisabled();expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe('broken');
 await page.evaluate(({c,k})=>localStorage.setItem(k,JSON.stringify(c)),{c:syntheticCollection(m),k:STORAGE_KEY});await page.reload();
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});await page.locator('[name=cm]').check();
 await expect(page.locator('[data-seal-message]')).toContainText('未保存');await expect(page.locator('[data-seal-income]')).toHaveText('0');
});
