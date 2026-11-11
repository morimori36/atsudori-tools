/** Compare populated UI using only the independent arithmetic review fixture. */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
type ReviewFixture = ReturnType<typeof import('../tests/helpers/star-budget-review').starBudgetReviewFixture>;

const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Pass a full base commit SHA');
const loader = await createServer({configFile:false, server:{middlewareMode:true, hmr:false}});
let fixture: ReviewFixture;
try { fixture = (await loader.ssrLoadModule('/tests/helpers/star-budget-review.ts')).starBudgetReviewFixture(); } finally { await loader.close(); }
const beforeOnly = process.argv[3] === 'before';
const root = process.cwd(), output = resolve('.cache/star-budget-review');
mkdirSync(output, {recursive:true});
const source = mkdtempSync(resolve('.cache/star-budget-base-'));
const servers: ReturnType<typeof spawn>[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const archive = execFileSync('git', ['archive', base], {maxBuffer:32 * 1024 * 1024});
  execFileSync('tar', ['-x', '-C', source], {input:archive});
  symlinkSync(resolve('node_modules'), join(source, 'node_modules'), 'dir');
  execFileSync('npm', ['run','build'], {cwd:source, stdio:'inherit'});
  browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  for (const [version, cwd, port] of [['before',source,4184], ['after',root,4185]] as const) {
    if (beforeOnly && version === 'after') continue;
    servers.push(spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview','--host','127.0.0.1','--port',String(port),'--strictPort'], {cwd, stdio:'ignore'}));
    const url = `http://127.0.0.1:${port}${process.env.PAGES_BASE ?? '/atsudori-tools/'}`;
    let ready = false;
    for (let attempt=0; attempt<100; attempt++) {
      try { if ((await fetch(url)).ok) {ready=true;break;} } catch { /* Server is starting. */ }
      await new Promise(resolve => setTimeout(resolve,100));
    }
    if (!ready) throw new Error('Preview server did not start');
    for (const width of [1280,390]) for (const theme of ['light','dark'] as const) {
      const page = await browser.newPage({viewport:{width,height:900}});
      await page.goto(url);
      await page.evaluate(({master,collection}) => {
        localStorage.setItem('atsudori-tools.catalog.v1', JSON.stringify(master));
        localStorage.setItem('atsudori-tools.collection.v1', JSON.stringify(collection));
      },fixture);
      await page.goto(`${url}#star-budget`); await page.reload();
      await page.getByLabel('表示テーマ').selectOption(theme);
      await page.locator('[data-budget-balance=premium]').waitFor();
      const name = `${version}-${width}-${theme}`;
      await page.screenshot({path:join(output,`${name}-overview.png`)});
      await page.locator('[data-budget-results]').screenshot({path:join(output,`${name}-results.png`), style:'.site-header { visibility: hidden !important; }'});
      if (width === 390) {
        const comparison = page.locator('.budget-comparison').locator('..');
        await comparison.evaluate(el => {el.scrollLeft=el.scrollWidth;});
        await page.locator('[data-budget-results]').screenshot({path:join(output,`${name}-results-right.png`), style:'.site-header { visibility: hidden !important; }'});
        await comparison.evaluate(el => {el.scrollLeft=0;});
      }
      await page.locator('.budget-form-body').screenshot({path:join(output,`${name}-conditions.png`), style:'.site-header { visibility: hidden !important; }'});
      await page.close();
    }
  }
} finally {
  await browser?.close();
  for (const server of servers) server.kill();
  rmSync(source,{recursive:true,force:true});
}
console.log('Fictional populated star-budget screenshots: .cache/star-budget-review');
