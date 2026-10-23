# 非公開回帰と実装の一本化

Webアプリの実装はatsudori-toolsを正本とします。非公開の検証用リポジトリでは資料・原本・実測fixtureを保持し、このWeb実装の固定コミットを検証します。Web機能を複製して管理する運用はしません。

非公開側で必要な公開アプリのコミットを固定して別checkoutへ取得し、その実装へPrivateの資料をローカル入力します。公開アプリのCIへPrivateへの権限や秘密を渡す必要はありません。

```sh
git clone https://github.com/morimori36/atsudori-tools.git ../atsudori-tools-validation
cd ../atsudori-tools-validation
git checkout --detach <検証対象のコミットSHA>
npm ci
```

既存の空でないフォルダへcloneしないでください。新規checkoutまたは既存の専用検証checkoutを利用します。Public化前は認証済みの所有者がPrivateリポジトリを取得します。

PowerShellでローカルPrivateの場所を指定:

```powershell
$env:PRIVATE_REGRESSION_ROOT = 'C:\path\to\private-validation'
npm run test:private
$env:PRIVATE_DIAGNOSTICS = 'true'
npm run test:private
Remove-Item Env:PRIVATE_DIAGNOSTICS
Remove-Item Env:PRIVATE_REGRESSION_ROOT
```

通常はstrictの絶対値・差分と、育成条件のある表示値接続を検証します。PRIVATE_DIAGNOSTICS=trueでは仮定付き絶対値・差分だけを別実行し、検算用overrideを元入力へ適用したコピーで比較します。元のrawInputや仮定の区分は書き換えません。空のcohortはエラーにします。

private-tests/regression.test.tsは外部ファイルの構造だけを知る薄い検証アダプターです。実装はsrcの同じ関数をimportします。Privateの旧catalogメタデータを一時的な汎用catalogIdに付け替えて構造検証する処理は、このローカル検証に限定します。本番Importやデータ変換ツールへは流用しません。

資料の値・名前・入力・期待値はテスト名、失敗メッセージ、報告ファイルへ出しません。.cache/には検証した公開コミット・区分・件数だけを保存します。ネットワーク取得、外部送信、Privateファイルへの書込みはありません。通常CIからは呼びません。

Privateで検証手順や結果を記録するときは、公開コミットSHA・Private masterdata参照版・fixtureのSHA-256・strictと仮定付きの件数を分けて残してください。上流データを更新する変換機能はPrivate側で今後実装します。元の検証fixtureや観測期待値は移植のために書き換えません。
