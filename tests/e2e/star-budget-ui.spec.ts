import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { starBudgetReviewFixture } from '../helpers/star-budget-review';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';

test.use({hasTouch:true});
async function seed(page: Page, fixture = starBudgetReviewFixture()) {
  await page.goto('./');
  await page.evaluate(({master,collection,ck,sk}) => {
    localStorage.setItem(ck,JSON.stringify(master)); localStorage.setItem(sk,JSON.stringify(collection));
  }, {...fixture,ck:CATALOG_STORAGE_KEY,sk:STORAGE_KEY});
  await page.goto('./#star-budget'); await page.reload();
}
const premium = (page: Page) => page.locator('[data-budget-balance=premium]');
for (const width of [320,375,390,1280]) for (const theme of ['light','dark'] as const) {
  test(`populated hierarchy, controls and comparison at ${width}px ${theme}`, async ({page}) => {
    await page.setViewportSize({width,height:900}); await seed(page);
    await page.getByLabel('表示テーマ').selectOption(theme);
    await expect(premium(page)).toHaveText('+106.17');
    const results = page.locator('.budget-results'), conditions = page.locator('.budget-conditions');
    expect((await results.boundingBox())!.y).toBeLessThan((await conditions.boundingBox())!.y);
    await expect(results.getByRole('columnheader')).toHaveText(['項目','なし','Lite','Standard','Premium']);
    await expect(results.locator('[data-budget-metric]').first()).toContainText('週平均総供給');
    await expect(results.locator('[data-budget-metric=weekly-cost] td')).toHaveText(['2,190','2,190','2,190','2,190']);
    await expect(results.locator('caption')).toHaveText('スター/週（円価格の行を除く）');
    for (const name of ['ランク・イベント','供給に含める報酬','毎週の全交換']) await expect(conditions.getByRole('group',{name,exact:true})).toBeVisible();
    await page.getByRole('button',{name:'試算条件へ',exact:true}).click();
    await expect(page.locator('#budget-conditions-heading')).toBeFocused();
    const header = (await page.locator('.site-header').boundingBox())!;
    expect((await page.locator('#budget-conditions-heading').boundingBox())!.y).toBeGreaterThanOrEqual(header.y+header.height);
    for (const control of await page.locator('.ui-choice, .ui-field input').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const rank = page.getByRole('spinbutton',{name:'T.G.Wランク',exact:true});
    await expect(rank).toHaveAccessibleDescription('');
    await expect(page.getByRole('spinbutton',{name:'ストーリー付きイベント割合（%）'})).toHaveAccessibleDescription('0%=なし / 100%=毎回あり（全話回収）');
    await expect(page.getByRole('checkbox',{name:'プラチナ1の反復スターを含む'})).toHaveCount(0);
    await expect(page.getByText('アリーナは継続スターの根拠未確認のため予算対象外です。旧設定は現在の収支に適用しません。', { exact: true })).toBeVisible();
    const checkbox = page.getByRole('checkbox',{name:'シーズンミッションPremiumを購入',exact:true});
    if (width<700) await page.locator('label[for=budget-season]').tap();
    else {await checkbox.focus(); await page.keyboard.press('Space');}
    await expect(premium(page)).toHaveText('-313.83');
    await expect(checkbox).not.toBeChecked();
    await rank.fill('12');
    await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k)!).tgwRank,STORAGE_KEY)).toBe(12);
    await page.reload(); await expect(rank).toHaveValue('12'); await expect(checkbox).not.toBeChecked();
    await page.getByRole('button',{name:'比較結果へ戻る',exact:true}).click();
    await expect(page.locator('#budget-comparison-heading')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const region = page.getByRole('region',{name:'パス4種類の収支比較',exact:true});
    if (width<700) {
      await region.focus(); await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await region.evaluate(el => {el.scrollLeft=el.scrollWidth;});
      const rowLabel = region.locator('[data-budget-metric=balance] th');
      expect(Math.abs((await rowLabel.boundingBox())!.x-(await region.boundingBox())!.x)).toBeLessThanOrEqual(2);
      await expect(premium(page)).toBeInViewport();
    }
    // Explicitly exercise a constrained table viewport and its two sticky axes.
    await region.evaluate(el => {el.style.maxHeight='180px'; el.scrollTop=120;});
    const column = region.getByRole('columnheader',{name:'Premium',exact:true});
    expect(Math.abs((await column.boundingBox())!.y-(await region.boundingBox())!.y)).toBeLessThanOrEqual(2);
  });
}

test('invalid and failed saves identify stale results without claiming a new value was saved', async ({page}) => {
  await seed(page); const before = await page.evaluate(k => localStorage.getItem(k),STORAGE_KEY);
  const story = page.getByRole('spinbutton',{name:'ストーリー付きイベント割合（%）'});
  await story.fill('101');
  await expect(story).toHaveAttribute('aria-invalid','true');
  await expect(story).toHaveAccessibleDescription(/入力は未保存/);
  await expect(page.locator('[data-budget-result-state]')).toBeVisible();
  await expect(premium(page)).toHaveText('+106.17');
  expect(await page.evaluate(k => localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await story.fill('100'); await expect(story).toHaveAttribute('aria-invalid','false');
  await expect(page.locator('[data-budget-result-state]')).toBeHidden();
  const confirmed = await page.evaluate(k => localStorage.getItem(k),STORAGE_KEY);
  await page.evaluate(key => {const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v){if(k===key)throw new Error('fictional quota');original.call(this,k,v);};},STORAGE_KEY);
  await page.getByLabel('T.G.Wランク',{exact:true}).fill('12');
  await expect(page.locator('[data-budget-message]')).toContainText('未保存');
  await expect(page.locator('[data-budget-result-state]')).toBeVisible();
  await expect(page.locator('[data-budget-result-context]')).toContainText('ランク: 13');
  await expect(premium(page)).toHaveText('+106.17');
  expect(await page.evaluate(k => localStorage.getItem(k),STORAGE_KEY)).toBe(confirmed);
});

test('unknown supply preserves known subtotals, reasons and expanded evidence across recalculation', async ({page}) => {
  await page.setViewportSize({width:320,height:812});
  const fixture = starBudgetReviewFixture();
  fixture.master.starBudgetDefinition!.loginDaily = {value:null,status:'unconfirmed',basis:''};
  await seed(page,fixture);
  await expect(premium(page)).toHaveText('算出不可');
  await expect(page.locator('[data-budget-metric=total-supply]')).toContainText('未確認（既知分');
  await expect(page.locator('.budget-pending')).toBeVisible();
  const issues = page.locator('[data-section=issues]');
  await expect(issues).toHaveJSProperty('open',true); await expect(issues).toContainText('通常ログイン');
  const supply = page.locator('[data-section=supply]'); await supply.locator('summary').click();
  await expect(supply).toContainText('仮定');
  await page.getByLabel('T.G.Wランク',{exact:true}).fill('12');
  await expect(supply).toHaveJSProperty('open',true); await expect(issues).toHaveJSProperty('open',true);
});

test('unknown reference yen does not claim that known star balances are pending', async ({page}) => {
  const fixture=starBudgetReviewFixture();
  fixture.master.starBudgetDefinition!.passes.premium.priceYen={value:null,status:'unconfirmed',basis:''};
  await seed(page,fixture); await expect(premium(page)).toHaveText('+106.17');
  await expect(page.locator('[data-budget-metric=yen]')).toContainText('未確認');
  await expect(page.locator('.budget-pending')).toHaveCount(0);
  await expect(page.locator('[data-section=issues]')).toBeVisible();
});

test('protected collection keeps original bytes and disables all condition controls', async ({page}) => {
  await seed(page); await page.evaluate(k => localStorage.setItem(k,'fictional damaged collection'),STORAGE_KEY); await page.reload();
  await expect(page.locator('[data-budget-message]')).toContainText('保存データを保護');
  await expect(page.locator('.save-state')).toContainText('保護中');
  for (const control of await page.locator('.budget-form-body input').all()) await expect(control).toBeDisabled();
  await expect(premium(page)).toHaveCount(0);
  expect(await page.evaluate(k => localStorage.getItem(k),STORAGE_KEY)).toBe('fictional damaged collection');
});

test('imported product labels and evidence are rendered as text', async ({page}) => {
  await page.setViewportSize({width:320,height:812});
  const fixture=starBudgetReviewFixture();
  fixture.master.starBudgetDefinition!.products[1]!.name='X'.repeat(180);
  const name='<img src=x onerror="document.body.remove()">';
  fixture.master.starBudgetDefinition!.products[0]!.name=name;
  fixture.master.starBudgetDefinition!.loginDaily.basis='<svg onload="alert(1)">';
  await seed(page,fixture);
  await expect(page.locator('[data-budget-product=crystal-luck] label')).toHaveText(name);
  await page.locator('[data-section=supply] summary').click();
  await expect(page.locator('[data-budget-source=login]')).toContainText('<svg');
  await expect(page.locator('#star-budget-form img, #star-budget-form svg')).toHaveCount(0);
  await expect(premium(page)).toHaveText('+106.17');
  const region=page.getByRole('region',{name:'商品別の全交換条件',exact:true});
  expect((await page.locator('[data-budget-product=crystal-miracle] th').boundingBox())!.width).toBeLessThanOrEqual((await region.boundingBox())!.width);
});
