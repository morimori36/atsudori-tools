import { chooseScreen } from '../helpers/navigation';
import {test,expect} from '@playwright/test';
import {economyFixture} from '../helpers/economy';
import {TRAINING_STORAGE_KEY} from '../../src/storage/training-settings';
import {ECONOMY_STORAGE_KEY} from '../../src/storage/economy';
test('shows six daily-clearance columns, handles zero supply, and saves without changing ownership',async({page})=>{
 const f=economyFixture();f.c.resourceInventory!.paper=1;delete f.c.resourceInventory!['member-exp'];
 await page.goto('./');await page.evaluate(({f,trainingKey,scenarioKey})=>{
  localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m));localStorage.setItem('atsudori-tools.collection.v1',JSON.stringify(f.c));localStorage.setItem(scenarioKey,JSON.stringify(f.scenario));
  localStorage.setItem(trainingKey,JSON.stringify({trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:null,snapRank:2}));
 },{f,trainingKey:TRAINING_STORAGE_KEY,scenarioKey:ECONOMY_STORAGE_KEY});
 await page.reload();const before=await page.evaluate(()=>localStorage.getItem('atsudori-tools.collection.v1'));
 await chooseScreen(page, page.locator('nav [data-tab=economy]'));
 const row=page.locator('[data-economy-resource=paper]');
 await expect(row.locator('th,td')).toHaveText(['架空の折紙','31','1','30','3','10日']);
 await expect(page.locator('[data-economy-resource=copy]')).toContainText('現在の条件では充足不可');
 await expect(page.locator('[data-economy-resource=member-exp]')).toContainText('算出不可');
 await expect(page.locator('[data-economy-resource=tokens-a]').locator('td').last()).toHaveText('0日');
 await expect(page.locator('[name=startDate],[name=endDate],[data-days],[name=pass],[data-compare]')).toHaveCount(0);
 await page.getByText('日平均供給の内訳・根拠',{exact:true}).click();await expect(page.getByText('イベント推計',{exact:true}).first()).toBeVisible();
 await page.locator('[name=includeEvents]').uncheck();
 await expect(row).toContainText('現在の条件では充足不可');
 await page.reload();await chooseScreen(page, page.locator('nav [data-tab=economy]'));await expect(page.locator('[name=includeEvents]')).not.toBeChecked();
 expect(await page.evaluate(()=>localStorage.getItem('atsudori-tools.collection.v1'))).toBe(before);
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:2,snapRank:2})),TRAINING_STORAGE_KEY);
 await page.reload();await chooseScreen(page, page.locator('nav [data-tab=economy]'));
 await expect(row).toContainText('未確認（小計');await expect(row).toContainText('算出不可');
 await expect(page.getByText('費用の根拠未確認',{exact:false})).toBeVisible();
});
test('protects old period conditions and rejects their import without overwriting',async({page})=>{
 const f=economyFixture();const old='{"format":"atsudori-tools/economy-scenario","schemaVersion":4,"startDate":"2024-01-01"}';
 await page.goto('./');await page.evaluate(({f,old})=>{localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m));localStorage.setItem('atsudori-tools.collection.v1',JSON.stringify(f.c));localStorage.setItem('atsudori-tools.economy-scenario.v4',old);},{f,old});await page.reload();await chooseScreen(page, page.locator('nav [data-tab=economy]'));
 await expect(page.getByText('旧形式・破損条件の元JSONを保護しています。v5条件をImportまたは初期化してください。',{exact:true})).toBeVisible();await expect(page.locator('[data-economy-resource]')).toHaveCount(0);
 await page.locator('[data-file]').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(old)});
 await expect(page.locator('[data-economy-message]')).toContainText('形式が不正');
 expect(await page.evaluate(()=>localStorage.getItem('atsudori-tools.economy-scenario.v4'))).toBe(old);
 expect(await page.evaluate(key=>localStorage.getItem(key),ECONOMY_STORAGE_KEY)).toBeNull();
});

for(const width of [1280,390,375,320])test(`consistent material order and compact conditions at ${width}px`,async({page})=>{
 const f=economyFixture();
 f.m.materialDefinition!.resources.find(r=>r.id==='paper')!.displayOrder=9;
 f.m.materialDefinition!.resources.find(r=>r.id==='tokens-a')!.displayOrder=2;
 f.m.materialDefinition!.resources.find(r=>r.id==='tokens-b')!.displayOrder=2;
 await page.setViewportSize({width,height:900});await page.goto('./');
 await page.evaluate(({f,key})=>{
  localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m));localStorage.setItem('atsudori-tools.collection.v1',JSON.stringify(f.c));
  localStorage.setItem(key,JSON.stringify(f.scenario));
 },{f,key:ECONOMY_STORAGE_KEY});await page.reload();
 const before=await page.evaluate(()=>localStorage.getItem('atsudori-tools.collection.v1'));
 await chooseScreen(page, page.locator('nav [data-tab=inventory]'));
 const inventory=await page.locator('[data-inventory-row]').evaluateAll(rows=>rows.map(r=>(r as HTMLElement).dataset.inventoryRow));
 expect(inventory).toEqual(['tokens-a','tokens-b','paper','copy','member-exp','snap-exp']);
 await chooseScreen(page, page.locator('nav [data-tab=materials]'));
 for(const section of await page.locator('[data-material-kind]').all()){
  const ids=await section.locator('[data-material-resource]').evaluateAll(rows=>rows.map(r=>(r as HTMLElement).dataset.materialResource));
  expect(ids).toEqual(inventory.filter(id=>ids.includes(id)));
 }
 await chooseScreen(page, page.locator('nav [data-tab=economy]'));
 expect(await page.locator('[data-economy-resource]').evaluateAll(rows=>rows.map(r=>(r as HTMLElement).dataset.economyResource))).toEqual(inventory);
 await expect(page.getByRole('heading',{name:'試算条件',exact:true})).toBeVisible();
 const lb=page.getByLabel('LB消費 / 日',{exact:true});await expect(lb).toBeVisible();
 expect(await lb.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await page.locator('[name=includeEvents]').uncheck();
 await expect(page.locator('[data-economy-message]')).toHaveText('自動保存しました');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('atsudori-tools.collection.v1'))).toBe(before);
 await page.screenshot({path:`test-results/economy-conditions-${width}.png`,fullPage:true});
});

test('autosaves valid conditions, preserves invalid drafts, focus and details, and reports atomic save failure',async({page})=>{
 const f=economyFixture();
 f.supply.fixedSources=[{id:'fictional-cycle',name:'架空の継続供給',basis:'人工の算術検証',intervalDays:{numerator:2,denominator:1},rewards:{fixed:[{resourceId:'paper',quantity:8,destination:'inventory'}],lotteries:[],unavailable:[]}}];
 await page.goto('./');await page.evaluate(({f,key})=>{localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m));localStorage.setItem('atsudori-tools.collection.v1',JSON.stringify(f.c));localStorage.setItem(key,JSON.stringify(f.scenario));},{f,key:ECONOMY_STORAGE_KEY});
 await page.goto('./#economy');await page.reload();
 await page.getByRole('button',{name:'試算条件を調整'}).click();await expect(page.locator('#economy-conditions-heading')).toBeFocused();expect(new URL(page.url()).hash).toBe('#economy');
 const field=page.locator('[name=fixed-0]');await expect(field).toHaveValue('0');
 const row=page.locator('[data-economy-resource=paper]');
 await expect(row.locator('td').nth(3)).toHaveText('3');
 await page.getByText('日平均供給の内訳・根拠',{exact:true}).click();
 for(const value of ['50','100','37','0']){
  await field.fill(value);await expect(field).toBeFocused();
  await expect(page.locator('.economy-results details').last()).toHaveAttribute('open','');
  await expect(row.locator('td').nth(3)).toHaveText(String(3+Number(value)*.04));
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).fixedSources[0]?.claimPercent??0,ECONOMY_STORAGE_KEY)).toBe(Number(value));
 }
 const saved=await page.evaluate(key=>localStorage.getItem(key),ECONOMY_STORAGE_KEY);
 await page.locator('[name=lb]').fill('');await expect(page.locator('[name=lb]')).toHaveAttribute('aria-invalid','true');
 await field.fill('101');await expect(field).toHaveValue('101');await expect(field).toHaveAttribute('aria-invalid','true');
 expect(await page.evaluate(key=>localStorage.getItem(key),ECONOMY_STORAGE_KEY)).toBe(saved);
 await expect(page.locator('[data-result-state]')).toContainText('変更前');
 await page.locator('[name=lb]').fill('0');await field.fill('50');
 await page.locator('[name=rank]').fill('');await expect(page.locator('[name=rank]')).toHaveValue('');
 await page.locator('[name=rank]').fill('6');await page.locator('[name=rankDaily]').check();
 await page.locator('[name=live]').check();await page.locator('[name=play]').selectOption('alto');await page.locator('[name=skip]').selectOption('skip');
 await page.locator('[name=lb]').fill('12');await page.locator('[name=skipPercent]').fill('50');
 await page.getByText('スタジオ',{exact:true}).click();await page.locator('[name=studio]').check();
 await page.locator('[name=band-8101]').fill('8');await page.locator('[name=interval]').fill('120');await page.locator('[name=minutes]').fill('240');
 await page.reload();await expect(field).toHaveValue('50');await expect(page.locator('[name=lb]')).toHaveValue('12');
 const stable=await page.evaluate(key=>localStorage.getItem(key),ECONOMY_STORAGE_KEY);const result=await row.innerText();
 await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('test quota','QuotaExceededError');original.call(this,k,v);};},ECONOMY_STORAGE_KEY);
 await field.fill('100');await expect(field).toHaveValue('100');await expect(page.locator('[data-economy-message]')).toContainText('保存できません');
 await expect(page.locator('[data-result-state]')).toContainText('変更前');expect(await row.innerText()).toBe(result);
 expect(await page.evaluate(key=>localStorage.getItem(key),ECONOMY_STORAGE_KEY)).toBe(stable);
});

for(const raw of ['{broken','{"format":"old"}'])test(`protects damaged v5 conditions ${raw}`,async({page})=>{
 await page.goto('./');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:ECONOMY_STORAGE_KEY,raw});await page.goto('./#economy');await page.reload();
 await page.locator('[name=lb]').fill('12');expect(await page.evaluate(key=>localStorage.getItem(key),ECONOMY_STORAGE_KEY)).toBe(raw);
 await expect(page.locator('[data-economy-message]')).toContainText('保護');
});
