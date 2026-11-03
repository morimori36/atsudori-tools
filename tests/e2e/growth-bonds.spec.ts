import {expect,test} from '@playwright/test';
import {displayOrderFixture} from '../helpers/display-order';
import {progressCharacters} from '../../src/ui/character-order';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
for(const legacy of [false,true])for(const width of [1280,390,320])test(`growth band cards preserve order and both pair endpoints legacy=${legacy} ${width}px`,async({page})=>{
  const {master:m,collection:c}=displayOrderFixture();if(legacy)m.characters.forEach(c=>delete c.displayOrder);
  await page.setViewportSize({width,height:900});await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  await page.locator('nav [data-tab=materials]').click();
  for(const band of m.bands){
    const chars=progressCharacters(m.characters.filter(c=>c.bandId===band.id));
    const section=page.locator(`[data-bond-band="${band.id}"]`);
    expect(await section.locator('[data-bond-character]').evaluateAll(els=>els.map(el=>Number(el.getAttribute('data-bond-character'))))).toEqual(chars.map(c=>c.id));
    const boxes=await section.locator('[data-bond-character]').all();
    const ys=await Promise.all(boxes.map(b=>b.boundingBox()));expect(new Set(ys.map(b=>b!.y)).size).toBe(1);
    if(chars.length===5)expect(await section.locator('.bond-cards').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(width<1000);
    for(const char of chars){
      const card=section.locator(`[data-bond-character="${char.id}"]`);await card.locator(':scope > summary').click();
      await expect(card.locator('tbody th')).toHaveText(chars.filter(c=>c.id!==char.id).map(c=>c.name));
      await expect(card.locator('[data-bond-rank]')).toHaveCount(chars.length-1);
      await expect(card.locator('tbody td')).toHaveText(Array(chars.length-1).fill('1'));
      await expect(card.locator('ul')).toHaveCount(0);
    }
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('[data-bond-theory]')).not.toContainText('計算条件');
});
