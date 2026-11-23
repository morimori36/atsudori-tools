import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import type { ratingLayoutFixture } from '../tests/helpers/rating-layout';

const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Pass a full base commit SHA');
const loader = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
let fixture: ReturnType<typeof ratingLayoutFixture>;
try {
  fixture = (await loader.ssrLoadModule('/tests/helpers/rating-layout.ts')).ratingLayoutFixture();
} finally {
  await loader.close();
}

const output = resolve('.cache/rating-layout-review');
mkdirSync(output, { recursive: true });
const source = mkdtempSync(resolve('.cache/rating-layout-base-'));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const archive = execFileSync('git', ['archive', base], { maxBuffer: 32 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', source], { input: archive });
  symlinkSync(resolve('node_modules'), join(source, 'node_modules'), 'dir');
  const pagesBase = process.env.PAGES_BASE ?? '/atsudori-tools/';
  execFileSync('npm', ['run', 'build'], { cwd: source, stdio: 'inherit' });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const contentTypes: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
  for (const [version, dist] of [['before', join(source, 'dist')], ['after', resolve('dist')]] as const) {
    for (const width of [1280, 390]) for (const colorScheme of ['light', 'dark'] as const) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme });
      await page.route('http://rating-review.test/**', async route => {
        const path = new URL(route.request().url()).pathname.slice(pagesBase.length) || 'index.html';
        if (path !== 'index.html' && !/^assets\/[\w.-]+\.(css|js)$/.test(path)) {
          return route.fulfill({ status: 404 });
        }
        const contentType = contentTypes[path.split('.').at(-1)!]!;
        await route.fulfill({ contentType, body: readFileSync(join(dist, path)) });
      });
      await page.addInitScript(({ master, collection }) => {
        localStorage.setItem('atsudori-tools.catalog.v1', JSON.stringify(master));
        localStorage.setItem('atsudori-tools.collection.v1', JSON.stringify(collection));
      }, fixture);
      await page.goto(`http://rating-review.test${pagesBase}#rating`);
      const firstColor = page.locator('.color-result[data-band="8101"][data-color="7"] > summary');
      if (await firstColor.count()) await firstColor.click();
      await page.locator('.slot-rating').first().waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(output, `${version}-${width}-${colorScheme}.png`), fullPage: true });
      await page.close();
    }
  }
} finally {
  await browser?.close();
  rmSync(source, { recursive: true, force: true });
}
