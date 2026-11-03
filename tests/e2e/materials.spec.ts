import { test,expect } from '@playwright/test';
import { maximumTrainingFixture } from '../helpers/maximum-training';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';

for(const width of [1280,390,320])for(const theme of ['light','dark'] as const)test(`materials disclosures and preservation at ${width}px ${theme}`,async({page})=>{
  const {m,c}=maximumTrainingFixture();
  m.materialDefinition!.resources.push({id:'currency',name:'架空コイン',unit:'item'});
  m.materialDefinition!.schedules.find(s=>s.id==='train')!.stages[1]!.amounts.push({resourceId:'currency',quantity:23});
  await page.setViewportSize({width,height:900});await page.goto('./');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'JSON Import / Export',exact:true}).first().click();
  await page.locator('#catalog-import').setInputFiles({name:'fictional-catalog.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))});
  await page.locator('#import-file').setInputFiles({name:'fictional-collection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});
  await page.getByLabel('表示テーマ').selectOption(theme);
  const saved=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,CATALOG_STORAGE_KEY,TRAINING_STORAGE_KEY]);
  await expect(page.locator('nav [data-tab=members]')).toContainText('メンバー');
  await expect(page.locator('nav [data-tab=snaps]')).toContainText('スナップ');
  await page.getByRole('button',{name:'育成余地・素材',exact:true}).click();
  const total=page.locator('[data-material-total]');
  await expect(page.locator('.training-settings')).toContainText('育成条件を変更');
  await expect(page.locator('[data-growth-overview]')).toHaveCount(0);
  await expect(page.locator('.growth-page')).not.toContainText(/評価値|暫定選出|総合ランクボーナス|育成後の変化|上がるキャラ/);
  await expect(page.locator('.growth-page > section > h2')).toHaveText(['必要素材','絆理論値']);
  await expect(total.locator('[data-material-resource="paper"] > summary')).toContainText('20 個');
  await expect(total).toContainText('未計算項目');
  await expect(page.locator('[data-growth-band], [data-growth-character], [data-snap-materials]')).toHaveCount(0);
  const paper=page.locator('[data-material-resource="paper"]');
  await paper.locator(':scope > summary').press('Enter');
  await expect(paper.locator('[data-material-consumer]')).toHaveCount(2);
  for(const consumer of await page.locator('[data-material-consumer]').all()) {
    const [kind,id]=(await consumer.getAttribute('data-material-consumer'))!.split('-');
    const card=(kind==='member'?m.members:m.snaps).find(c=>c.id===Number(id))!;
    await expect(consumer.locator('.rarity-badge')).toHaveAttribute('data-rarity',String(card.rarity));
    await expect(consumer.locator('.card-type-label')).toHaveText('色 7');
    await expect(consumer).toContainText(`${card.name}［${card.title}］`);
  }
  await expect(page.locator('[data-bond-theory] .card-badges')).toHaveCount(0);
  expect(await paper.locator('[data-material-consumer]').evaluateAll(rows=>rows.reduce((n,r)=>n+Number((r as HTMLElement).dataset.quantity),0))).toBe(20);
  await expect(total.locator('summary').filter({hasText:/計算詳細|素材計算の注意/})).toHaveCount(0);
  await expect(paper.locator('[data-axis=trainingStage]')).toContainText('特訓1→2');
  await expect(total.locator('[data-material-kind=member] [data-material-consumer^=snap]')).toHaveCount(0);
  await expect(total.locator('[data-material-kind=snap] [data-material-consumer^=member]')).toHaveCount(0);
  const character=page.locator('[data-bond-character="8201"]');
  await expect(character.locator('[aria-label="最終キャラランク"]')).toHaveText('4');
  await expect(character.locator('[aria-label="最終絆合計"]')).toHaveText('1');
  await character.locator(':scope > summary').click();await expect(character.locator('[data-bond-rank]')).toHaveText('架空の紙笛奏者1');
  await page.locator('[data-bond-character="8202"] > summary').click();
  await expect(page.locator('[data-bond-character="8202"] [data-bond-rank]')).toHaveText('架空奏者A1');
  const exp=page.locator('[data-material-resource="snap-exp"]');await exp.locator(':scope > summary').click();
  await expect(exp.locator(':scope > summary')).toContainText('126 EXP（上限）');
  await expect(exp.locator('[data-material-consumer]')).toHaveCount(2);
  await page.locator('[data-material-unavailable] > summary').first().click();await expect(page.locator('[data-material-unavailable]').first()).toContainText('未計算');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.growth-page .panel').first()).toHaveCSS('background-color',theme==='dark'?'rgb(41, 41, 41)':'rgb(255, 255, 255)');
  if(width===390)await page.screenshot({path:`test-results/growth-390-${theme}.png`,fullPage:true});
  expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,CATALOG_STORAGE_KEY,TRAINING_STORAGE_KEY])).toEqual(saved);
  await page.reload();await page.getByRole('button',{name:'育成余地・素材',exact:true}).click();await expect(total).toContainText('架空の折紙：20 個');
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(saved[0]);
  await page.getByRole('button',{name:'JSON Import / Export',exact:true}).first().click();
  m.materialDefinition!.catalogRevision='incompatible';
  await page.locator('#catalog-import').setInputFiles({name:'wrong-revision.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))});
  await expect(page.locator('[role=alert]:visible')).toContainText('版が一致');
  expect(await page.evaluate(k=>localStorage.getItem(k),CATALOG_STORAGE_KEY)).toBe(saved[1]);expect(errors).toEqual([]);
});

test('missing definitions and manual overrides stay distinct in the growth view',async({page})=>{
  const {m,c}=maximumTrainingFixture();c.characterRanks={8201:3};c.totalRankBonus=0;
  await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  const open=async()=>{await page.getByRole('button',{name:'育成余地・素材',exact:true}).click();};
  await open();const char=page.locator('[data-bond-character="8201"]');
  await expect(char.locator('[aria-label="最終キャラランク"]')).toHaveText('4');
  delete m.rankDefinition;delete m.materialDefinition;c.characterRanks={};delete c.totalRankBonus;
  await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();await open();
  await expect(page.locator('[data-material-total]')).toContainText('素材マスタ未登録・未計算');
  await expect(char).toContainText('未算出：');
});

test('shared conditions update material totals and theory ranks',async({page})=>{
  const {m,c}=maximumTrainingFixture();
  await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  await page.getByRole('button',{name:'育成余地・素材',exact:true}).click();
  await page.locator('[data-bond-character="8201"] > summary').click();
  await page.locator('[data-material-resource="paper"] > summary').click();
  await expect(page.locator('[data-bond-character="8201"] [aria-label="最終キャラランク"]')).toHaveText('4');
  await page.getByRole('button',{name:'育成条件を変更'}).click();
  const dialog=page.getByRole('dialog',{name:'育成条件'});
  for(const select of await dialog.locator('select').all())await select.selectOption('');
  await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.locator('[data-material-total]')).not.toContainText('架空の折紙');
  await expect(page.locator('[data-material-total]')).toContainText('126 EXP');
  await expect(page.locator('[data-bond-character="8201"] [aria-label="最終キャラランク"]')).toHaveText('1');
});

test('a shared resource has independent member and Snap subtotals whose sum is the existing total',async({page})=>{
  const {m,c}=maximumTrainingFixture();
  for(const stage of m.materialDefinition!.schedules.find(s=>s.id==='snap-lv')!.stages)for(const amount of stage.amounts)amount.resourceId='member-exp';
  await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  await page.getByRole('button',{name:'育成余地・素材',exact:true}).click();
  const resources=page.locator('[data-material-resource="member-exp"]');await expect(resources).toHaveCount(2);
  await expect(page.locator('[data-material-kind=member] [data-material-resource="member-exp"] > summary')).toContainText('43 EXP');
  await expect(page.locator('[data-material-kind=snap] [data-material-resource="member-exp"] > summary')).toContainText('126 EXP');
  expect(await resources.locator('[data-material-consumer]').evaluateAll(rows=>rows.reduce((sum,row)=>sum+Number((row as HTMLElement).dataset.quantity),0))).toBe(169);
});
