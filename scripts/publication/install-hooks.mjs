import { readdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { git } from './git.mjs';

export function installHooks(cwd = process.cwd()) {
  let configured = '';
  try { configured = git(['config', '--get', 'core.hooksPath'], cwd).trim(); } catch { /* No existing setting. */ }
  if (configured && configured !== '.githooks') throw Error('Existing hooks configuration');
  if (!configured) {
    const hooks = resolve(cwd, git(['rev-parse', '--git-path', 'hooks'], cwd).trim());
    if (existsSync(hooks) && readdirSync(hooks).some(name => !name.endsWith('.sample'))) throw Error('Existing custom hooks');
  }
  const hook = resolve(cwd, '.githooks/pre-push');
  if (!existsSync(hook)) throw Error('Hook missing');
  chmodSync(hook, 0o755);
  git(['config', '--local', 'core.hooksPath', '.githooks'], cwd);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { installHooks(); console.log('Local publication hook installed. Existing custom hooks are never replaced.'); }
  catch { console.error('Hook installation refused or failed. Check existing hooks/configuration locally; no settings or paths are printed.'); process.exitCode = 1; }
}
