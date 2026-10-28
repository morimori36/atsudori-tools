import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { multiMemberFixture } from '../helpers/multi-member';
import { fictionalProfile } from '../helpers/conversion';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';
const file = (value:unknown) => ({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});

for (const width of [1280,390]) for (const snapCount of [1,3,4]) {
  test(`three independent member rows and exports with ${snapCount} Snaps at ${width}px`, async ({page}) => {
    const {master,collection} = multiMemberFixture();
    collection.snaps = master.snaps.slice(0,snapCount).map(s => ({...collection.snaps[0]!,supportCardId:s.id}));
    master.members.reverse(); master.snaps.reverse(); collection.members.reverse(); collection.snaps.reverse();
    await page.setViewportSize({width,height:844}); await page.goto('./');
    await page.locator('nav [data-tab=exchange]').click();
    await page.locator('#catalog-import').setInputFiles(file(master));
    await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
    await page.locator('#import-file').setInputFiles(file(collection));
    await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
    const bytes = () => page.evaluate(({mk,ck}) => [localStorage.getItem(mk),localStorage.getItem(ck)],{mk:CATALOG_STORAGE_KEY,ck:STORAGE_KEY});
    const before = await bytes();
    await page.locator('nav [data-tab=rating]').click();
    const rows = page.locator('[data-rating-slot]');
    await expect(rows).toHaveCount(3);
    expect(await rows.evaluateAll(els=>els.map(el=>el.getAttribute('data-rating-slot')))).toEqual(['member-8301','member-8302','member-8303']);
    for (let i=0;i<3;i++) {
      await expect(rows.nth(i)).toContainText(`架空の独立カード${i+1}`);
      await expect(rows.nth(i).locator('td').nth(1)).toContainText(i<snapCount ? `架空の独立Snap${i+1}` : 'なし');
      await expect(rows.nth(i).locator('.slot-rating')).toHaveText(i<snapCount ? '857' : '767');
    }
    await expect(page.locator('.color-total strong')).toHaveText(snapCount===1 ? '2,391' : '2,571');
    await expect(page.locator('.band-result .rating-total strong')).toHaveText(snapCount===1 ? '2,391' : '2,571');
    expect(await page.locator('[id]').evaluateAll(els => new Set(els.map(el=>el.id)).size===els.length)).toBe(true);
    for (let i=0;i<3;i++) {
      const marker = rows.nth(i).locator('.note-marker').first();
      const target = await marker.getAttribute('aria-describedby');
      await expect(page.locator('#'+target)).toHaveCount(1);
      await marker.focus(); await expect(page.locator('#'+target)).toBeVisible();
      await expect(page.locator('#'+target)).toContainText('各最大3枚');
      await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('input[name=rating-mode][value=potential]').check();
    await expect(page.locator('.band-result .rating-total strong')).toHaveText(snapCount===1 ? '3,386' : '3,642');
    await expect(rows).toHaveCount(3);
    expect(await bytes()).toEqual(before);
    await page.reload(); await expect(page.locator('.band-result .rating-total strong')).toHaveText(snapCount===1 ? '2,391' : '2,571');
    await page.locator('nav [data-tab=exchange]').click();
    const ownedDownload = page.waitForEvent('download'); await page.locator('#export-button').click();
    const exported = JSON.parse(await readFile((await (await ownedDownload).path())!,'utf8'));
    expect(exported.members).toHaveLength(4); expect(exported.snaps).toHaveLength(snapCount);
    await page.locator('#conversion-profile-file').setInputFiles(file(await fictionalProfile(master)));
    const externalDownload = page.waitForEvent('download'); await page.locator('#conversion-preview').click();
    const external = JSON.parse(await readFile((await (await externalDownload).path())!,'utf8'));
    expect(external.roster.map((r:{id:number})=>r.id).sort()).toEqual([8301,8302,8303,8304]);
    expect(external.supports).toHaveLength(snapCount);
    expect(await bytes()).toEqual(before);
  });
}
test('pending reasons have separate tooltip IDs for each card of the same character', async ({page}) => {
  const {master,collection} = multiMemberFixture(); collection.bandItems={};
  await page.goto('./');
  await page.evaluate(({master,collection,mk,ck})=>{
    localStorage.setItem(mk,JSON.stringify(master));localStorage.setItem(ck,JSON.stringify(collection));
  },{master,collection,mk:CATALOG_STORAGE_KEY,ck:STORAGE_KEY});
  await page.reload();
  const rows=page.locator('[data-rating-slot]');await expect(rows).toHaveCount(3);
  for(let i=0;i<3;i++) {
    const marker=rows.nth(i).getByRole('button',{name:'計算待ちの理由'}), target=await marker.getAttribute('aria-describedby');
    await expect(page.locator('#'+target)).toHaveCount(1);
    await marker.focus();await expect(page.locator('#'+target)).toContainText('アイテムに未設定');
    await page.keyboard.press('Escape');
  }
  expect(await page.locator('[id]').evaluateAll(els=>new Set(els.map(el=>el.id)).size===els.length)).toBe(true);
});
