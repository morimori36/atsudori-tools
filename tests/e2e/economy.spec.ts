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
 await page.locator('nav [data-tab=economy]').click();
 const row=page.locator('[data-economy-resource=paper]');
 await expect(row.locator('th,td')).toHaveText(['架空の折紙','31','1','30','3','10日']);
 await expect(page.locator('[data-economy-resource=copy]')).toContainText('現在の条件では充足不可');
 await expect(page.locator('[data-economy-resource=member-exp]')).toContainText('算出不可');
 await expect(page.locator('[data-economy-resource=tokens-a]').locator('td').last()).toHaveText('0日');
 await expect(page.locator('[name=startDate],[name=endDate],[data-days],[name=pass],[data-compare]')).toHaveCount(0);
 await page.getByText('日平均供給の内訳・根拠',{exact:true}).click();await expect(page.getByText('イベント推計',{exact:true}).first()).toBeVisible();
 await page.locator('[name=includeEvents]').uncheck();await page.getByRole('button',{name:'試算して条件を保存',exact:true}).click();
 await expect(row).toContainText('現在の条件では充足不可');
 await page.reload();await page.locator('nav [data-tab=economy]').click();await expect(page.locator('[name=includeEvents]')).not.toBeChecked();
 expect(await page.evaluate(()=>localStorage.getItem('atsudori-tools.collection.v1'))).toBe(before);
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:2,snapRank:2})),TRAINING_STORAGE_KEY);
 await page.reload();await page.locator('nav [data-tab=economy]').click();
 await expect(row).toContainText('未確認（小計');await expect(row).toContainText('算出不可');
 await expect(page.getByText('費用の根拠未確認',{exact:false})).toBeVisible();
});
test('protects old period conditions and rejects their import without overwriting',async({page})=>{
 const f=economyFixture();const old='{"format":"atsudori-tools/economy-scenario","schemaVersion":4,"startDate":"2024-01-01"}';
 await page.goto('./');await page.evaluate(({f,old})=>{localStorage.setItem('atsudori-tools.catalog.v1',JSON.stringify(f.m));localStorage.setItem('atsudori-tools.collection.v1',JSON.stringify(f.c));localStorage.setItem('atsudori-tools.economy-scenario.v4',old);},{f,old});await page.reload();await page.locator('nav [data-tab=economy]').click();
 await expect(page.getByText('旧形式・破損条件の元JSONを保護しています。v5条件をImportまたは初期化してください。',{exact:true})).toBeVisible();await expect(page.locator('[data-economy-resource]')).toHaveCount(0);
 await page.locator('[data-file]').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(old)});
 await expect(page.locator('[data-economy-message]')).toContainText('形式が不正');
 expect(await page.evaluate(()=>localStorage.getItem('atsudori-tools.economy-scenario.v4'))).toBe(old);
 expect(await page.evaluate(key=>localStorage.getItem(key),ECONOMY_STORAGE_KEY)).toBeNull();
});
