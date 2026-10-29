import { test, expect } from '@playwright/test';
import { multiMemberFixture } from '../helpers/multi-member';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';

for (const width of [1280,390,320]) for (const count of [1,2,3]) {
  test(`character totals and master rarity labels: ${count} cards at ${width}px`, async ({page}) => {
    const {master,collection} = multiMemberFixture();
    // Independent fictional catalog: display codes must survive comparison priorities.
    master.members[0]!.rarity=10; master.members[1]!.rarity=20;
    master.memberLevelLimits.push(...[10,20].flatMap(rarity=>[
      {rarity,trainingStage:1,limitLevel:1},{rarity,trainingStage:2,limitLevel:2},
    ]));
    master.snaps[0]!.rarity=10; master.snaps[1]!.rarity=20; master.snaps[2]!.rarity=4;
    collection.members=collection.members.slice(0,count);
    collection.snaps=master.snaps.slice(0,count).map(s=>({...collection.snaps[0]!,supportCardId:s.id}));
    await page.setViewportSize({width,height:900}); await page.goto('./');
    await page.evaluate(({master,collection,mk,ck})=>{
      localStorage.setItem(mk,JSON.stringify(master));localStorage.setItem(ck,JSON.stringify(collection));
    },{master,collection,mk:CATALOG_STORAGE_KEY,ck:STORAGE_KEY});
    await page.reload();
    await expect(page.locator('[data-rating-character] th')).toHaveText(master.characters[0]!.name);
    const rows=page.locator('[data-rating-slot]'); await expect(rows).toHaveCount(count);
    for(let i=0;i<count;i++) {
      await expect(rows.nth(i).locator('td').nth(0).locator('.rarity-label')).toHaveText(['EX','BD','R'][i]!);
      await expect(rows.nth(i).locator('td').nth(1).locator('.rarity-label')).toHaveText(['EX','BD','SSR'][i]!);
      await expect(rows.nth(i).locator('.slot-rating')).toHaveText('857');
      await expect(rows.nth(i)).toContainText(`架空の独立カード${i+1}`);
      await expect(rows.nth(i)).toContainText(`架空の独立Snap${i+1}`);
    }
    await expect(page.locator('.character-total')).toHaveCount(count===1?0:1);
    if(count>1) await expect(page.locator('.character-total strong')).toHaveText(count===2?'1,714':'2,571');
    await expect(page.locator('.color-total strong')).toHaveText(['857','1,714','2,571'][count-1]!);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await rows.first().locator('.rarity-label').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)<parseFloat(getComputedStyle(el.parentElement!).fontSize))).toBe(true);
    if(count===3) await page.screenshot({path:`test-results/character-summary-${width}.png`,fullPage:true});
  });
}

test('pending candidate rarities remain distinct and character total stays pending',async ({page})=>{
  const {master,collection}=multiMemberFixture();
  master.members[0]!.rarity=99;
  master.memberLevelLimits.push({rarity:99,trainingStage:1,limitLevel:1},{rarity:99,trainingStage:2,limitLevel:2});
  await page.goto('./');
  await page.evaluate(({master,collection,mk,ck})=>{
    localStorage.setItem(mk,JSON.stringify(master));localStorage.setItem(ck,JSON.stringify(collection));
  },{master,collection,mk:CATALOG_STORAGE_KEY,ck:STORAGE_KEY});
  await page.reload();
  await expect(page.locator('[data-rating-slot] .rarity-label')).toHaveText(['レアリティ99','SR','R','R']);
  await expect(page.locator('[data-rating-character]')).toHaveCount(1);
  await expect(page.locator('.slot-rating')).toHaveCount(0);
  await expect(page.locator('.color-total')).toContainText('合計は保留');
});
