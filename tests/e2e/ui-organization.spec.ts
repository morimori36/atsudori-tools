import { test, expect } from '@playwright/test';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';
import { TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';

test.use({ hasTouch: true });
const tab = (page: import('@playwright/test').Page, name: string) => page.locator(`nav [data-tab=${name}]`).click();
async function seed(page: import('@playwright/test').Page) {
  const master = syntheticCatalog(), collection = syntheticCollection(master);
  master.characters.push({id: 8202, bandId: 8101, name: '架空の長い名前の紙飛行機奏者'});
  for (const [i, rarity] of [2,3,4,10,20,99].entries()) {
    master.members.push({...master.members[0]!, id: 8320+i, cardType: i+1, rarity, name: '架空の長い名前'.repeat(8)});
    if (!master.memberLevelLimits.some(r => r.rarity===rarity)) master.memberLevelLimits.push(...master.memberLevelLimits.filter(r=>r.rarity===4).map(r=>({...r,rarity})));
    master.snaps.push({...master.snaps[0]!, id: 8520+i, cardType: i+1, rarity, name: '架空の長い名前'.repeat(8), title:'架空の紙演奏会'.repeat(8), characterIds:[8201,8202]});
    collection.snaps.push({...collection.snaps[0]!,supportCardId:8520+i});
  }
  await page.goto('./');
  await page.evaluate(({master,collection,ck,sk})=>{
    localStorage.setItem(ck,JSON.stringify(master)); localStorage.setItem(sk,JSON.stringify(collection));
  },{master,collection,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});
  await page.reload();
  return collection;
}

for (const width of [1280,390,320]) for (const theme of ['light','dark'] as const) test(`card labels, compact Snap and touch editing at ${width}px ${theme}`, async ({page})=>{
  await page.setViewportSize({width,height:900});
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await seed(page); await page.getByLabel('表示テーマ').selectOption(theme);
  await expect(page.locator('.panel').first()).toHaveCSS('background-color', theme === 'dark' ? 'rgb(41, 41, 41)' : 'rgb(255, 255, 255)');
  for (const kind of ['members','snaps']) {
    await tab(page,kind);
    const cards=page.locator('.collection-card');
    await expect(cards.locator('.rarity-badge')).toHaveText([kind==='members'?'SSR':'SR', 'R','SR','SSR','EX','BD','レアリティ99']);
    await expect(cards.locator('.card-type-label')).toHaveText(['色 7','紅赤','紺碧','翡翠','山吹','紫苑','色 6']);
    expect(await cards.last().evaluate(el=>getComputedStyle(el).getPropertyValue('--card-color').trim())).toBe('#6d6e81');
    // Ownership uses words/checks while the type keeps its own accent.
    const first=cards.first(), accent=await first.evaluate(el=>getComputedStyle(el).borderInlineStartColor);
    await first.locator('[data-ownership-toggle]').press('Enter');
    await expect(first.locator('[data-owned-label]')).toHaveText('未所持');
    expect(await first.evaluate(el=>getComputedStyle(el).borderInlineStartColor)).toBe(accent);
    await first.locator('[data-ownership-toggle]').tap();
    await expect(first.locator('[data-owned-label]')).toHaveText('✓ 所持');
    const stage=first.locator('.stage-options span').first();
    expect((await stage.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const cards=page.locator('.collection-card');
  const boxes=await cards.evaluateAll(els=>els.map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y})));
  if(width>700) expect(boxes[1]!.y).toBe(boxes[0]!.y);
  else {expect(boxes[1]!.x).toBe(boxes[0]!.x);expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);}
  const snap=cards.first();
  await snap.locator('[name=snapRank][value="2"]').check();
  await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).snaps.find((s:{supportCardId:number})=>s.supportCardId===8501).rank,STORAGE_KEY)).toBe(2);
  await page.locator('[data-filter=query]').fill('8520');
  await expect(cards.filter({visible:true})).toHaveCount(1);
  await page.locator('[data-reset-filters]').click();
  await page.locator('[data-filter=sort]').selectOption('name');
  await page.locator('.catalog-filters summary').click();
  await page.locator('[data-filter=type][value="1"]').check();
  await expect(cards.filter({visible:true})).toHaveCount(1);
  await page.locator('[data-reset-filters]').click();
  await page.reload(); await tab(page,'snaps');
  await expect(page.locator('[data-snap-card="8501"] [name=snapRank][value="2"]')).toBeChecked();
  expect(errors).toEqual([]);
});

for (const width of [1280,390]) test(`optional training settings preserve values, focus, and collection at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900}); await seed(page);
  const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await expect(page.locator('[data-training]')).toHaveCount(0);
  await page.locator('[name=rating-mode][value=potential]').check();
  const details=page.locator('[data-training-disclosure]');
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').press('Enter');
  const setting=page.locator('[data-training=liveSkillLevel]');
  await setting.focus(); await setting.selectOption('3');
  await expect(setting).toBeFocused(); await expect(details).toHaveAttribute('open');
  await details.locator('summary').tap(); await expect(setting).toBeHidden();
  await expect(details.locator('summary')).toContainText('ライブスキルLv 3');
  const trainingBytes=await page.evaluate(k=>localStorage.getItem(k),TRAINING_STORAGE_KEY);
  await page.locator('[name=rating-mode][value=current]').check(); await expect(page.locator('[data-training]')).toHaveCount(0);
  await page.locator('[name=rating-mode][value=potential]').check();
  await expect(setting).toHaveValue('3'); await expect(details).not.toHaveAttribute('open');
  await tab(page,'members'); await tab(page,'rating'); await details.locator('summary').click();
  await expect(setting).toHaveValue('3');
  await page.reload(); await expect(page.locator('[data-training]')).toHaveCount(0);
  await page.locator('[name=rating-mode][value=potential]').check(); await details.locator('summary').click();
  await expect(setting).toHaveValue('3');
  expect(await page.evaluate(k=>localStorage.getItem(k),TRAINING_STORAGE_KEY)).toBe(trainingBytes);
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
});

test('independent saves keep invalid and failed drafts out of other screens',async({page})=>{
  const original=await seed(page);
  await tab(page,'progress'); await page.locator('#rank-8201').fill('0');
  await tab(page,'items'); await page.locator('#item-8601').fill('2');
  await page.locator('#progress-form button[type=submit]').click();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),STORAGE_KEY)).toMatchObject({...original,bandItems:{8601:2}});
  await tab(page,'progress'); await expect(page.locator('#rank-8201')).toHaveValue('0');
  await page.locator('#rank-8201').fill('7');
  await tab(page,'items'); await page.locator('#item-8601').fill('');
  await tab(page,'progress'); await page.locator('#progress-form button[type=submit]').click();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).bandItems,STORAGE_KEY)).toEqual({8601:2});
  await tab(page,'items'); await expect(page.locator('#item-8601')).toHaveValue('');
  await page.locator('#item-8601').fill('1');
  await page.evaluate(()=>{const original=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){
    if(key.endsWith('collection.v1') && JSON.parse(value).bandItems['8601']===1) throw new Error('toy quota');
    original.call(this,key,value);
  };});
  await page.locator('#progress-form button[type=submit]').click();
  await expect(page.locator('[data-progress-state]')).toContainText('保存未完了');
  await tab(page,'progress'); await page.locator('#rank-8201').fill('3');
  await page.locator('#progress-form button[type=submit]').click();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).bandItems,STORAGE_KEY)).toEqual({8601:2});
  await tab(page,'items'); await expect(page.locator('#item-8601')).toHaveValue('1');
  await expect(page.locator('.save-state')).toContainText('未保存の入力あり');
});
