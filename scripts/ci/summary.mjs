import { commitAt, safeSha, writeSummary } from './report.mjs';

try {
  writeSummary({
    metadata: [['checkout SHA', commitAt()], ['PR head SHA', safeSha(process.env.CI_PR_HEAD_SHA)]],
    outcomes: JSON.parse(process.env.CI_PHASE_OUTCOMES ?? '{}'),
    stages: [
      { id: 'metadata', label: '公開予定メタデータの機械検査' },
      { id: 'publication_tests', label: 'push前・メタデータ検査の回帰' },
      { id: 'summary_tests', label: '集計処理の回帰テスト' },
      { id: 'check', label: '型検査・単体回帰', report: '.cache/ci/unit.json' },
      { id: 'schemas', label: 'Schema同期' },
      { id: 'chromium', label: 'Chromium E2E（build含む）', report: '.cache/ci/chromium.json', kind: 'playwright' },
      { id: 'navigation', label: 'PRの空状態ナビゲーション撮影' },
      { id: 'navigation_artifact', label: 'PRの撮影artifact保存' },
      { id: 'webkit', label: 'WebKit E2E（build含む）', report: '.cache/ci/webkit.json', kind: 'playwright' },
      { id: 'audit', label: '公開境界の機械検査' },
    ],
    excluded: ['WebKitは設定で選んだテストのみ。実機Safariの検証ではない。',
      '外部の非公開回帰はこのCIへ入力しない。',
      'このverifyサマリーはPages配信完了を示さない。deployジョブを別途確認する。',
      '型検査やbuildが失敗すると後続テストのレポートは生成されない場合がある。'],
  });
} catch { console.error('Verification summary unavailable; inspect the original step outcomes.'); process.exitCode = 1; }
