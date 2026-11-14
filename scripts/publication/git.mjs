import { execFileSync } from 'node:child_process';
import { assertSafeText, assertSafeMetadata, assertCommitIdentity } from './rules.ts';

export const oid = value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value ?? '');
export const zero = value => oid(value) && /^0+$/.test(value);
export function git(args, cwd = process.cwd(), input) {
  return execFileSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' },
    stdio: ['pipe', 'pipe', 'ignore'] });
}

/** Inspect immutable objects, including removed files and annotated tags, without network calls. */
export function scanHistory(roots, { cwd = process.cwd(), files = true, base } = {}) {
  if (!roots.length || roots.some(root => !oid(root) || zero(root)) || (base && (!oid(base) || zero(base))))
    throw Error('Invalid object range');
  if (git(['rev-parse', '--is-shallow-repository'], cwd).trim() !== 'false') throw Error('Full history required');
  const revisions = roots.join('\n') + '\n' + (base ? '^' + base + '\n' : '');
  const entries = git(['rev-list', '--objects', '--stdin'], cwd, revisions).trim().split('\n').filter(Boolean);
  let inspected = 0;
  for (const entry of entries) {
    const id = entry.split(' ', 1)[0];
    if (!oid(id)) throw Error('Invalid object list');
    const type = git(['cat-file', '-t', id], cwd).trim();
    if (type === 'commit' || type === 'tag') {
      const text = git(['cat-file', type, id], cwd);
      assertSafeMetadata(text);
      assertCommitIdentity(text.split('\n\n', 1)[0], type === 'tag', id);
      inspected++;
    } else if (files && (type === 'blob' || type === 'tree')) {
      assertSafeText(entry.slice(id.length));
      assertSafeText(git(['cat-file', type, id], cwd));
      inspected++;
    }
  }
  return inspected;
}

export function scanUpdates(input, cwd = process.cwd()) {
  const roots = [];
  for (const line of input.split('\n').filter(line => line.trim())) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 4 || !oid(parts[1]) || !oid(parts[3])) throw Error('Invalid push update');
    const [localRef, localOid, remoteRef] = parts;
    // Deletions publish no new objects. Do not obstruct removal of an already exposed ref.
    if (zero(localOid)) continue;
    assertSafeMetadata(localRef);
    assertSafeMetadata(remoteRef);
    roots.push(localOid);
  }
  // Deliberately scan all reachable history, independent of the remote's advertised old SHA.
  return roots.length ? scanHistory([...new Set(roots)], { cwd }) : 0;
}
