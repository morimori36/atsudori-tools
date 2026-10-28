import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { STORAGE_KEY } from '../../src/storage/local';
const file = (value: unknown) => ({ name: 'fictional-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
const current = () => ({ ...syntheticCollection(), tgwRank: 12, characterProgress: {8201: { stamps: 8, bondRankTotal: 30, liveClears: 100, songClears: 10, skillLevel5: 2 }} });
test.beforeEach(async ({ page }) => {
  await page.goto('./');await page.locator('nav [data-tab=exchange]').click();
  await page.locator('#catalog-import').setInputFiles(file(syntheticCatalog()));
  await expect(page.getByText('マスタをImportしました',{exact:true})).toBeVisible();
  await page.locator('#import-file').setInputFiles(file(current()));
  await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
});
test('automatic imports retain omitted progress and TGW, survive reload and export on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const incoming = { ...syntheticCollection(), members: [], snaps: [], characterRanks: { 8201: 7 }, bandItems: { 8601: null } };
  await page.locator('#import-file').setInputFiles(file(incoming));
  await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
  const expected = { ...incoming, characterProgress: current().characterProgress, tgwRank:12 };
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();await page.locator('nav [data-tab=exchange]').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-button').click()]);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(expected);
});
test('sparse progress honors zero and the same file can be selected again; cancellation does nothing', async ({ page }) => {
  const incoming={ ...syntheticCollection(), characterProgress: { 8201: { stamps: 0 } } };
  for(let i=0;i<2;i++) {
    await page.locator('#import-file').setInputFiles(file(incoming));
    await expect(page.getByText('所持データをImportしました',{exact:true})).toBeVisible();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).characterProgress, STORAGE_KEY)).toEqual({8201:{...current().characterProgress[8201],stamps:0}});
  }
  const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  await page.locator('#import-file').setInputFiles([]);
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
});
test('failed saving retains existing storage and in-memory data', async ({ page }) => {
  const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.locator('#import-file').setInputFiles(file({ ...syntheticCollection(), members: [] }));
  await expect(page.getByRole('alert')).toContainText('保存できません');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-button').click()]);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(current());
});

for(const kind of ['collection','catalog','profile'] as const) test(`${kind} rejects stale async reads and accepts the same file again`,async({page})=>{
  const {fictionalProfile}=await import('../helpers/conversion');
  const {CATALOG_STORAGE_KEY}=await import('../../src/storage/local');
  const {PROFILE_STORAGE_KEY}=await import('../../src/ui/conversion-export');
  const original=kind==='collection'?current():kind==='catalog'?syntheticCatalog():await fictionalProfile();
  const newer=structuredClone(original);
  if('tgwRank' in newer) newer.tgwRank=23;
  else if('revision' in newer) newer.revision='fictional-newer';
  else if('version' in newer) {
    newer.version='fictional-newer';
    const {digest}=await import('../../src/domain/conversion/profile');
    const {checksum:_,...base}=newer;newer.checksum=await digest(base);
  }
  const selector=kind==='collection'?'#import-file':kind==='catalog'?'#catalog-import':'#conversion-profile-file';
  const key=kind==='collection'?STORAGE_KEY:kind==='catalog'?CATALOG_STORAGE_KEY:PROFILE_STORAGE_KEY;
  await page.evaluate(()=>{
    const read=File.prototype.text;
    File.prototype.text=async function(){
      if(this.name==='slow.json') await new Promise<void>(resolve=>{(window as unknown as {release:()=>void}).release=resolve;});
      return read.call(this);
    };
  });
  await page.locator(selector).setInputFiles({...file(original),name:'slow.json'});
  await page.locator(selector).setInputFiles(file(newer));
  await expect.poll(()=>page.evaluate(k=>localStorage.getItem(k),key)).not.toBeNull();
  await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key)).toMatchObject({...newer});
  await page.evaluate(()=>{(window as unknown as {release:()=>void}).release();});
  // Allow the released read and profile digest work to finish before checking for rollback.
  await page.waitForTimeout(150);
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key)).toMatchObject({...newer});
  // A subsequent read from the same file exercises resetting the native input value too.
  await page.locator(selector).setInputFiles(file(newer));
  await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key)).toMatchObject({...newer});
});

test('failed master persistence preserves both previous master and collection',async({page})=>{
  const before=await page.evaluate(()=>({...localStorage}));
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
  await page.locator('#catalog-import').setInputFiles(file({...syntheticCatalog(),revision:'fictional-newer'}));
  await expect(page.getByRole('alert')).toContainText('マスタを保存できません');
  expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#catalog-export').click()]);
  expect(JSON.parse(await readFile((await download.path())!,'utf8'))).toEqual(syntheticCatalog());
});
