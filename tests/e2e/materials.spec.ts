import { chooseScreen } from '../helpers/navigation';
import { test,expect } from '@playwright/test';
import { maximumTrainingFixture } from '../helpers/maximum-training';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';

for(const width of [1280,390,320])for(const theme of ['light','dark'] as const)test(`materials disclosures and preservation at ${width}px ${theme}`,async({page})=>{
  const {m,c}=maximumTrainingFixture();
  c.resourceInventory={paper:12,'member-exp':1000,'snap-exp':100};
  m.materialDefinition!.resources.push({id:'currency',name:'架空コイン',unit:'item'});
  m.materialDefinition!.schedules.find(s=>s.id==='train')!.stages[1]!.amounts.push({resourceId:'currency',quantity:23});
  await page.setViewportSize({width,height:900});await page.goto('./');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
  await page.locator('#catalog-import').setInputFiles({name:'fictional-catalog.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))});
  await page.locator('#import-file').setInputFiles({name:'fictional-collection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});
  await page.getByLabel('表示テーマ').selectOption(theme);
  const saved=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,CATALOG_STORAGE_KEY,TRAINING_STORAGE_KEY]);
  await expect(page.locator('nav [data-tab=members]')).toContainText('メンバー');
  await expect(page.locator('nav [data-tab=snaps]')).toContainText('スナップ');
  await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  const total=page.locator('[data-material-total]');
  await expect(page.locator('.training-settings')).toContainText('育成条件を変更');
  await expect(page.locator('[data-growth-overview]')).toHaveCount(0);
  await expect(page.locator('.growth-page')).not.toContainText(/評価値|暫定選出|総合ランクボーナス|育成後の変化|上がるキャラ/);
  await expect(page.locator('.growth-page > section > h2')).toHaveText(['必要素材']);
  await expect(total.locator('[data-material-resource="paper"] [data-material-required]')).toHaveText('20');
  await expect(total).toContainText('未計算項目');
  await expect(page.locator('[data-growth-band], [data-growth-character], [data-snap-materials]')).toHaveCount(0);
  const paper=page.locator('[data-material-resource="paper"]');
  const expected=[['member','paper','20','12','8'],['member','member-exp','43','1,000','0'],['member','currency','23','—','—'],['snap','snap-exp','126','100','26']];
  for(const [kind,id,required,stock,shortage] of expected){
    const section=total.locator(`[data-material-kind="${kind}"]`);
    const row=section.locator(`[data-material-resource="${id}"] > summary`);
    await expect(row.locator('[data-material-required]')).toHaveText(required!);
    await expect(row.locator('[data-material-stock]')).toHaveText(stock!);
    await expect(row.locator('[data-material-shortage]')).toHaveText(shortage!);
    await expect(row.locator('[data-material-shortage]')).toHaveClass(shortage==='8'||shortage==='26'?'material-shortage':'');
    if(shortage==='8'||shortage==='26')await expect(row.locator('[data-material-shortage]')).toHaveCSS('color',theme==='dark'?'rgb(255, 166, 174)':'rgb(177, 42, 53)');
    const headers=await section.locator('.material-column-headings > span').evaluateAll(cells=>cells.map(c=>c.getBoundingClientRect().right));
    const edges=await row.locator(':scope > *').evaluateAll(cells=>cells.map(c=>c.getBoundingClientRect().right));
    expect(edges).toEqual(headers);
    for(const cell of await row.locator(':scope > :not(:first-child)').all()){
      await expect(cell).toHaveCSS('text-align','right');await expect(cell).toHaveCSS('font-variant-numeric','tabular-nums');
    }
  }
  await expect(total).not.toContainText(/（上限）|途中EXP|上限見積もり/);
  await expect(total).toContainText('全体の不足は未確定');
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
  await expect(page.locator('[data-bond-character], [data-exp-target], [data-inventory-input], [data-inventory-totals]')).toHaveCount(0);
  const exp=page.locator('[data-material-resource="snap-exp"]');await exp.locator(':scope > summary').click();
  await expect(exp.locator('[data-material-required]')).toHaveText('126');
  await expect(exp.locator('.material-name')).toContainText('EXP');
  await expect(exp.locator('[data-material-consumer]')).toHaveCount(2);
  await exp.locator(':scope > summary').click();await expect(exp).not.toHaveAttribute('open','');
  await paper.locator(':scope > summary').press('Enter');await expect(paper).not.toHaveAttribute('open','');
  await page.locator('[data-material-unavailable] > summary').first().click();await expect(page.locator('[data-material-unavailable]').first()).toContainText('未計算');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.growth-page .panel').first()).toHaveCSS('background-color',theme==='dark'?'rgb(41, 41, 41)':'rgb(255, 255, 255)');
  if(width===390)await page.screenshot({path:`test-results/growth-390-${theme}.png`,fullPage:true});
  expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORAGE_KEY,CATALOG_STORAGE_KEY,TRAINING_STORAGE_KEY])).toEqual(saved);
  await page.reload();await chooseScreen(page, page.locator('nav [data-tab=materials]'));await expect(total.locator('[data-material-resource="paper"] [data-material-required]')).toHaveText('20');
  await expect(total.locator('[data-material-resource="snap-exp"] [data-material-shortage]')).toHaveText('26');
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(saved[0]);
  await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
  m.materialDefinition!.catalogRevision='incompatible';
  await page.locator('#catalog-import').setInputFiles({name:'wrong-revision.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))});
  await expect(page.locator('[role=alert]:visible')).toContainText('版が一致');
  expect(await page.evaluate(k=>localStorage.getItem(k),CATALOG_STORAGE_KEY)).toBe(saved[1]);expect(errors).toEqual([]);
});

test('missing definitions and manual overrides stay distinct in the growth view',async({page})=>{
  const {m,c}=maximumTrainingFixture();c.characterRanks={8201:3};c.totalRankBonus=0;
  await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  const open=async()=>{await chooseScreen(page, page.locator('nav [data-tab=progress]'));};
  await open();const char=page.locator('[data-bond-character="8201"]');
  await expect(char.locator('[data-bond-final]')).toHaveText('4');
  delete m.rankDefinition;delete m.materialDefinition;c.characterRanks={};delete c.totalRankBonus;
  await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();await open();
  await expect(char).toContainText('未算出');
  await chooseScreen(page, page.locator('nav [data-tab=materials]'));await expect(page.locator('[data-material-total]')).toContainText('素材マスタ未登録・未計算');
});

test('shared conditions update material totals and theory ranks',async({page})=>{
  const {m,c}=maximumTrainingFixture();c.resourceInventory={'member-exp':20,'snap-exp':100};
  await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  await chooseScreen(page, page.locator('nav [data-tab=progress]'));
  await page.locator('[data-progress-section="bond-8201"] > summary').click();
  await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  await page.locator('[data-material-resource="paper"] > summary').click();
  await chooseScreen(page, page.locator('nav [data-tab=progress]'));await expect(page.locator('[data-bond-character="8201"] [data-bond-final]')).toHaveText('4');await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  await page.getByRole('button',{name:'育成条件を変更'}).click();
  const dialog=page.getByRole('dialog',{name:'育成条件'});
  for(const select of await dialog.locator('select').all())await select.selectOption('');
  await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.locator('[data-material-total]')).not.toContainText('架空の折紙');
  await expect(page.locator('[data-material-resource="snap-exp"] [data-material-required]')).toHaveText('126');
  await expect(page.locator('[data-material-resource="snap-exp"] [data-material-stock]')).toHaveText('100');
  await expect(page.locator('[data-material-resource="snap-exp"] [data-material-shortage]')).toHaveText('26');
  await expect(page.locator('[data-material-resource="member-exp"]')).toHaveCount(0);
  await chooseScreen(page, page.locator('nav [data-tab=progress]'));await expect(page.locator('[data-bond-character="8201"] [data-bond-final]')).toHaveText('1');await expect(page.locator('[data-progress-section="bond-8201"]')).toHaveAttribute('open','');
  await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  await page.locator('[data-material-resource="snap-exp"] > summary').click();
  await page.getByRole('button',{name:'育成条件を変更'}).click();
  await dialog.locator('[data-training="trainingStage"]').selectOption('2');
  await dialog.locator('[data-training="snapRank"]').selectOption('2');
  await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.locator('[data-material-resource="snap-exp"]')).toHaveAttribute('open','');
  await expect(page.locator('[data-material-resource="snap-exp"] [data-material-required]')).toHaveText('366');
  await expect(page.locator('[data-material-resource="snap-exp"] [data-material-stock]')).toHaveText('100');
  await expect(page.locator('[data-material-resource="snap-exp"] [data-material-shortage]')).toHaveText('266');
  await expect(page.locator('[data-material-resource="member-exp"] [data-material-shortage]')).toHaveText('23');
  await expect(page.locator('[data-material-resource="paper"] [data-material-required]')).toHaveText('7');
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).resourceInventory,STORAGE_KEY)).toEqual(c.resourceInventory);
});

test('a shared resource has independent member and Snap subtotals whose sum is the existing total',async({page})=>{
  const {m,c}=maximumTrainingFixture();
  for(const [i,stage] of m.materialDefinition!.schedules.find(s=>s.id==='snap-lv')!.stages.entries())stage.amounts.push({resourceId:'paper',quantity:[10,45,130][i]!});
  await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  const resources=page.locator('[data-material-resource="paper"]');await expect(resources).toHaveCount(2);
  await expect(page.locator('[data-material-kind=member] [data-material-resource="paper"] [data-material-required]')).toHaveText('20');
  await expect(page.locator('[data-material-kind=snap] [data-material-resource="paper"] [data-material-required]')).toHaveText('70');
  expect(await resources.locator('[data-material-consumer]').evaluateAll(rows=>rows.reduce((sum,row)=>sum+Number((row as HTMLElement).dataset.quantity),0))).toBe(90);
});

for(const width of [1280,390,320])test(`large EXP quantities and long names stay in numeric columns at ${width}px`,async({page})=>{
  const {m,c}=maximumTrainingFixture();
  m.materialDefinition!.resources.find(r=>r.id==='member-exp')!.name='架空の長いメンバー育成用EXP名称の表示確認';
  m.materialDefinition!.schedules.find(s=>s.id==='member-lv')!.stages[1]!.amounts[0]!.quantity=123473;
  c.resourceInventory={'member-exp':100000,'snap-exp':Number.MAX_SAFE_INTEGER};
  await page.setViewportSize({width,height:900});await page.goto('./');
  await page.evaluate(({m,c,keys})=>{localStorage.setItem(keys[0]!,JSON.stringify(m));localStorage.setItem(keys[1]!,JSON.stringify(c));},{m,c,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY]});
  await page.reload();await chooseScreen(page, page.locator('nav [data-tab=materials]'));
  const member=page.locator('[data-material-resource="member-exp"]');
  await expect(member.locator('[data-material-required]')).toHaveText('123,456');
  await expect(member.locator('[data-material-stock]')).toHaveText('100,000');
  await expect(member.locator('[data-material-shortage]')).toHaveText('23,456');
  const snap=page.locator('[data-material-resource="snap-exp"]');
  await expect(snap.locator('[data-material-stock]')).toHaveText('9,007,199,254,740,991');
  await expect(snap.locator('[data-material-shortage]')).toHaveText('0');
  for(const summary of await page.locator('summary.material-columns').all()){
    const cells=await summary.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,scroll:n.scrollWidth,width:n.clientWidth};}));
    for(let i=0;i<cells.length;i++){
      expect(cells[i]!.left).toBeGreaterThanOrEqual(0);expect(cells[i]!.right).toBeLessThanOrEqual(width);
      expect(cells[i]!.scroll).toBeLessThanOrEqual(cells[i]!.width);
      if(i>0)expect(cells[i]!.left).toBeGreaterThan(cells[i-1]!.right);
    }
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/material-columns-${width}.png`,fullPage:true});
});
