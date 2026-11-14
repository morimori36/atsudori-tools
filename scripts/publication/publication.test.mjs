import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertSafeText, assertSafeMetadata, assertCommitIdentity, isSafeCommitIdentity, PublicationFinding } from './rules.ts';
import { git, scanHistory, scanUpdates } from './git.mjs';
import { installHooks } from './install-hooks.mjs';
import { checkMetadata, eventMetadata } from './metadata.mjs';

const source = fileURLToPath(new URL('../..', import.meta.url));
const secret = () => 'github_' + 'pat_' + 'A1b2'.repeat(12);
const zeros = '0'.repeat(40);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'publication-'));
  const repo = join(root, 'work'), remote = join(root, 'remote.git');
  mkdirSync(repo);
  git(['init', '--initial-branch=main'], repo);
  git(['config', 'user.name', 'Fictional'], repo);
  git(['config', 'user.email', '1+fictional@users.noreply.github.com'], repo);
  mkdirSync(join(repo, 'scripts/publication'), { recursive: true });
  mkdirSync(join(repo, '.githooks'));
  for (const file of ['rules.ts', 'git.mjs', 'pre-push.mjs', 'metadata.mjs']) copyFileSync(join(source, 'scripts/publication', file), join(repo, 'scripts/publication', file));
  copyFileSync(join(source, '.githooks/pre-push'), join(repo, '.githooks/pre-push'));
  writeFileSync(join(repo, 'README.md'), 'Independent fictional test repository.\n');
  git(['add', '.'], repo); git(['commit', '-m', 'docs: initial fixture'], repo);
  git(['init', '--bare', '--initial-branch=main', remote], root);
  git(['remote', 'add', 'origin', remote], repo);
  const run = args => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  return { root, repo, remote, run, head: () => git(['rev-parse', 'HEAD'], repo).trim(),
    close: () => rmSync(root, { recursive: true, force: true }) };
}

test('detects credential families, key headers, URL passwords and long credential assignments without quoting values', () => {
  const values = [secret(), 'ghp' + '_' + 'a'.repeat(36), 'sk-' + 'proj-' + 'b'.repeat(30),
    'ya29' + '.' + 'c'.repeat(30), '1/' + '/' + 'd'.repeat(40), 'AK' + 'IA' + 'E'.repeat(16),
    '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----', '-----BEGIN ' + 'PGP PRIVATE KEY BLOCK-----',
    'https://' + 'reader:password@invalid.example', 'client_secret=' + 'q7'.repeat(15),
    '"password": "' + 'g8'.repeat(15) + '"'];
  for (const value of values) {
    assert.throws(() => assertSafeText(value), error => error instanceof PublicationFinding && !error.message.includes(value));
    assert.throws(() => assertSafeText(value)); // No stateful-regex alternation between calls.
  }
  for (const value of ['const accessToken = process.env.EXAMPLE_ACCESS_TOKEN;', 'API_KEY=${EXAMPLE_KEY}', 'password: null', 'Independent fictional prose.']) assertSafeText(value);
  assert.throws(() => assertSafeMetadata('/atsudori-' + 'band-rating/'), PublicationFinding);
});

test('commit identities require a noreply author even for GitHub-committed machine-account commits', () => {
  const header = (author, committer) => 'tree ' + 'a'.repeat(40) + '\nauthor ' + author + '\ncommitter ' + committer + '\n';
  const stamp = ' 1700000000 +0900';
  const noreply = 'Fictional <1+fictional@users.noreply.github.com>' + stamp;
  const github = 'GitHub <noreply@github.com>' + stamp;
  const machineNoreply = 'morimori36-muse <2+morimori36-muse@users.noreply.github.com>' + stamp;
  const machinePersonal = 'morimori36-muse <machine@invalid.example>' + stamp;
  assertCommitIdentity(header(noreply, noreply));
  assertCommitIdentity(header(noreply, github));
  assertCommitIdentity(header(machineNoreply, github));
  assert.throws(() => assertCommitIdentity(header(machinePersonal, github)), PublicationFinding);
  assert.throws(() => assertCommitIdentity(header(machinePersonal, noreply)), PublicationFinding);
  assert.throws(() => assertCommitIdentity(header('Someone <someone@invalid.example>' + stamp, github)), PublicationFinding); // Not the machine account.
  assert.throws(() => assertCommitIdentity(header(noreply, 'Someone <someone@invalid.example>' + stamp)), PublicationFinding);
});

test('public-history audit identity check rejects a personal machine-account email', () => {
  const noreply = '2+morimori36-muse@users.noreply.github.com';
  const historical = '3890f87c224fd6aead504bd6b00ecd849ca71110';
  assert.equal(isSafeCommitIdentity(noreply, 'GitHub', 'noreply@github.com'), true);
  assert.equal(isSafeCommitIdentity('machine@invalid.example', 'GitHub', 'noreply@github.com'), false);
  assert.equal(isSafeCommitIdentity('muse95965@gmail.com', 'GitHub', 'noreply@github.com', historical), true);
  assert.equal(isSafeCommitIdentity('muse95965@gmail.com', 'GitHub', 'noreply@github.com', 'a'.repeat(40)), false);
  assert.equal(isSafeCommitIdentity('other@invalid.example', 'GitHub', 'noreply@github.com', historical), false);
  assert.equal(isSafeCommitIdentity('muse95965@gmail.com', 'Someone', 'someone@invalid.example', historical), false);
});

test('a real local push passes with the hook installed; no-op and deletion updates publish no new objects', () => {
  const f = fixture();
  try {
    installHooks(f.repo); installHooks(f.repo);
    const result = f.run(['push', 'origin', 'HEAD:refs/heads/main']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(['rev-parse', 'refs/heads/main'], f.remote).trim(), f.head());
    assert.equal(scanUpdates('', f.repo), 0);
    assert.equal(scanUpdates('(delete) ' + zeros + ' refs/heads/main ' + f.head(), f.repo), 0);
  } finally { f.close(); }
});

test('a credential removed from the tip still blocks transport, preserving the remote ref and redacting output', () => {
  const f = fixture();
  try {
    installHooks(f.repo); assert.equal(f.run(['push', 'origin', 'HEAD:refs/heads/main']).status, 0);
    const before = f.head(), value = secret();
    writeFileSync(join(f.repo, 'temporary.txt'), value);
    git(['add', '.'], f.repo); git(['commit', '-m', 'test: add temporary file'], f.repo);
    git(['rm', 'temporary.txt'], f.repo); git(['commit', '-m', 'test: remove temporary file'], f.repo);
    const result = f.run(['push', 'origin', 'HEAD:refs/heads/main']);
    assert.notEqual(result.status, 0);
    assert.equal(git(['rev-parse', 'refs/heads/main'], f.remote).trim(), before);
    assert.ok(!(result.stdout + result.stderr).includes(value));
    assert.match(result.stderr, /Publication check blocked/);
  } finally { f.close(); }
});

test('outgoing ref names and commit messages are checked independently of file contents', () => {
  const f = fixture();
  try {
    installHooks(f.repo); const value = secret();
    const result = f.run(['push', 'origin', 'HEAD:refs/heads/' + value]);
    assert.notEqual(result.status, 0);
    assert.ok(!(result.stdout + result.stderr).includes(value));
    const message = join(f.root, 'message'); writeFileSync(message, 'docs: ordinary title\n\n' + value);
    git(['commit', '--allow-empty', '-F', message], f.repo);
    assert.throws(() => scanHistory([f.head()], { cwd: f.repo }), PublicationFinding);
  } finally { f.close(); }
});

test('annotated tag messages and multi-ref pushes are checked before any remote ref changes', () => {
  const f = fixture();
  try {
    installHooks(f.repo);
    const message = join(f.root, 'tag-message'); writeFileSync(message, secret());
    git(['tag', '-a', 'review', '-F', message], f.repo);
    const result = f.run(['push', 'origin', 'main', 'refs/tags/review']);
    assert.notEqual(result.status, 0);
    assert.equal(git(['for-each-ref', '--format=%(objectname)'], f.remote).trim(), '');
    assert.ok(!(result.stdout + result.stderr).includes(secret()));
  } finally { f.close(); }
});

test('tree entries are checked even when identical blob contents have another harmless name', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.repo, 'a-safe-name'), 'same harmless contents');
    writeFileSync(join(f.repo, secret()), 'same harmless contents');
    git(['add', '.'], f.repo); git(['commit', '-m', 'test: duplicate contents'], f.repo);
    assert.throws(() => scanHistory([f.head()], { cwd: f.repo }), PublicationFinding);
  } finally { f.close(); }
});

test('local replacement refs cannot substitute a clean commit for outgoing bytes', () => {
  const f = fixture();
  try {
    const clean = f.head(); writeFileSync(join(f.repo, 'temporary.txt'), secret());
    git(['add', '.'], f.repo); git(['commit', '-m', 'test: outgoing bytes'], f.repo);
    const outgoing = f.head(); git(['replace', outgoing, clean], f.repo);
    assert.throws(() => scanHistory([outgoing], { cwd: f.repo }), PublicationFinding);
  } finally { f.close(); }
});

test('PR event data is treated as data, with branch, title and body all inspected', () => {
  const f = fixture();
  try {
    const data = { branch: 'feature/review', title: 'docs: review', body: '', head: f.head() };
    for (const field of ['branch', 'title', 'body']) assert.throws(() => checkMetadata({ ...data, [field]: secret() }, f.repo), PublicationFinding);
    const marker = join(f.root, 'must-not-exist');
    const payload = { pull_request: { head: { ref: data.branch, sha: f.head() }, base: { sha: f.head() },
      title: '$(touch ' + marker + ')', body: '`not a command`\n${not_an_expression}' } };
    const file = join(f.root, 'event.json'); writeFileSync(file, JSON.stringify(payload));
    const result = spawnSync(process.execPath, ['scripts/publication/metadata.mjs', '--event'], {
      cwd: f.repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: file },
    });
    assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(marker), false);
    assert.equal(eventMetadata(payload, 'pull_request').title, payload.pull_request.title);
    assert.throws(() => checkMetadata({ ...data, head: '--invalid-option' }, f.repo));
  } finally { f.close(); }
});

test('unknown objects, shallow history and malformed hook input fail closed without printing input', () => {
  const f = fixture();
  try {
    const clone = join(f.root, 'shallow'); git(['clone', '--depth=1', pathToFileURL(f.repo).href, clone], f.root);
    assert.throws(() => scanHistory([f.head()], { cwd: clone }));
    assert.throws(() => scanHistory(['f'.repeat(40)], { cwd: f.repo }));
    const result = spawnSync(process.execPath, ['scripts/publication/pre-push.mjs'], {
      cwd: f.repo, encoding: 'utf8', input: secret(),
    });
    assert.notEqual(result.status, 0); assert.ok(!result.stderr.includes(secret()));
    assert.match(result.stderr, /could not complete/);
  } finally { f.close(); }
});

test('installation refuses existing custom hooks or a configured alternative hooks directory', () => {
  const f = fixture();
  try {
    const file = join(f.repo, '.git/hooks/pre-commit'); writeFileSync(file, '# custom hook');
    assert.throws(() => installHooks(f.repo));
    const result = f.run(['config', '--get', 'core.hooksPath']); assert.equal(result.status, 1);
  } finally { f.close(); }
  const other = fixture();
  try {
    git(['config', 'core.hooksPath', 'custom-hooks'], other.repo);
    assert.throws(() => installHooks(other.repo));
    assert.equal(git(['config', '--get', 'core.hooksPath'], other.repo).trim(), 'custom-hooks');
  } finally { other.close(); }
});
