import {chooseScreen} from '../helpers/navigation';
import {test,expect,type Page} from '@playwright/test';
import {economyFixture} from '../helpers/economy';
import {TRAINING_STORAGE_KEY} from '../../src/storage/training-settings';
import {STORAGE_KEY} from '../../src/storage/local';
async function setup(page:Page){
 const f=economyFixture();f.c.resourceInventory!.paper=1;delete f.c.resourceInventory!['member-exp'];
 await page.goto('./');await page.evaluate(({f,key})=>{
  localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m));localStorage.setItem('atsudori-tools.collection.v1',JSON.stringify(f.c));
  localStorage.setItem(key,JSON.stringify({trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:null,snapRank:2}));
 },{f,key:TRAINING_STORAGE_KEY});await page.goto('./#economy');await page.reload();return f;
}
for(const width of [1280,390,320])test(`minimal conditions, material order, focus and autosave at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const f=await setup(page);
 const row=page.locator('[data-economy-resource=paper]');await expect(row.locator('th,td')).toHaveText(['架空の折紙','31','1','30','3','10日']);
 await expect(page.locator('[data-economy-resource=member-exp]')).toContainText('算出不可');
 await expect(page.locator('.economy-conditions details,.economy-results details,[name=interval],[name=minutes],[name=skip],[name=skipPercent],[name=plays],[data-export],[data-reset]')).toHaveCount(0);
 const lb=page.getByLabel('LB消費量 / 日',{exact:true});await lb.fill('12');await expect(lb).toBeFocused();
 await page.getByLabel('ライブのスコアランク',{exact:true}).selectOption('Alto');
 await expect(row.locator('td').nth(3)).toHaveText('255');
 await page.getByLabel('イベントミッションPremiumを購入',{exact:true}).check();
 await expect(page.locator('[data-economy-message]')).toHaveText('自動保存しました');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
 expect(saved.supplyConditions).toEqual({lbPerDay:12,scoreRank:'Alto',studioLevels:[]});expect(saved.starBudgetScenario.eventPremium).toBe(true);
 expect(saved.members).toEqual(f.c.members);expect(saved.resourceInventory).toEqual(f.c.resourceInventory);
 await chooseScreen(page,page.locator('nav [data-tab=inventory]'));
 const inventory=await page.locator('[data-inventory-row]').evaluateAll(rows=>rows.map(r=>(r as HTMLElement).dataset.inventoryRow));
 await chooseScreen(page,page.locator('nav [data-tab=economy]'));
 expect(await page.locator('[data-economy-resource]').evaluateAll(rows=>rows.map(r=>(r as HTMLElement).dataset.economyResource))).toEqual(inventory);
 await page.reload();await expect(lb).toHaveValue('12');await expect(page.locator('[name=scoreRank]')).toHaveValue('Alto');
 await expect(page.locator('[name=eventPremium]')).toBeChecked();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/economy-conditions-${width}.png`,fullPage:true});
});
test('preserves invalid drafts across navigation and keeps results and saved bytes atomic on failure',async({page})=>{
 await setup(page);const lb=page.locator('[name=lb]');const saved=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
 await lb.fill('');await expect(lb).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('[data-result-state]')).toContainText('変更前');
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(saved);
 await chooseScreen(page,page.locator('nav [data-tab=inventory]'));await chooseScreen(page,page.locator('nav [data-tab=economy]'));await expect(lb).toHaveValue('');
 await lb.fill('0');const band=page.locator('[name=band-8101]');await band.fill('999');await expect(band).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('[data-economy-message]')).toContainText('練習Lv');await band.fill('');
 const stable=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);const result=await page.locator('.economy-table').innerText();
 await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('test quota','QuotaExceededError');original.call(this,k,v);};},STORAGE_KEY);
 await lb.fill('20');await expect(lb).toBeFocused();await expect(page.locator('[data-economy-message]')).toContainText('保存');
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(stable);
 expect(await page.locator('.economy-table').innerText()).toBe(result);
});
test('ignores abandoned scenario keys and uses the common collection recovery guard',async({page})=>{
 await setup(page);await page.evaluate(()=>{for(let i=1;i<=5;i++)localStorage.setItem(`atsudori-tools.economy-scenario.v${i}`,'{broken');});await page.reload();
 await expect(page.locator('[data-economy-resource]')).not.toHaveCount(0);await page.locator('[name=lb]').fill('7');
 await expect(page.locator('[data-economy-message]')).toHaveText('自動保存しました');
 await page.evaluate(key=>localStorage.setItem(key,'{broken'),STORAGE_KEY);await page.reload();
 await expect(page.locator('[name=lb]')).toBeDisabled();expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe('{broken');
});

test('shares rank and Premium purchases with star budget in both directions',async({page})=>{
 const {starBudgetFixture}=await import('../helpers/star-budget');const f=await setup(page);
 f.m.starBudgetDefinition={...starBudgetFixture().definition,revision:f.m.revision};
 await page.evaluate(f=>localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m)),f);await page.reload();
 await page.locator('[name=rank]').fill('9');await page.locator('[name=eventPremium]').check();
 await chooseScreen(page,page.locator('nav [data-tab=star-budget]'));
 await expect(page.locator('[name="scenario.rank"]')).toHaveValue('9');await expect(page.locator('[name="scenario.eventPremium"]')).toBeChecked();
 await page.locator('[name="scenario.rank"]').fill('11');await page.locator('[name="scenario.seasonPremium"]').check();
 await chooseScreen(page,page.locator('nav [data-tab=economy]'));
 await expect(page.locator('[name=rank]')).toHaveValue('11');await expect(page.locator('[name=seasonPremium]')).toBeChecked();
 await page.locator('[name=rank]').fill('');await chooseScreen(page,page.locator('nav [data-tab=star-budget]'));await expect(page.locator('[name="scenario.rank"]')).toHaveValue('');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
 expect(saved.tgwRank).toBeUndefined();expect(saved.supplyConditions).not.toHaveProperty('rank');expect(saved.supplyConditions).not.toHaveProperty('eventPremium');
});
