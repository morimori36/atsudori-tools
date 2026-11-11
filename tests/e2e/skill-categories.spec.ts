import { chooseScreen } from '../helpers/navigation';
import {expect,test} from '@playwright/test';
import {skillCategoryFixture} from '../helpers/skill-categories';
import {syntheticCollection} from '../helpers/synthetic';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
for(const width of [1280,390,320])test(`four independent skill filters at ${width}px`,async({page})=>{
  const m=skillCategoryFixture(),c=syntheticCollection(m);c.members[0]!.cardId=8401;
  await page.setViewportSize({width,height:900});await page.goto('./');
  await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  for(const [tab,a,b,first,second] of [['members',91,93,8401,8402],['snaps',95,97,8501,8502]] as const){
    await chooseScreen(page, page.locator(`nav [data-tab=${tab}]`));await page.locator('.catalog-filters > summary').click();
    const visible=page.locator('[data-catalog-id]:visible');
    await expect(visible).toHaveCount(4);
    await page.locator(`[data-filter=skill][value="${a}"]`).check();await expect(visible).toHaveCount(2);
    await page.locator(`[data-filter=secondarySkill][value="${b}"]`).check();await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute('data-catalog-id',String(first));
    await page.locator('[data-filter=skill][value=""]').check();await expect(visible).toHaveCount(2);
    await page.locator(`[data-filter=skill][value="${a+1}"]`).check();await expect(visible).toHaveCount(2);
    await page.locator(`[data-filter=secondarySkill][value="${b+1}"]`).check();await expect(visible).toHaveCount(0);
    await page.locator(`[data-filter=skill][value="${a}"]`).check();await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute('data-catalog-id',String(second));
    await page.locator('[data-filter=secondarySkill][value=""]').check();
    await page.locator(`[data-filter=skill][value="${a+1}"]`).check();
    await page.locator('[data-filter=ownership][value=unowned]').check();await expect(visible).toHaveCount(1);
    await expect(visible).not.toHaveAttribute('data-catalog-id',String(first));
    await page.locator('[data-reset-filters]').click();await expect(visible).toHaveCount(4);
    await page.locator(`[data-filter=skill][value="${a}"]`).check();
    await page.locator('[data-filter=query]').fill(String(second));await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute('data-catalog-id',String(second));
    await page.locator('[data-reset-filters]').click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // A catalog update removes classification without changing holdings or inventing categories.
  const saved=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  delete m.skillCategories;for(const r of m.members){delete r.liveSkillCategoryIds;delete r.gekisouSkillCategoryIds;}for(const r of m.snaps){delete r.supportSkillCategoryIds;delete r.gekisouSupportSkillCategoryIds;}
  await chooseScreen(page, page.locator('nav [data-tab=exchange]'));await page.locator('#catalog-import').setInputFiles({name:'old-catalog.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))});
  await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  await chooseScreen(page, page.locator('nav [data-tab=members]'));await page.locator('[data-reset-filters]').click();
  await expect(page.locator('[data-catalog-id]:visible')).toHaveCount(4);
  await expect(page.locator('[data-filter=skill]')).toHaveCount(1);
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(saved);
});

test('invalid unreferenced category kinds are refused without replacing the saved catalog',async({page})=>{
  const m=skillCategoryFixture();
  await page.goto('./');
  await chooseScreen(page, page.locator('nav [data-tab=exchange]'));
  const upload=async(value:unknown)=>page.locator('#catalog-import').setInputFiles({name:'fictional-catalog.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await upload(m);await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  const saved=await page.evaluate(key=>localStorage.getItem(key),CATALOG_STORAGE_KEY);
  await upload({...m,skillCategories:[...m.skillCategories!,{id:999,kind:['live'],name:'架空の未参照分類'}]});
  await expect(page.getByRole('alert').filter({hasText:'$.skillCategories'})).toContainText('スキル系統');
  expect(await page.evaluate(key=>localStorage.getItem(key),CATALOG_STORAGE_KEY)).toBe(saved);
  await chooseScreen(page, page.locator('nav [data-tab=members]'));
  await expect(page.locator('[data-filter=skill]')).toHaveCount(3);
});
