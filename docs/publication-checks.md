# push前とPRメタデータの公開検査

この検査は秘密情報の一部を早く検出する補助です。実装・データの由来、権利、独立性、公開可否の判断は[公開境界のレビュー](public-boundary-review.md)で行います。検査成功は内容レビューやマージ・配信の承認を兼ねません。

## ローカルで最初に行うこと

Node.js 24.5以降とGitを使い、cloneごとに次を実行します。依存追加やネットワーク接続はありません。

```sh
npm run hooks:install
npm run audit:push
```

`hooks:install`はこのcheckoutのGit設定で`core.hooksPath=.githooks`を指定します。既存の別hookディレクトリや既定ディレクトリの独自hookを見つけた場合は拒否し、上書きしません。同じ設定への再実行は可能です。worktreeを使う場合、`--local`設定は共通リポジトリの他worktreeにも適用され得るため、各worktreeでこのhookが利用できることを確認してください。IDEからのpushでもNodeとGitを実行できる必要があります。

Gitの`pre-push`は送信予定の全refを読み、削除以外の各refから到達できるcommit・tag・tree・blobを検査します。新しいremoteやforce-pushでもremoteの旧SHAとの差分だけには依存しません。最新のファイルから消えていても履歴に残る値、注釈付きタグの本文、ローカル・送信先のref名、作者・committer・taggerのnoreply方針を確認します。例外は、GitHub自身がcommitterとなるPR検証用マージコミットに限ります。その作者にはPR作成者が記録されるため、承認済みの作成者であるマシンアカウント（morimori36-muse）の作者名だけを追加で許可します。読み取り失敗、shallow checkout、上限を超える出力等で完了できなければpushを止めます。refの削除と送信対象なしは新しいオブジェクトを公開しないため除外します。

`audit:push`は現在のHEADと現在のブランチ名を手動で確認するコマンドです。複数ref・送信先の別名を含む実際のpushではhookが改めて全対象を検査します。未コミット・未追跡ファイルはGitの送信対象ではなく、この検査には含みません。通常の作業ファイル・全履歴・配信物の検査には従来どおり最新buildの`audit:public`を使ってください。

## PRを作成・編集する前

公開予定の情報をGit対象外の`.cache/pr-metadata.json`へ保存し、送信前に検査できます。次のSHAは実際の完全SHAへ置き換え、bodyには予定する本文全体を入れます。

```json
{
  "branch": "feature/example",
  "title": "docs: clarify behavior",
  "body": "公開予定の本文",
  "base": "<比較元の完全SHA>",
  "head": "<提出する完全SHA>"
}
```

```sh
npm run audit:metadata -- --file .cache/pr-metadata.json
```

ブランチ名、タイトル、本文、baseからheadへ追加されるcommit・tagのメタデータを確認します。入力はJSONとして読み、シェル式・コマンドとして実行しません。検出した値やGitのエラー全文は出力しません。不正な入力形式・不正なSHA・欠落した履歴で検査を完了できない場合も失敗します。

GitHubでは既存の`Verify and Pages`のverify内でイベントJSONを読み、PRの新規作成・更新・再オープンに加えてタイトル／本文等の編集時にも検査します。別の必須チェック設定を前提にせず、同じverifyへ組み込んでいるため、メタデータ編集でも既存の検証全体が再実行されます。レビュー結果をPR本文へ追記するときもこの再実行を考慮してください。pushイベントではrefと追加commit、手動実行では対象refと到達可能なメタデータを確認します。過去のPR本文・コメント・添付物を収集する機能ではありません。

## 検出できる範囲と限界

共有ルールは既知のtoken接頭辞、秘密鍵ヘッダー、資格情報付きURL、長い資格情報代入等を検索します。`audit:public`にも同じ資格情報ルールを適用します。検出値は表示せず固定したルール名だけを示すため、元資料をCIへ転載して調査しないでください。誤検知もあり得るので、検出箇所と由来をローカルで調べ、テストや例には完全なtoken形状を直接記録しないでください。

- 未知の形式、短いパスワード、分割・難読化・圧縮・暗号化・画像等の中身をすべて検出する保証はありません。実データの改名や固有形式の埋込み、コード・素材の権利、必要な権利表示は機械検索だけで判断できません。
- ローカルhookはcloneだけでは有効にならず、未導入・無効化・回避が可能です。hook実行時点でremoteへ接続済みの場合もあり、ネットワーク接続自体を禁止する機能ではありません。
- Web UI、API、hookを経由しない別環境での送信にはローカル検査が作用しません。PRやCIで検出した時点では既に情報がGitHubへ送信されています。CIは漏えい前の阻止を保証しません。
- GitHub側のsecret scanningとpush protectionは、利用可能な範囲で組み合わせます。所有者はSettings → Code securityで状態・対象・例外を確認してください。この変更はGitHub設定を変更せず、APIから状態を取得できなかったため有効とは報告しません。これらも任意の情報・権利・公開可否を保証するものではありません。

送信済みの秘密情報を見つけた場合は、再実行で成功させる前に該当する資格情報を失効・更新し、公開範囲を調べます。ファイル削除や検査通過だけでは過去の露出は解消しません。履歴書換え・force-push等は既存の所有者承認条件に従います。一般的な手順は[GitHubのpush protection](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection)を参照してください。

検査の回帰は`npm run test:publication`で実行します。完全に架空の一時Gitリポジトリとローカルbare remoteだけを使い、正常push、履歴内の検出、ref・commit・tag、複数ref、改変入力、未完了検査、出力の非表示、既存hookの保持を確認します。
