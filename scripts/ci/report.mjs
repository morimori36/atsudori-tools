import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const count = value => Number.isSafeInteger(value) && value >= 0;
const totals = () => ({ passed: 0, failed: 0, intentional: 0, environment: 0, unexpected: 0, todo: 0, flaky: 0 });

/** Reduce reports to numbers and registered reasons. Never render test names, paths or errors. */
export function vitestCounts(report, classify = () => null) {
  if (!Array.isArray(report?.testResults) || !count(report.numTotalTests)) throw Error('Invalid test report');
  const result = { ...totals(), reasons: new Map() };
  for (const suite of report.testResults) {
    if (!Array.isArray(suite.assertionResults)) throw Error('Invalid suite report');
    for (const test of suite.assertionResults) {
      if (test.status === 'passed' || test.status === 'failed') result[test.status]++;
      else if (test.status === 'todo') result.todo++;
      else if (test.status === 'pending') result.unexpected++;
      else if (['skipped', 'disabled'].includes(test.status)) {
        const reason = classify(suite.name, test.fullName);
        const kind = ['intentional', 'environment'].includes(reason?.kind) ? reason.kind : 'unexpected';
        result[kind]++;
        if (kind !== 'unexpected') result.reasons.set(reason.label, (result.reasons.get(reason.label) ?? 0) + 1);
      } else throw Error('Unknown test status');
    }
  }
  if (result.passed + result.failed + result.intentional + result.environment + result.unexpected + result.todo !== report.numTotalTests)
    throw Error('Inconsistent test count');
  return result;
}

export function playwrightCounts(report) {
  if (!Array.isArray(report?.suites) || !report.stats || !Array.isArray(report.errors)) throw Error('Invalid browser report');
  const result = { ...totals(), reasons: new Map() };
  const visit = suite => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      if (test.status === 'expected') result.passed++;
      else if (test.status === 'flaky') { result.passed++; result.flaky++; }
      else if (test.status === 'unexpected') result.failed++;
      else if (test.status === 'skipped') result.unexpected++;
      else throw Error('Unknown browser status');
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  report.suites.forEach(visit);
  if (!['expected', 'unexpected', 'skipped', 'flaky'].every(key => count(report.stats[key]))
    || result.passed !== report.stats.expected + report.stats.flaky
    || result.failed !== report.stats.unexpected || result.unexpected !== report.stats.skipped) throw Error('Inconsistent browser count');
  // Setup/global errors can fail a run with no failed test cases; preserve that distinction.
  result.globalErrors = report.errors.length;
  return result;
}

export function readCounts(path, kind, classify) {
  try {
    const report = JSON.parse(readFileSync(path, 'utf8'));
    return { counts: kind === 'playwright' ? playwrightCounts(report) : vitestCounts(report, classify) };
  } catch { return { unavailable: true }; }
}

export function commitAt(directory = '.') {
  try {
    const value = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[a-f0-9]{40}$/.test(value) ? value : '取得不可';
  } catch { return '取得不可'; }
}

export const safeSha = value => /^[a-f0-9]{40}$/.test(value ?? '') ? value : '取得不可';

export function renderSummary({ metadata, stages, outcomes, excluded = [] }) {
  const lines = ['## 検証範囲', '', ...metadata.map(([label, value]) => `- ${label}: ${value}`), '',
    '| 検証 | ステップ結果 | 成功 | 失敗 | 意図的skip | 環境skip | 想定外skip/pending | todo | 再試行で成功 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  const details = [];
  for (const stage of stages) {
    const outcome = outcomes[stage.id];
    const status = { success: '成功', failure: '失敗', cancelled: '中断', skipped: '未実行' }[outcome] ?? '未実行／結果未取得';
    // Ignore any stale report when the stage did not execute.
    const executed = ['success', 'failure', 'cancelled'].includes(outcome);
    const data = executed && stage.report ? readCounts(stage.report, stage.kind, stage.classify) : null;
    const c = data?.counts;
    lines.push(`| ${stage.label} | ${status} | ${c ? [c.passed, c.failed, c.intentional, c.environment, c.unexpected, c.todo, c.flaky].join(' | ') : '— | — | — | — | — | — | —'} |`);
    if (executed && stage.report && !c) details.push(`- ${stage.label}: レポート欠落・不正。件数とテスト実施範囲は不明（0件成功ではない）。`);
    if (executed && !stage.report) details.push(`- ${stage.label}: ステップ結果のみ。テスト件数の集計対象外。`);
    if (c) {
      for (const [reason, n] of c.reasons) details.push(`- ${stage.label}: ${reason} = ${n}件。`);
      if (c.unexpected) details.push(`- ${stage.label}: 想定外skip/pending ${c.unexpected}件。理由未登録・実行条件不一致、または未完了pending。要確認。`);
      if (c.todo) details.push(`- ${stage.label}: todo ${c.todo}件。検証済みには含めない。`);
      if (!c.passed && !c.failed && !c.intentional && !c.environment && !c.unexpected && !c.todo) details.push(`- ${stage.label}: テスト0件。検証範囲の確認が必要。`);
      if (c.globalErrors) details.push(`- ${stage.label}: ブラウザ全体エラー ${c.globalErrors}件。ケース件数と区別する。`);
    }
  }
  lines.push('', ...details, '', '### この実行の対象外', '', ...excluded.map(text => `- ${text}`), '',
    '各行は別の実行単位。同じ検査の再実行・重複を含むため合算しない。件数はテストケース数であり、実機観測件数ではない。',
    '集計は既存の合否条件を変更しない。元のステップ結果と併せて確認する。', '');
  return lines.join('\n');
}

export function writeSummary(options) {
  const summary = renderSummary(options);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  else process.stdout.write(summary);
}
