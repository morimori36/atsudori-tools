import {test,expect} from '@playwright/test';
import {sealDefinition, collectionSealFixture} from '../helpers/seal-budget';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
import {chooseScreen} from '../helpers/navigation';
for(const width of [1280,375])test(`seal budget import, change and reload at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('./#exchange');
 const m={...syntheticCatalog(),sealBudgetDefinition:sealDefinition()};
 await page.locator('#catalog-import').setInputFiles({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))});
 await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
 await page.locator('#import-file').setInputFiles({name:'fictional-collection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(syntheticCollection(m)))});
 await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
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
 d.cards[1]!.duplicateReward = null;
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

for (const width of [1280, 375]) test(`collection-based seal budget follows member and snap edits at ${width}`, async ({page}) => {
 const {master, collection} = collectionSealFixture();
 collection.members = collection.members.filter(c => c.cardId !== 8301);
 collection.snaps = collection.snaps.filter(c => c.supportCardId !== 8501);
 collection.sealBudgetScenario = {cm: true, pass: false, paid: 1, event: 0, selectedProducts: ['fictional-paper']};
 await page.setViewportSize({width, height: 900});
 await page.goto('./#exchange');
 const file = (value: unknown) => ({name: 'fictional.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value))});
 await page.locator('#catalog-import').setInputFiles(file(master));
 await expect(page.getByText('マスタをImportしました', {exact: true})).toBeVisible();
 await page.locator('#import-file').setInputFiles(file(collection));
 await expect(page.getByText('所持データをImportしました', {exact: true})).toBeVisible();
 const saved = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)!), STORAGE_KEY);
 const catalogBytes = await page.evaluate(k => localStorage.getItem(k), CATALOG_STORAGE_KEY);
 const beforeRead = await saved();
 const budget = async (income: string, balance: string) => {
  await chooseScreen(page, page.locator('nav [data-tab=seal-budget]'));
  await expect(page.locator('[data-seal-income]')).toHaveText(income);
  await expect(page.locator('[data-seal-expense]')).toHaveText('67');
  await expect(page.locator('[data-seal-balance]')).toHaveText(balance);
  await expect(page.locator('#seal-budget input[name=awakeningStage], #seal-budget input[name=snapRank]')).toHaveCount(0);
 };
 await budget('2,880', '+2,813');
 await page.locator('.seal-support details').last().locator('summary').click();
 await expect(page.locator('.seal-support details').last()).toContainText('実所持方式');
 expect(await saved()).toEqual(beforeRead); // viewing does not save defaults or a derived snapshot
 for (const [tab, id, field, income, balance] of [
  ['members', 8301, 'awakeningStage', '3,172.5', '+3,105.5'],
  ['snaps', 8501, 'snapRank', '4,380', '+4,313'],
 ] as const) {
  await chooseScreen(page, page.locator(`nav [data-tab=${tab}]`));
  await page.locator(`[data-catalog-id="${id}"] [data-ownership-toggle]`).click();
  await expect(page.locator(`[data-catalog-id="${id}"] [data-owned-label]`)).toHaveText('✓ 所持');
  await budget(tab === 'members' ? '2,880' : '3,172.5', tab === 'members' ? '+2,813' : '+3,105.5'); // incomplete duplicates -> pieces
  await chooseScreen(page, page.locator(`nav [data-tab=${tab}]`));
  await page.locator(`[data-catalog-id="${id}"] [name=${field}][value="2"]`).check();
  await budget(income, balance);
 }
 const after = await saved();
 expect(after.sealBudgetScenario).toEqual(beforeRead.sealBudgetScenario);
 expect(Object.keys(after).sort()).toEqual(Object.keys(beforeRead).sort());
 expect(after.members.find((c: {cardId: number}) => c.cardId === 8301).awakeningStage).toBe(2);
 expect(after.snaps.find((c: {supportCardId: number}) => c.supportCardId === 8501).rank).toBe(2);
 expect(await page.evaluate(k => localStorage.getItem(k), CATALOG_STORAGE_KEY)).toBe(catalogBytes);
 await page.reload();
 await expect(page.locator('[data-seal-income]')).toHaveText('4,380');
 expect(await saved()).toEqual(after);
 // Collection Import uses the same source and does not retain a second ownership state.
 await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
 await page.locator('#import-file').setInputFiles(file({...collection, members: [], snaps: []}));
 await expect(page.getByText('所持データをImportしました', {exact: true})).toBeVisible();
 await budget('1,680', '+1,613');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('collection mode displays known income and distinct unknown causes once', async ({page}) => {
 const {master, collection, definition} = collectionSealFixture();
 definition.cards[0]!.completedAt = null;
 definition.pools[0]!.cards[1]!.probability = null;
 collection.sealBudgetScenario = {cm: true, pass: false, paid: 0, event: 0, selectedProducts: []};
 await page.goto('./#seal-budget');
 await page.evaluate(({master, collection, ck, sk}) => {
  localStorage.setItem(ck, JSON.stringify(master)); localStorage.setItem(sk, JSON.stringify(collection));
 }, {master, collection, ck: CATALOG_STORAGE_KEY, sk: STORAGE_KEY});
 await page.reload();
 await expect(page.locator('[data-seal-income]')).toHaveText('1,680');
 await expect(page.locator('[data-seal-balance]')).toHaveText('+1,680');
 await expect(page.locator('.seal-notes')).toHaveText(
  '架空の日次抽選の完凸条件は未確認のため除外。架空の日次抽選の提供割合は未確認のため除外。スター予算定義が未登録のためスター収支は未確認');
});

test('collection mode excludes unknown completion and protects storage on rejected catalog update', async ({page}) => {
 const {master, collection, definition} = collectionSealFixture();
 definition.cards[0]!.completedAt = null;
 collection.sealBudgetScenario = {cm: true, pass: false, paid: 0, event: 0, selectedProducts: ['fictional-paper']};
 await page.goto('./#seal-budget');
 await page.evaluate(({master, collection, ck, sk}) => {
  localStorage.setItem(ck, JSON.stringify(master)); localStorage.setItem(sk, JSON.stringify(collection));
 }, {master, collection, ck: CATALOG_STORAGE_KEY, sk: STORAGE_KEY});
 await page.reload();
 await expect(page.locator('[data-seal-income]')).toHaveText('2,400');
 await expect(page.locator('.seal-notes')).toBeVisible();
 await expect(page.locator('.seal-notes')).toContainText('未確認のため除外');
 const bytes = () => page.evaluate(({ck, sk}) => [localStorage.getItem(ck), localStorage.getItem(sk)], {ck: CATALOG_STORAGE_KEY, sk: STORAGE_KEY});
 const original = await bytes();
 await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
 definition.cards[0]!.completedAt = 7;
 await page.locator('#catalog-import').setInputFiles({name: 'fictional-invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(master))});
 await expect(page.getByRole('alert').filter({hasText: '完凸条件'})).toBeVisible();
 expect(await bytes()).toEqual(original);
 await chooseScreen(page, page.locator('nav [data-tab=seal-budget]'));
 await page.evaluate(() => {Storage.prototype.setItem = () => {throw new Error('quota');};});
 await page.locator('[name=paid][value="1"]').check();
 await expect(page.locator('[data-seal-message]')).toContainText('未保存');
 await expect(page.locator('[data-seal-income]')).toHaveText('2,400');
 expect(await bytes()).toEqual(original);
});
