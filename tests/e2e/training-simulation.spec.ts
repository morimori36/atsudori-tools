import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {trainingEvaluationFixture} from '../helpers/training-evaluation';
import {fictionalProfile} from '../helpers/conversion';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
import {TRAINING_STORAGE_KEY} from '../../src/storage/training-settings';
import {PROFILE_STORAGE_KEY} from '../../src/ui/conversion-export';
const keep={trainingStage:null,awakeningStage:null,liveSkillLevel:null,gekisouSkillLevel:null,snapRank:null};
const nav=async(page:Page,tab:string)=>page.locator(`nav [data-tab=${tab}]`).click();
const open=async(page:Page)=>{await page.getByRole('button',{name:'育成条件を変更'}).click();return page.getByRole('dialog',{name:'育成条件'});};
async function seed(page:Page,missing=false) {
  const {m,c}=trainingEvaluationFixture();if(missing)delete m.rankDefinition;
  const p=await fictionalProfile(m);
  await page.goto('./');await page.evaluate(({m,c,p,ck,sk,pk})=>{
    localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));localStorage.setItem(pk,p);
  },{m,c,p:JSON.stringify(p),ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY,pk:PROFILE_STORAGE_KEY});await page.reload();return {m,c};
}
const output=async(page:Page)=>{
  await expect(page.locator('#conversion-preview')).toBeEnabled();
  const download=page.waitForEvent('download');await page.locator('#conversion-preview').click();return JSON.parse(await readFile((await (await download).path())!,'utf8'));
};
for(const width of [1280,390,320])test(`five shared targets, modal keyboard, recalculation and export at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:720});await seed(page);
  const saved=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY]);
  const conditions=page.getByRole('region',{name:'育成条件',exact:true});
  await expect(conditions.locator('.training-heading strong')).toHaveText('育成条件');
  await expect(conditions.locator('.training-summary-group h3')).toHaveText(['メンバー','スナップ']);
  await expect(conditions.locator('.training-summary-group').nth(0).locator('dt')).toHaveText(['特訓','覚醒','ライブ','撃奏']);
  await expect(conditions.locator('.training-summary-group').nth(0).locator('dd')).toHaveText(['5','—','5','5']);
  await expect(conditions.locator('.training-summary-group').nth(1).locator('dt')).toHaveText('上限解放');
  await expect(conditions.locator('.training-summary-group').nth(1).locator('dd')).toHaveText('—');
  const rating=page.locator('.band-result .rating-total strong');await expect(rating).toHaveText('645');
  await page.getByRole('radio',{name:'育成後',exact:true}).check();await expect(rating).toHaveText('1,304');
  let dialog=await open(page);await expect(dialog.locator('select')).toHaveCount(5);
  await expect(dialog.locator('select').first()).toBeFocused();
  for(const select of await dialog.locator('select').all())await expect(select.locator('option')).toHaveText(['変更しない','1','2','3','4','5']);
  await dialog.getByText('「変更しない」とLvについて',{exact:true}).click();await expect(dialog).toContainText('段階を維持する場合も');
  await dialog.locator('[data-training=trainingStage]').focus();await dialog.locator('[data-training=trainingStage]').selectOption('1');await expect(dialog.locator('[data-training=trainingStage]')).toBeFocused();
  await dialog.locator('[data-training=awakeningStage]').selectOption('2');
  await dialog.locator('[data-training=liveSkillLevel]').selectOption('3');
  await dialog.locator('[data-training=gekisouSkillLevel]').selectOption('4');
  await dialog.locator('[data-training=snapRank]').selectOption('5');
  // Native modal traps both directions at the boundary.
  await dialog.getByRole('button',{name:'閉じる',exact:true}).focus();await page.keyboard.press('Tab');await expect(dialog.locator('select').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'閉じる',exact:true})).toBeFocused();
  expect(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
  if(width!==320)await page.screenshot({path:`test-results/training-dialog-${width}.png`});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'育成条件を変更'})).toBeFocused();
  await nav(page,'materials');
  await expect(page.locator('[data-growth-overview]')).toHaveCount(0);
  await expect(page.locator('[data-material-total]')).toContainText('架空の折紙');
  await nav(page,'progress');
  await expect(page.locator('[data-bond-character="8201"] [data-bond-final]')).toHaveText('4');
  await nav(page,'materials');
  dialog=await open(page);await expect(dialog.locator('[data-training=snapRank]')).toHaveValue('5');
  for(const key of Object.keys(keep))await dialog.locator(`[data-training=${key}]`).selectOption('');
  await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.locator('[data-material-resource="snap-exp"] [data-material-required]')).toHaveText('126');await expect(page.locator('[data-material-total]')).not.toContainText('架空の折紙');
  await nav(page,'exchange');await expect(page.getByLabel('育成条件を適用する',{exact:true})).not.toBeChecked();
  expect((await output(page)).total).toBe(5);
  dialog=await open(page);await expect(dialog.locator('[data-training=trainingStage]')).toHaveValue('');
  await dialog.locator('[data-training=trainingStage]').selectOption('2');await dialog.locator('[data-training=liveSkillLevel]').selectOption('2');await dialog.locator('[data-training=gekisouSkillLevel]').selectOption('2');
  await page.keyboard.press('Escape');await page.getByLabel('育成条件を適用する',{exact:true}).check();
  const json=await output(page);expect(json.total).toBe(8);expect(json.ranks).toEqual({8201:4,8202:1,8203:1,8204:1,8205:1});expect(json.supports.map((s:{lv:number})=>s.lv)).toEqual([2,2]);
  await page.getByLabel('育成条件を適用する',{exact:true}).uncheck();
  await nav(page,'rating');await expect(rating).toHaveText('1,304');await page.getByRole('radio',{name:'現在',exact:true}).check();await expect(rating).toHaveText('645');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY])).toEqual(saved);
  await page.reload();dialog=await open(page);await expect(dialog.locator('[data-training=trainingStage]')).toHaveValue('2');await expect(dialog.locator('[data-training=awakeningStage]')).toHaveValue('');await page.keyboard.press('Escape');
});
test('old four-field settings remain protected on load, then persist all five fields',async({page})=>{
  await seed(page);const old={trainingStage:2,awakeningStage:null,liveSkillLevel:3,gekisouSkillLevel:4};
  await page.evaluate(({key,old})=>localStorage.setItem(key,JSON.stringify(old)),{key:TRAINING_STORAGE_KEY,old});await page.reload();
  const dialog=await open(page);await expect(dialog.locator('[data-training=snapRank]')).toHaveValue('');await expect(dialog.locator('[data-training=liveSkillLevel]')).toHaveValue('3');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),TRAINING_STORAGE_KEY)).toEqual(old);
  await dialog.locator('[data-training=snapRank]').selectOption('1');await page.keyboard.press('Escape');await page.reload();
  await open(page);await expect(page.locator('[data-training=snapRank]')).toHaveValue('1');
});
test('damaged settings require explicit recovery; failed saves remain visible without changing saved bytes',async({page})=>{
  await seed(page);await page.evaluate(key=>localStorage.setItem(key,'broken'),TRAINING_STORAGE_KEY);await page.reload();
  let dialog=await open(page);await expect(dialog.locator('select').first()).toBeDisabled();await expect(dialog).toContainText('元の設定を保護');await page.keyboard.press('Escape');
  expect(await page.evaluate(key=>localStorage.getItem(key),TRAINING_STORAGE_KEY)).toBe('broken');
  dialog=await open(page);await dialog.getByRole('button',{name:'保存設定を初期設定で置き換える'}).click();await expect(dialog.locator('select').first()).toBeEnabled();
  const saved=await page.evaluate(key=>localStorage.getItem(key),TRAINING_STORAGE_KEY);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('quota');};});
  await dialog.locator('[data-training=snapRank]').selectOption('2');await expect(dialog).toContainText('未保存');await page.keyboard.press('Escape');await expect(page.locator('[data-training-summary=snapRank] dd')).toHaveText('2');
  expect(await page.evaluate(key=>localStorage.getItem(key),TRAINING_STORAGE_KEY)).toBe(saved);
});
test('unavailable theory is pending in both pages and ordinary export remains available',async({page})=>{
  const {c}=await seed(page,true);c.characterRanks={8201:3,8202:1,8203:1,8204:1,8205:1};c.totalRankBonus=0;
  await page.evaluate(({key,c})=>localStorage.setItem(key,JSON.stringify(c)),{key:STORAGE_KEY,c});await page.reload();
  await expect(page.locator('.band-result .rating-total strong')).not.toHaveText('—');
  await page.getByRole('radio',{name:'育成後',exact:true}).check();await expect(page.locator('.band-result .rating-total strong')).toHaveText('—');
  await page.getByRole('button',{name:'計算待ちの理由'}).click();await expect(page.getByRole('tooltip').filter({hasText:'絆理論値は保留'})).toBeVisible();
  await nav(page,'materials');
  await nav(page,'progress');await expect(page.locator('[data-bond-character="8201"]')).toContainText('未算出');
  await nav(page,'exchange');await page.getByLabel('育成条件を適用する',{exact:true}).check();expect((await output(page)).total).toBe(7);
});

for(const [width,touch] of [[1280,false],[390,true],[320,true]] as const)test.describe(`floating training explanation at ${width}px`,()=>{
  test.use({viewport:{width,height:720},hasTouch:touch});
  test('shows beside the title across all three pages without moving the summary or results',async({page})=>{
    await seed(page);
    for(const tab of ['rating','materials','exchange']) {
      await nav(page,tab);
      const info=page.getByRole('button',{name:'育成条件の説明',exact:true});
      const tip=page.locator('#training-info-tooltip');
      const layout=()=>page.locator('.training-settings').evaluate(e=>{
        const panel=e.getBoundingClientRect(),summary=e.querySelector('.training-summary')!.getBoundingClientRect();
        const next=e.nextElementSibling?.getBoundingClientRect();
        return {x:panel.x,y:panel.y+scrollY,height:panel.height,summaryY:summary.y+scrollY,nextY:next?next.y+scrollY:undefined};
      });
      await expect(tip).toBeHidden();await info.scrollIntoViewIfNeeded();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const before=await layout();
      if(touch)await info.tap();else await info.hover();
      await expect(tip).toBeVisible();await expect(tip).toHaveCSS('position','fixed');
      await expect(tip).toContainText('所持データは変更しません');expect(await layout()).toEqual(before);
      const box=await tip.boundingBox(),anchor=await info.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(720);
      expect(Math.abs(box!.y-anchor!.y)).toBeLessThan(160);
      if(!touch) {
        // Moving from the icon onto the bubble keeps the text available.
        await tip.hover();await expect(tip).toBeVisible();
        await page.mouse.move(0,0);await expect(tip).toBeHidden();
        await info.click();await expect(tip).toBeVisible();
      }
      if(tab==='rating')await page.screenshot({path:`test-results/training-tooltip-${width}.png`});
      await page.keyboard.press('Escape');await expect(tip).toBeHidden();expect(await layout()).toEqual(before);
      if(touch)await info.tap();else await info.click();
      await expect(tip).toBeVisible();
      await page.locator('h1').click();await expect(tip).toBeHidden();
      await page.mouse.move(0,0);await info.scrollIntoViewIfNeeded();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await info.focus();await expect(tip).toBeVisible();
      await page.keyboard.press('Escape');await expect(tip).toBeHidden();
      await info.press('Enter');await expect(tip).toBeVisible();
      await info.press('Space');await expect(tip).toBeHidden();
      await page.locator('h1').click();
      expect(await layout()).toEqual(before);
    }
  });
});

test('a hovering pointer crosses the real tooltip gap in both directions before dismissal',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await seed(page);
  for(const tab of ['rating','materials','exchange']) {
    await nav(page,tab);
    const info=page.getByRole('button',{name:'育成条件の説明',exact:true}),tip=page.locator('#training-info-tooltip');
    await info.scrollIntoViewIfNeeded();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await info.hover();await expect(info).not.toBeFocused();await expect(tip).toBeVisible();
    const anchor=(await info.boundingBox())!,bubble=(await tip.boundingBox())!;
    const x=anchor.x+anchor.width/2;
    // Stop halfway across the actual gap, with neither the icon nor the tooltip hovered.
    const below=bubble.y>=anchor.y+anchor.height;
    const gapY=below?(anchor.y+anchor.height+bubble.y)/2:(bubble.y+bubble.height+anchor.y)/2;
    expect(below?bubble.y-(anchor.y+anchor.height):anchor.y-(bubble.y+bubble.height)).toBe(6);
    await page.mouse.move(x,gapY);await page.waitForTimeout(100);await expect(tip).toBeVisible();
    await page.mouse.move(x,below?bubble.y+8:bubble.y+bubble.height-8);await page.waitForTimeout(350);await expect(tip).toBeVisible();
    // Crossing back also cancels dismissal when the pointer returns to the icon.
    await page.mouse.move(x,gapY);await page.waitForTimeout(100);await expect(tip).toBeVisible();
    await page.mouse.move(x,anchor.y+anchor.height/2);await page.waitForTimeout(350);await expect(tip).toBeVisible();
    // Leaving both elements still dismisses the hover-only explanation.
    await page.mouse.move(0,0);await expect(tip).toBeHidden();
    // Esc while dismissal is pending must remain effective after the timer's deadline.
    await info.hover();await page.mouse.move(x,gapY);await page.keyboard.press('Escape');
    await page.waitForTimeout(350);await expect(tip).toBeHidden();
  }
});
