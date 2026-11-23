import {chooseScreen as navigate} from '../helpers/navigation';
import {test,expect,type Locator,type Page} from '@playwright/test';
import {economyFixture} from '../helpers/economy';
import {TRAINING_STORAGE_KEY} from '../../src/storage/training-settings';
import {STORAGE_KEY} from '../../src/storage/local';
const editor= (page:Page) => page.getByRole('dialog',{name:'試算条件'});
async function openEditor(page:Page){
 await page.getByRole('button',{name:'試算条件を編集'}).click();
 await expect(editor(page)).toBeVisible();
}
async function chooseScreen(page:Page,target:Locator){
 const opening=await target.getAttribute('data-tab')==='economy';
 if(await editor(page).isVisible())await editor(page).getByRole('button',{name:'閉じる'}).click();
 await navigate(page,target);
 if(opening)await openEditor(page);
}
async function setup(page:Page,open=true){
 const f=economyFixture();f.c.resourceInventory!.paper=1;delete f.c.resourceInventory!['member-exp'];
 await page.goto('./');await page.evaluate(({f,key})=>{
  localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m));localStorage.setItem('atsudori-tools.collection.v1',JSON.stringify(f.c));
  localStorage.setItem(key,JSON.stringify({trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:null,snapRank:2}));
 },{f,key:TRAINING_STORAGE_KEY});await page.goto('./#economy');await page.reload();if(open)await openEditor(page);return f;
}
for(const width of [1280,390,320])test(`minimal conditions, material order, focus and autosave at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const f=await setup(page);
 const row=page.locator('[data-economy-resource=paper]');await expect(row.locator('th,td')).toHaveText(['架空の折紙','31','1','30','3','10日']);
 await expect(page.locator('[data-economy-resource=member-exp]')).not.toContainText('算出不可');
 await expect(page.locator('.economy-conditions details,[name=interval],[name=minutes],[name=skip],[name=skipPercent],[name=plays],[data-export],[data-reset]')).toHaveCount(0);
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
 await page.reload();await openEditor(page);await expect(lb).toHaveValue('12');await expect(page.locator('[name=scoreRank]')).toHaveValue('Alto');
 await expect(page.locator('[name=eventPremium]')).toBeChecked();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/economy-conditions-${width}.png`,fullPage:true});
});
test('preserves invalid drafts across navigation and keeps results and saved bytes atomic on failure',async({page})=>{
 await setup(page);const lb=page.locator('[name=lb]');const saved=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
 await lb.fill('');await expect(lb).toHaveAttribute('aria-invalid','true');
 await expect(editor(page).locator('[data-economy-preview]')).toContainText('変更前');
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
 await setup(page);await page.evaluate(()=>{for(let i=1;i<=5;i++)localStorage.setItem(`atsudori-tools.economy-scenario.v${i}`,'{broken');});await page.reload();await openEditor(page);
 await expect(page.locator('[data-economy-resource]')).not.toHaveCount(0);await page.locator('[name=lb]').fill('7');
 await expect(page.locator('[data-economy-message]')).toHaveText('自動保存しました');
 await page.evaluate(key=>localStorage.setItem(key,'{broken'),STORAGE_KEY);await page.reload();await openEditor(page);
 await expect(page.locator('[name=lb]')).toBeDisabled();expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe('{broken');
});

test('shares rank and Premium purchases with star budget in both directions',async({page})=>{
 const {starBudgetFixture}=await import('../helpers/star-budget');const f=await setup(page);
 f.m.starBudgetDefinition={...starBudgetFixture().definition,revision:f.m.revision};
 await page.evaluate(f=>localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m)),f);await page.reload();await openEditor(page);
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

for(const invalidField of ['lb','band-8101'])test(`rebases untouched shared values while restoring an invalid ${invalidField} draft`,async({page})=>{
 const {starBudgetFixture}=await import('../helpers/star-budget');const f=await setup(page);
 f.m.starBudgetDefinition={...starBudgetFixture().definition,revision:f.m.revision};
 await page.evaluate(f=>localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m)),f);await page.reload();await openEditor(page);
 const invalid=page.locator(`[name="${invalidField}"]`);
 await invalid.fill(invalidField==='lb'?'':'999');
 await chooseScreen(page,page.locator('nav [data-tab=star-budget]'));
 await page.locator('[name="scenario.rank"]').fill('9');
 await page.locator('[name="scenario.eventPremium"]').check();await page.locator('[name="scenario.seasonPremium"]').check();
 await chooseScreen(page,page.locator('nav [data-tab=economy]'));
 await expect(invalid).toHaveValue(invalidField==='lb'?'':'999');
 await expect(page.locator('[name=rank]')).toHaveValue('9');await expect(page.locator('[name=eventPremium]')).toBeChecked();await expect(page.locator('[name=seasonPremium]')).toBeChecked();
 await invalid.fill(invalidField==='lb'?'13':'8');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
 expect(saved.tgwRank).toBe(9);expect(saved.starBudgetScenario.eventPremium).toBe(true);expect(saved.starBudgetScenario.seasonPremium).toBe(true);
 await chooseScreen(page,page.locator('nav [data-tab=star-budget]'));await expect(page.locator('[name="scenario.rank"]')).toHaveValue('9');
 await page.locator('[name="scenario.eventPremium"]').uncheck();await page.locator('[name="scenario.seasonPremium"]').uncheck();
 await chooseScreen(page,page.locator('nav [data-tab=economy]'));await expect(page.locator('[name=eventPremium]')).not.toBeChecked();await expect(page.locator('[name=seasonPremium]')).not.toBeChecked();
});
test('keeps an explicitly edited shared field in a draft without restoring unrelated fields',async({page})=>{
 const {starBudgetFixture}=await import('../helpers/star-budget');const f=await setup(page);
 f.m.starBudgetDefinition={...starBudgetFixture().definition,revision:f.m.revision};
 await page.evaluate(f=>localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m)),f);await page.reload();await openEditor(page);
 await page.locator('[name=lb]').fill('');await page.locator('[name=rank]').fill('8');
 await chooseScreen(page,page.locator('nav [data-tab=star-budget]'));await page.locator('[name="scenario.rank"]').fill('9');await page.locator('[name="scenario.eventPremium"]').check();
 await chooseScreen(page,page.locator('nav [data-tab=economy]'));await expect(page.locator('[name=rank]')).toHaveValue('8');await expect(page.locator('[name=eventPremium]')).toBeChecked();
 await page.locator('[name=lb]').fill('13');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);expect(saved.tgwRank).toBe(8);expect(saved.starBudgetScenario.eventPremium).toBe(true);
});
test('rejects old supply catalogs without altering the current master or collection',async({page})=>{
 const f=await setup(page);await chooseScreen(page,page.locator('nav [data-tab=exchange]'));
 const before=await page.evaluate(()=>({...localStorage}));
 const old={...f.m,supplyDefinition:{...f.m.supplyDefinition,schemaVersion:4}};
 await page.locator('#catalog-import').setInputFiles({name:'old-supply.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
 await expect(page.getByRole('alert')).toContainText('再生成・再Import');
 expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
});
test('protects a saved v4 catalog and retains ownership and inventory through explicit v5 recovery',async({page})=>{
 const f=await setup(page);const old=JSON.stringify({...f.m,supplyDefinition:{...f.m.supplyDefinition,schemaVersion:4}});
 await page.evaluate(old=>localStorage.setItem('atsudori-tools.catalog.v1',old),old);
 const owned=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);await page.reload();
 await expect(page.locator('#autosave-warning')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('atsudori-tools.catalog.v1'))).toBe(old);
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(owned);
 await chooseScreen(page,page.locator('nav [data-tab=exchange]'));
 await page.locator('#catalog-import').setInputFiles({name:'supply-v5.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.m))});
 await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(owned);
 await chooseScreen(page,page.locator('nav [data-tab=economy]'));await expect(page.locator('[data-economy-resource=paper]')).toBeVisible();
});

for(const width of [1280,390,375,320])for(const theme of ['light','dark'] as const)test(`B layout and result preview at ${width}px in ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await setup(page,false);
 await page.getByLabel('表示テーマ').selectOption(theme);
 const results=page.getByRole('region',{name:'素材別の充足日数',exact:true});
 const table=results.getByRole('table');
 const list=results.getByRole('list',{name:'素材別の充足日数'});
 await expect(width===1280?table:list).toBeVisible();
 await expect(width===1280?list:table).toHaveCount(0);
 if(width<1280){
  const paper=list.getByRole('listitem').filter({has:page.getByRole('heading',{name:'架空の折紙'})});
  for(const value of ['必要量','現在庫','不足量','日平均供給','充足日数','10日'])await expect(paper).toContainText(value);
  const unregistered=list.getByRole('listitem').filter({has:page.getByRole('heading',{name:'架空Member経験値'})});
  await expect(unregistered).toContainText('未登録');
 }
 const detail=page.locator('[data-economy-breakdown]');
 await detail.locator('summary').click();
 await page.getByLabel('内訳を見る素材').selectOption('paper');
 await expect(detail).toContainText('イベント推計');
 const open=page.getByRole('button',{name:'試算条件を編集'});
 await open.focus();
 await open.press('Enter');
 const preview=editor(page).locator('[data-economy-preview]');
 await editor(page).getByLabel('確認する素材').selectOption('paper');
 await expect(preview).toContainText('10日');
 const lb=editor(page).getByLabel('LB消費量 / 日');
 await editor(page).getByLabel('ライブのスコアランク').selectOption('Alto');
 await lb.fill('12');
 await expect(lb).toBeFocused();
 await expect(preview).toContainText('1日');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await editor(page).evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth)).toBe(true);
 await lb.press('Escape');
 await expect(editor(page)).toHaveCount(0);
 await expect(open).toBeFocused();
 await expect(detail).toHaveAttribute('open','');
 await expect(detail).toContainText('架空ライブ Alto');
 await openEditor(page);
 await expect(editor(page).getByLabel('確認する素材')).toHaveValue('paper');
});

test('keeps the training controls open and restores focus after changing a goal',async({page})=>{
 await setup(page,false);
 await page.locator('.economy-goals summary').click();
 const launch=page.getByRole('button',{name:'育成条件を変更'});
 await launch.click();
 const training=page.getByRole('dialog',{name:'育成条件'});
 await training.getByLabel('メンバー 特訓段階').selectOption('1');
 await training.getByRole('button',{name:'閉じる'}).click();
 await expect(launch).toBeFocused();
 await expect(page.locator('.economy-goals')).toHaveAttribute('open','');
 await expect(page.locator('[data-economy-resource=paper] td').first()).toHaveText('24');
});
