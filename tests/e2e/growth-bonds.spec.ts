import {expect,test} from '@playwright/test';
import {displayOrderFixture} from '../helpers/display-order';
import {progressCharacters} from '../../src/ui/character-order';
import {CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
for(const legacy of [false,true])for(const width of [1280,390,320])test(`growth band cards preserve order and both pair endpoints legacy=${legacy} ${width}px`,async({page})=>{
  const {master:m,collection:c}=displayOrderFixture();if(legacy)m.characters.forEach(c=>delete c.displayOrder);
  await page.setViewportSize({width,height:900});await page.goto('./');await page.evaluate(({m,c,ck,sk})=>{localStorage.setItem(ck,JSON.stringify(m));localStorage.setItem(sk,JSON.stringify(c));},{m,c,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});await page.reload();
  await page.locator('nav [data-tab=progress]').click();
  for(const band of m.bands){
    const chars=progressCharacters(m.characters.filter(c=>c.bandId===band.id));
    await page.locator(`[data-progress-band="${band.id}"]`).click();
    const section=page.locator("[data-progress-scroll=characters]");
    expect(await section.locator('[data-bond-character]').evaluateAll(els=>els.map(el=>Number(el.getAttribute('data-bond-character'))))).toEqual(chars.map(c=>c.id));
    const boxes=await section.locator('[data-bond-character]').all();
    const ys=await Promise.all(boxes.map(b=>b.boundingBox()));expect(new Set(ys.map(b=>b!.y)).size).toBe(1);
    if(chars.length===5)expect(await section.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(width<700);
    for(const char of chars){
      const card=section.locator(`[data-bond-character="${char.id}"]`);await card.getByText('絆内訳',{exact:true}).click();
      await expect(card.locator('tbody th')).toHaveText(chars.filter(c=>c.id!==char.id).map(c=>c.name));
      await expect(card.locator('[data-bond-rank]')).toHaveCount(chars.length-1);
      await expect(card.locator('tbody td')).toHaveText(Array(chars.length-1).fill(chars.length===5?'5':'1'));
      await expect(card.locator('[data-progress-section^=bond-] ul')).toHaveCount(0);
      expect(await card.evaluate(el=>el.querySelector('table')!.getBoundingClientRect().width<=el.clientWidth)).toBe(true);
    }
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('[data-bond-theory]')).toHaveCount(0);
});
