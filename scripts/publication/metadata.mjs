import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeMetadata, PublicationFinding } from './rules.ts';
import { git, scanHistory, oid, zero } from './git.mjs';

export function checkMetadata(data, cwd = process.cwd()) {
  for (const key of ['branch', 'title', 'body']) {
    if (typeof data[key] !== 'string') throw Error('Invalid metadata');
    assertSafeMetadata(data[key]);
  }
  if (!oid(data.head) || (data.base && !oid(data.base))) throw Error('Invalid commit range');
  return scanHistory([data.head], { cwd, files: false, base: data.base && !zero(data.base) ? data.base : undefined });
}

export function eventMetadata(event, name) {
  if (name === 'pull_request') {
    const pr = event.pull_request;
    if (!pr || !pr.head || !pr.base) throw Error('Missing PR metadata');
    return { branch: pr.head.ref, title: pr.title, body: pr.body ?? '', base: pr.base.sha, head: pr.head.sha };
  }
  if (name === 'push') return { branch: event.ref, title: '', body: '', base: event.before, head: event.after };
  if (name === 'workflow_dispatch') return { branch: process.env.GITHUB_REF, title: '', body: '', head: git(['rev-parse', 'HEAD']).trim() };
  throw Error('Unsupported event');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    let data;
    if (process.argv[2] === '--file' && process.argv.length === 4) data = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    else if (process.argv[2] === '--event' && process.argv.length === 3)
      data = eventMetadata(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), process.env.GITHUB_EVENT_NAME);
    else throw Error('Choose metadata input');
    const inspected = checkMetadata(data);
    console.log('Publication metadata check passed: branch, title, body and ' + inspected + ' commit/tag records. Origin, rights and publishability still require content review.');
  } catch (error) {
    console.error(error instanceof PublicationFinding ? error.message : 'Publication metadata check could not complete. No metadata or Git diagnostics are printed.');
    process.exitCode = 1;
  }
}
