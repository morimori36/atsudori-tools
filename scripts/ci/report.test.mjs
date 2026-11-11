import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { vitestCounts, playwrightCounts, readCounts, renderSummary, safeSha } from './report.mjs';

const report = statuses => ({ numTotalTests: statuses.length,
  testResults: [{ name: '/arbitrary/path.test.ts', assertionResults: statuses.map(status => ({ status, fullName: 'sensitive-report-marker' })) }] });
const browser = (statuses, errors = []) => ({ suites: [{ suites: [{ specs: statuses.map(status => ({ tests: [{ status, results: [{}, {}] }] })) }] }], errors,
  stats: Object.fromEntries(['expected', 'unexpected', 'skipped', 'flaky'].map(key => [key, statuses.filter(status => status === key).length])) });

test('separates pass/failure, registered skips, unknown skips and todo', () => {
  let calls = 0;
  const r = vitestCounts(report(['passed', 'failed', 'skipped', 'skipped', 'skipped', 'todo', 'pending']), () =>
    [{ kind: 'intentional', label: 'scheduled deferral' }, { kind: 'environment', label: 'missing prerequisite' }, null][calls++]);
  assert.deepEqual([r.passed, r.failed, r.intentional, r.environment, r.unexpected, r.todo], [1, 1, 1, 1, 2, 1]);
  assert.equal(r.reasons.size, 2);
});

test('does not accept new statuses, missing suites or inconsistent totals', () => {
  for (const r of [{}, report(['unknown']), { ...report(['passed']), numTotalTests: 0 }, { ...report([]), testResults: [{}] }])
    assert.throws(() => vitestCounts(r));
});

test('counts browser cases once and distinguishes retries and run-level errors', () => {
  const r = playwrightCounts(browser(['expected', 'flaky', 'unexpected', 'skipped'], [{ message: 'sensitive-report-marker' }]));
  assert.deepEqual([r.passed, r.failed, r.flaky, r.unexpected, r.globalErrors], [2, 1, 1, 1, 1]);
  assert.throws(() => playwrightCounts({ ...browser(['expected']), stats: {} }));
  assert.throws(() => playwrightCounts(browser(['unknown'])));
});

test('renders failures, unknown skips, missing reports and unexecuted stages without raw contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-summary-'));
  try {
    const file = join(dir, 'tests.json');
    writeFileSync(file, JSON.stringify({ ...report(['passed', 'failed', 'skipped', 'todo']), message: 'sensitive-report-marker' }));
    const text = renderSummary({ metadata: [['SHA', safeSha('not-a-sha')]], outcomes: { run: 'failure', omitted: 'skipped', missing: 'failure', cancelled: 'cancelled' },
      stages: [{ id: 'run', label: 'Executed', report: file }, { id: 'omitted', label: 'Omitted', report: file },
        { id: 'missing', label: 'Missing', report: join(dir, 'absent') }, { id: 'cancelled', label: 'Cancelled' }] });
    assert.match(text, /Executed \| 失敗 \| 1 \| 1 \| 0 \| 0 \| 1 \| 1/);
    assert.match(text, /Omitted \| 未実行 \| —/);
    assert.match(text, /レポート欠落・不正/);
    assert.match(text, /Cancelled \| 中断/);
    assert.match(text, /想定外skip\/pending 1件/);
    assert.doesNotMatch(text, /sensitive-report-marker|arbitrary\/path/);
    writeFileSync(file, '{malformed-sensitive-report-marker');
    assert.deepEqual(readCounts(file), { unavailable: true });
    assert.deepEqual(readCounts(join(dir, 'absent')), { unavailable: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('does not equate empty or missing reports to successful verification', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-empty-'));
  try {
    const file = join(dir, 'empty.json'); writeFileSync(file, JSON.stringify(report([])));
    const text = renderSummary({ metadata: [], outcomes: { empty: 'success', absent: 'success' }, stages: [
      { id: 'empty', label: 'Empty', report: file }, { id: 'absent', label: 'Absent', report: file + '.missing' },
      { id: 'unknown', label: 'Unknown', report: file },
    ] });
    assert.match(text, /テスト0件/);
    assert.match(text, /0件成功ではない/);
    assert.match(text, /Unknown \| 未実行／結果未取得 \| —/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the CLI reports summary failure without dumping malformed context', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/summary.mjs'], {
    encoding: 'utf8', env: { ...process.env, CI_PHASE_OUTCOMES: 'malformed-sensitive-report-marker' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Verification summary unavailable/);
  assert.doesNotMatch(result.stdout + result.stderr, /sensitive-report-marker/);
});
