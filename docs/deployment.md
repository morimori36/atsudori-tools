# 公開準備とGitHub Pages

予定URLは https://morimori36.github.io/atsudori-tools/ です。Vite、ブラウザテスト、CIはいずれも/atsudori-tools/を基準にしています。マスタも所持も配信ファイルへ入りません。

現在はPrivateで検証のみを行います。Public化と本番デプロイの両方に所有者の明示的な承認が必要です。Private期間は承認変数や手動入力があってもdeployを実行しません。Publicへ変えるだけでもdeployしません。

workflowのdeploy条件:
- repository.private=false
- main
- pull_request以外
- repository variable PAGES_PUBLICATION_APPROVED=true
- deploy=trueの手動実行（既定false）

Pages用artifactのアップロードにも同じ条件を適用します。通常のPrivate/PR検証はbuild・ブラウザテスト・監査だけです。Privateの実データ回帰をActionsへ持ち込まないでください。

## 所有者が承認後に行う操作

1. 自作コードは当面、ライセンスなし（All rights reserved）とし、MIT等のLICENSEファイルを追加しません。GitHubでのPublic化にLICENSEの設定は必須ではありません。第三者ライブラリ・素材のライセンスと権利表示は引き続き遵守し、必要な権利・商標・利用条件を確認します。公開する現在ファイル・全Git履歴・配信artifactの監査と指定テスト・E2Eがすべて成功するまでは、Public化もPagesデプロイも行いません。
2. Public化への明示的な承認後に、[Settings → General](https://github.com/morimori36/atsudori-tools/settings)のDanger Zoneで公開範囲を変更します。この操作を本番配信の承認と兼用しません。
3. mainのCIが成功したことを確認します。GitHub Pagesの契約・利用可否も設定画面で確認してください。
4. [Settings → Pages](https://github.com/morimori36/atsudori-tools/settings/pages)でBuild and deploymentのSourceをGitHub Actionsにします。workflowによる管理APIの強制有効化や追加管理tokenは使いません。
5. Settings → Environmentsのgithub-pagesをmainだけに制限し、利用可能ならrequired reviewersに所有者を設定します。
6. 本番公開への明示的な承認後にだけ、[Actions variables](https://github.com/morimori36/atsudori-tools/settings/variables/actions)へPAGES_PUBLICATION_APPROVED=trueを設定します。
7. mainで[Verify and gated Pages](https://github.com/morimori36/atsudori-tools/actions)をRun workflowし、deploy=trueを明示します。成功したenvironment URLを確認します。
8. 公開した/atsudori-tools/で空起動、JSON操作、静的アセット、権利表示を確認します。実マスタや個人所持をテストのために公開しないでください。

mainへのpushでは検証だけを実行します。本番配信は毎回deploy=trueの手動実行を必要とします。配信後は承認変数をfalseへ戻し、意図しない手動配信も防いでください。

## 開発運用

初期構築以降はGitHub Flowで機能ブランチ→PR→Squash Mergeを使用します。Settings → GeneralでSquash Mergeを選び、他のmerge方式は不要なら無効にします。PRでは検証だけを実行します。

mainのruleset/branch protectionは、契約で利用できる範囲でPR必須・verify成功必須・force-push禁止にします。初期構築では不要なbotや追加管理secretを導入しません。

Actionsの既定権限はcontents:readです。deploy jobだけpages:write/id-token:writeを持ちます。依存の取得は公開npmと検証用Chromium・WebKitに限り、ゲームデータを取得するstepはありません。CI成果物を手動で追加する場合にも、所持ファイル・Private回帰資料・テストtraceを同梱しないでください。

GitHubの公式手順: [custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。利用プランで使える機能が異なるため、管理権限不足や利用不可があれば迂回せず所有者が設定します。

移行時はキャラクターランク定義JSONもExportし、移行先へ独立してImportしてください。実定義をリポジトリやCI・配信artifactへ追加しません。
