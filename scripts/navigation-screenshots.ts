/** Capture only empty browser profiles; never read a user's catalog or collection. */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Pass a full base commit SHA');
const root = process.cwd(), output = resolve('.cache/navigation-review');
mkdirSync(output, {recursive:true});
const source = mkdtempSync(resolve('.cache/navigation-base-'));
const servers: ReturnType<typeof spawn>[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const archive = execFileSync('git', ['archive', base], {maxBuffer:32 * 1024 * 1024});
  execFileSync('tar', ['-x', '-C', source], {input:archive});
  symlinkSync(resolve('node_modules'), join(source, 'node_modules'), 'dir');
  execFileSync('npm', ['run','build'], {cwd:source, stdio:'inherit'});
  browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  for (const [version, cwd, port] of [['before',source,4184], ['after',root,4185]] as const) {
    servers.push(spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview','--host','127.0.0.1','--port',String(port),'--strictPort'], {cwd, stdio:'ignore'}));
    const url = `http://127.0.0.1:${port}${process.env.PAGES_BASE ?? '/atsudori-tools/'}`;
    let ready = false;
    for (let attempt=0; attempt<100; attempt++) {
      try { if ((await fetch(url)).ok) {ready=true;break;} } catch { /* Server is starting. */ }
      await new Promise(resolve => setTimeout(resolve,100));
    }
    if (!ready) throw new Error('Preview server did not start');
    for (const width of [1280,390]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      await page.goto(url); await page.getByLabel('表示テーマ').selectOption('light');
      await page.screenshot({path:join(output,`${version}-${width}.png`)});
      if (version==='after' && width===390) {
        await page.locator('[data-menu-open]').click();
        await page.screenshot({path:join(output,'after-390-menu.png')});
      }
      await page.close();
    }
  }
} finally {
  await browser?.close();
  for (const server of servers) server.kill();
  rmSync(source,{recursive:true,force:true});
}
console.log('Empty-state navigation screenshots: .cache/navigation-review');
