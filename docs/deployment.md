# GitHub Pagesの自動デプロイ

公開URLは https://morimori36.github.io/atsudori-tools/ です。Vite、ブラウザテスト、CIはいずれも`/atsudori-tools/`を基準にしています。マスタ・所持・実ランク定義は配信ファイルへ入りません。

所有者の指示により、Publicリポジトリのmainへのpush後、すべての検証が成功した場合にPagesへ自動デプロイします。PRをmainへSquash Mergeした場合も同じです。PRブランチでは検証だけを行います。

## 実行条件

artifactのアップロードとdeployジョブには同じ条件を設定しています。

- リポジトリがPublic（`repository.private == false`）
- 対象が`refs/heads/main`
- `push`イベント、または`deploy=true`を指定した`workflow_dispatch`

型検査・単体・Schema再生成一致・Chromium/WebKitのブラウザ検証・公開境界監査の後にartifactをアップロードし、`needs: verify`のdeployジョブで配信します。検証に失敗した場合はデプロイしません。

従来の`PAGES_PUBLICATION_APPROVED`変数は配信条件に使いません。初回公開時の毎回の手動承認から、検証済みmainの自動配信へ移行したためです。PrivateリポジトリやPRからの配信は実行しません。

## 手動実行と確認

[Actions](https://github.com/morimori36/atsudori-tools/actions)の「Verify and Pages」をmainでRun workflowすると再検証できます。`deploy`の既定値はfalseで、チェックすると検証成功後に再デプロイします。通常のマージでは手動実行は不要です。

実行結果のverifyとdeployがともにsuccessであることを確認します。Settings → Environments → github-pagesの履歴でも配信commitを確認できます。配信を止める場合はActionsのワークフローを無効にするかPages設定を変更してください。旧承認変数をfalseへ戻しても停止しません。

## 設定と公開境界

[Settings → Pages](https://github.com/morimori36/atsudori-tools/settings/pages)のSourceはGitHub Actionsを使用します。github-pages環境の配信ブランチはmainに制限します。環境にrequired reviewersを追加すると、GitHub側の手動承認待ちが発生します。

初回のPublic化・本番公開、公開範囲や権利・ライセンス方針の変更、履歴書換え・force-pushには所有者の明示的な承認が必要です。検証済みmainの継続的な自動配信は承認済みです。自作コードは当面All rights reservedとし、必要な第三者の権利表示を保持します。

GitHub Flowで機能ブランチ→PR→Squash Mergeを使用します。mainのruleset/branch protectionは利用可能な範囲でPR必須・verify成功必須・force-push禁止にします。Actionsの既定権限はcontents:read、deployジョブだけpages:write/id-token:writeです。Private資料を公開CIへ持ち込まず、実データを同梱しません。

移行前にはマスタ（ランク定義を含む）・所持・周回プラン・変換プロファイルをExportしてください。サイト更新で保存内容を送信・上書きする処理はありません。

GitHubの公式手順：[custom workflows](https://github.com/actions/deploy-pages)。
