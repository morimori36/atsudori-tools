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
 await expect(page.locator('[data-seal-balance]')).toHaveText('+3,713');
 await page.reload();await expect(page.locator('[name=paid][value="2"]')).toBeChecked();await expect(page.locator('[name=event][value="1"]')).toBeChecked();await expect(page.locator('[name=cm]')).toBeChecked();await expect(page.locator('[data-seal-balance]')).toHaveText('+3,713');
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

for (const width of [320, 375, 390, 1280]) for (const theme of ['light', 'dark'] as const) {
 test(`seal receipt layout and keyboard choices at ${width} in ${theme}`, async ({page}) => {
  await page.setViewportSize({width, height: 900});
  await page.emulateMedia({colorScheme: theme});
  await page.goto('./#seal-budget');
  const m = {...syntheticCatalog(), sealBudgetDefinition: sealDefinition()};
  const c = {...syntheticCollection(m), sealBudgetScenario: {cm: false, pass: false, paid: 0, event: 0, selectedProducts: ['fictional-paper']}};
  await page.evaluate(({m, c, ck, sk}) => {
   localStorage.setItem(ck, JSON.stringify(m)); localStorage.setItem(sk, JSON.stringify(c));
  }, {m, c, ck: CATALOG_STORAGE_KEY, sk: STORAGE_KEY});
  await page.reload();
  await expect(page.locator('[data-seal-balance]')).toHaveText('-67');
  await expect(page.locator('.seal-balance')).toContainText('不足');
  const receipt = await page.locator('.seal-receipt').boundingBox();
  const form = await page.locator('#seal-budget-form').boundingBox();
  if (width > 1100) expect(receipt!.x).toBeGreaterThan(form!.x + form!.width);
  else expect(receipt!.y + receipt!.height).toBeLessThanOrEqual(form!.y);
  await page.getByText('ガチャ別収入の内訳', {exact: false}).click();
  const details = page.locator('.seal-support details').first();
  const radio = page.locator('[name=paid][value="0"]');
  await radio.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('[name=paid][value="1"]')).toBeChecked();
  await expect(page.locator('[name=paid][value="1"]')).toBeFocused();
  await expect(page.locator('[data-seal-income]')).toHaveText('240');
  await expect(page.locator('[data-seal-balance]')).toHaveText('+173');
  await expect(details).toHaveAttribute('open', '');
  for (const label of await page.locator('.seal-toggle, .seal-counts label, .seal-product').all()) {
   expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width <= 700) await expect(page.locator('[data-seal-mobile-balance]')).toContainText('+173');
  else await expect(page.locator('[data-seal-mobile-balance]')).toBeHidden();
 });
}

test('receipt preserves saved contributions on failure, then retries without closing details', async ({page}) => {
 const m = {...syntheticCatalog(), sealBudgetDefinition: sealDefinition()};
 await page.goto('./#seal-budget');
 await page.evaluate(({m, c, ck, sk}) => {
  localStorage.setItem(ck, JSON.stringify(m)); localStorage.setItem(sk, JSON.stringify(c));
 }, {m, c: syntheticCollection(m), ck: CATALOG_STORAGE_KEY, sk: STORAGE_KEY});
 await page.reload();
 await page.locator('.seal-support summary').first().click();
 const original = await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY);
 await page.evaluate(() => {
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
   if (key === 'atsudori-tools.collection.v1') {
    Storage.prototype.setItem = originalSetItem; throw new Error('quota');
   }
   return originalSetItem.call(this, key, value);
  };
 });
 await page.locator('[name=cm]').check();
 await expect(page.locator('[data-seal-message]')).toContainText('未保存');
 await expect(page.locator('.seal-stale')).toContainText('変更前の条件');
 await expect(page.locator('[data-seal-contribution="cm"]')).toContainText('未選択');
 await expect(page.locator('[data-seal-balance]')).toHaveText('0');
 expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY)).toBe(original);
 await page.locator('[name=pass]').check();
 await expect(page.locator('.seal-stale')).toHaveCount(0);
 await expect(page.locator('[data-seal-contribution="cm"] strong')).toHaveText('2,640');
 await expect(page.locator('[data-seal-balance]')).toHaveText('+2,640');
 await expect(page.locator('.seal-support details').first()).toHaveAttribute('open', '');
});

test('receipt keeps unknown notes visible and treats external names and IDs as text', async ({page}) => {
 const d = sealDefinition();
 d.gachas[0]!.snapSeals = null;
 d.gachas[0]!.name = '<img src=x onerror=alert(1)>';
 d.products[0]!.id = 'paper.test-1';
 d.products[0]!.name = '架空の長い商品名'.repeat(8);
 const m = {...syntheticCatalog(), sealBudgetDefinition: d};
 const c = {...syntheticCollection(m), sealBudgetScenario: {cm: true, pass: false, paid: 0, event: 0, selectedProducts: [d.products[0]!.id]}};
 await page.setViewportSize({width: 320, height: 900});
 await page.goto('./#seal-budget');
 await page.evaluate(({m, c, ck, sk}) => {
  localStorage.setItem(ck, JSON.stringify(m)); localStorage.setItem(sk, JSON.stringify(c));
 }, {m, c, ck: CATALOG_STORAGE_KEY, sk: STORAGE_KEY});
 await page.reload();
 await expect(page.locator('.seal-notes')).toBeVisible();
 await expect(page.locator('.seal-notes')).toContainText('Rスナップは未確認のため除外');
 await expect(page.locator('[data-seal-income]')).toHaveText('1,920');
 await expect(page.locator('[data-seal-cost]')).toHaveText('67');
 await expect(page.locator('.seal-gacha-info h3').first()).toHaveText(d.gachas[0]!.name);
 await expect(page.locator('#seal-budget img')).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.locator('[data-seal-product]').uncheck();
 await expect(page.locator('[data-seal-expense]')).toHaveText('0');
 await expect(page.locator('[data-seal-cost]')).toHaveText('交換OFF');
});
