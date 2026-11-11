import { test, expect } from '@playwright/test';
import { chooseScreen } from '../helpers/navigation';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { navigationGroups } from '../../src/ui/navigation';
import { openRankInput } from '../helpers/rank-ui';
import { CATALOG_STORAGE_KEY, STORAGE_KEY } from '../../src/storage/local';

test.use({hasTouch: true});

const go = (page: import('@playwright/test').Page, tab: string) => chooseScreen(page, page.locator(`nav [data-tab="${tab}"]`));
async function seed(page: import('@playwright/test').Page) {
  const master = syntheticCatalog(), collection = syntheticCollection(master);
  await page.goto('./');
  await page.evaluate(({master, collection, ck, sk}) => {
    localStorage.setItem(ck, JSON.stringify(master)); localStorage.setItem(sk, JSON.stringify(collection));
  }, {master, collection, ck: CATALOG_STORAGE_KEY, sk: STORAGE_KEY});
  await page.reload();
}
for (const width of [1280, 320, 375, 390]) for (const theme of ['light', 'dark'] as const) {
  test(`all destinations, sticky shell and menu geometry: ${width}px ${theme}`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await seed(page);
    await page.getByLabel('表示テーマ').selectOption(theme);
    for (const [id] of navigationGroups.flatMap(group => [...group.tabs])) {
      await go(page, id);
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator('h1')).toBeFocused();
      await expect(page.locator(`nav [data-tab="${id}"]`)).toHaveAttribute('aria-current', 'page');
      expect(await page.locator('.brand small').innerText()).toBe(await page.locator('h1').innerText());
      const header = (await page.locator('.site-header').boundingBox())!;
      const title = (await page.locator('h1').boundingBox())!;
      expect(title.y).toBeGreaterThanOrEqual(header.y + header.height);
      await expect(page.locator('.save-state')).not.toBeEmpty();
      await expect(page.getByLabel('表示テーマ')).toHaveValue(theme);
      // Only the global shell is in scope; feature tables can scroll independently.
      for (const selector of ['.site-header', '.header-meta', '.brand', '.save-state']) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator('.site-header')).toBeInViewport();
      if (width <= 700) {
        await page.getByRole('button', {name: 'メニュー', exact: true}).click();
        await expect(page.getByRole('dialog', {name:'画面メニュー'})).toBeVisible();
        await expect(page.locator('.navigation')).toHaveJSProperty('scrollWidth', await page.locator('.navigation').evaluate(el => el.clientWidth));
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-menu-open]')).toBeFocused();
        await expect(page.locator('[data-menu-open]')).toHaveAttribute('aria-expanded', 'false');
      }
    }
  });
}

test('direct links, invalid hashes, back/forward and reload preserve the route under the base path', async ({page}) => {
  await page.goto('./#inventory');
  await expect(page.locator('h1')).toHaveText('素材在庫');
  await go(page, 'event'); await go(page, 'star-budget');
  await page.goBack(); await expect(page.locator('h1')).toHaveText('イベント周回プランナー');
  await page.goForward(); await expect(page.locator('h1')).toHaveText('スター予算');
  await page.reload(); await expect(page.locator('[data-tab="star-budget"]')).toHaveAttribute('aria-current','page');
  await page.goto('./#%E0%A4%A'); await expect(page).toHaveURL(/\/atsudori-tools\/#rating$/);
  await expect(page.locator('h1')).toHaveText('バンド評価値');
  await page.evaluate(() => { location.hash = 'manual'; });
  await expect(page.locator('h1')).toHaveText('表示値で個別計算');
});

test('mobile keyboard modal traps focus, closes explicitly and focuses the selected heading', async ({page}) => {
  await page.setViewportSize({width:320,height:640}); await page.goto('./');
  const trigger = page.locator('[data-menu-open]');
  await trigger.focus(); await page.keyboard.press('Enter');
  const close = page.getByRole('button', {name:'閉じる',exact:true});
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('nav [data-tab="exchange"]')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await close.press('Enter'); await expect(trigger).toBeFocused();
  await trigger.press('Enter'); await page.locator('nav [data-tab="members"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toBeFocused(); await expect(page.locator('[data-navigation-dialog]')).not.toBeVisible();
  await trigger.tap(); await close.tap(); await expect(trigger).toBeFocused();
  await trigger.tap(); await page.locator('nav [data-tab=snaps]').tap(); await expect(page.locator('h1')).toHaveText('所持スナップ');
  await trigger.tap(); await page.setViewportSize({width:1280,height:900});
  await expect(page.locator('[data-navigation-dialog]')).not.toBeVisible(); await expect(page.locator('nav')).toBeVisible();
});

test('history preserves invalid manual-save drafts and flushes valid ownership autosaves', async ({page}) => {
  await seed(page); await go(page,'progress'); await openRankInput(page,8201);
  await page.locator('#rank-8201').fill('0');
  await expect(page.locator('.save-state')).toContainText('未保存');
  await go(page,'members');
  await page.locator('[data-ownership-toggle]').first().click();
  await go(page,'items');
  await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k)!).members.length,STORAGE_KEY)).toBe(0);
  await page.goBack(); await page.goBack(); await openRankInput(page,8201);
  await expect(page.locator('#rank-8201')).toHaveValue('0');
  await expect(page.locator('.save-state')).toContainText('未保存');
  await go(page,'manual'); await page.locator('#manualP').fill('123'); await go(page,'rating'); await page.goBack();
  await expect(page.locator('#manualP')).toHaveValue('123');
});

test('protected storage and per-tool save failures remain visible across navigation', async ({page}) => {
  await page.goto('./');
  await page.evaluate(k => localStorage.setItem(k,'broken fictional data'),STORAGE_KEY); await page.reload();
  for (const tab of ['rating','event','economy','star-budget','exchange']) {
    await go(page,tab); await expect(page.locator('.save-state')).toHaveText('保存データを保護中');
  }
  expect(await page.evaluate(k => localStorage.getItem(k),STORAGE_KEY)).toBe('broken fictional data');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await go(page,'event');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('fictional quota'); }; });
  await page.locator('[data-common="targetPt"]').fill('1');
  await expect(page.locator('.save-state')).toHaveClass(/unsaved/);
  await go(page,'rating'); await page.goBack();
  await expect(page.locator('.save-state')).toHaveClass(/unsaved/);
  await expect(page.locator('[data-common="targetPt"]')).toHaveValue('1');
});


test('empty-state shortcuts use the same navigation and same-screen choices do not add history', async ({page}) => {
  await page.goto('./');
  await page.getByRole('button',{name:'JSON Import / Exportを開く'}).click();
  await expect(page).toHaveURL(/#exchange$/);
  const length = await page.evaluate(() => history.length);
  await go(page,'exchange'); expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack(); await page.getByRole('button',{name:'表示値で計算',exact:true}).last().click();
  await expect(page).toHaveURL(/#manual$/);
});


test('long protected-tool status fits the compact header', async ({page}) => {
  await page.setViewportSize({width:320,height:640}); await page.goto('./');
  await page.evaluate(() => localStorage.setItem('atsudori-tools.economy-scenario.v4','fictional old scenario'));
  await page.goto('./#economy'); await page.reload();
  await expect(page.locator('.save-state')).toContainText('元JSONを保護');
  const state=(await page.locator('.save-state').boundingBox())!, theme=(await page.locator('.theme-setting').boundingBox())!, header=(await page.locator('.site-header').boundingBox())!;
  expect(state.x).toBeGreaterThanOrEqual(theme.x+theme.width);
  expect(state.y+state.height).toBeLessThanOrEqual(header.y+header.height);
  expect(state.x+state.width).toBeLessThanOrEqual(320);
});
