# atsudori-tools

アツドリのバンド評価値とイベント周回計画を計算する、非公式の静的Webアプリです。メニューから評価値計算機とイベント周回プランナーを切り替えられます。ゲーム運営・開発元とは関係ありません。総合力の計算や編成最適化は対象外です。

**カード等のマスターデータは同梱していません。** ランク推定用のミッション条件・報酬・累積EXPも同梱しません。 利用する権利のあるマスタJSONをImportしてください。外部サービスからの自動取得、ログイン、サーバー、サーバー側DBはありません。マスタがなくても起動し、表示値で個別計算できます。

公開URL: https://morimori36.github.io/atsudori-tools/ （mainへのマージ後、検証成功時に自動デプロイ）

使い方:
1. 「JSON Import / Export」でcatalog JSONをImportします。ランク定義と総合ランクボーナス表もcatalogに含めます。不足は明示され、計算を保留します。
2. 「メンバー」「Snap」で所持を切り替え、育成段階を設定します。編集時のLvは段階ごとの上限に連動します。Importした任意の合法Lvは読込だけでは変えません。
3. 「ランク・アイテム」で進捗・アイテムを登録します。ランクはランク定義を含むcatalogのImport後に所持・育成から推定し、任意の手入力で上書きできます。総合ランクボーナスは対応する外部ボーナス表から算出するか、画面の加算値を手入力します。旧定義に表がなければボーナスを設定するまで評価値は保留します。未入力進捗は加算せず、未設定アイテムは未知として扱います。
4. 「評価値」でバンド→色→キャラクター→メンバーの内訳を確認します。「現在／仮育成」は表示用の切替で、所持を変更しません。
5. マスタと所持JSONはそれぞれExportしてバックアップできます。保存先はこのブラウザ内です。破損データは明示的な復旧操作まで上書きしません。
6. 「JSON Import / Export」で変換プロファイルを登録すると、その定義に沿ったJSONを生成できます。評価値と共通の仮育成設定を任意で適用できます（初期OFF）。[変換プロファイルの仕様](docs/profile-export.md)を参照してください。

「表示値で計算」はP/T/Vと補正値を直接入力する、所持とは独立した経路です。評価値計算機の画面例・テストは完全な架空データです。

「イベント周回プランナー」はマスタ登録なしで利用できます。通常・チャレンジ候補を各5件まで入力し、目標ptまでの最小周回数と上位10ペア、全ペアを比較します。1計画で使う候補は通常・チャレンジ各1種類です。CP内訳・推定時間・探索済み範囲も表示します。条件とランク基準は専用のブラウザ保存とJSON Import / Exportで管理します。[計算・入力と制約](docs/event-planner.md)を参照してください。

Node.js 24.5以降:

```sh
npm ci
npm run dev
npm run check
npx playwright install --only-shell chromium
npm run test:e2e
npm run audit:public
```

開発URLは http://localhost:5173/atsudori-tools/ 、buildは `npm run build`、静的確認は `npm run preview` です。Windowsでは `start-local.cmd` も使えます。npmキャッシュは `.cache/npm` です。

プロファイル出力のSafariエンジン向け追加検証は、`npx playwright install webkit`後に`npm run test:e2e:webkit`を実行できます。iPhone相当のWebKitエミュレーションで、実機Safariの検証とは区別します。

- [JSONインポート仕様](docs/import-format.md) / [catalog Schema](public/schemas/catalog-v1.schema.json) / [collection Schema](public/schemas/collection-v1.schema.json)
- [計算・選出と検証の限界](docs/calculation.md) / [架空データの期待値とテスト](docs/testing.md)
- [catalog内のランク定義・推定と未算出時の扱い](docs/character-rank.md)
- [変換プロファイルによるJSON出力](docs/profile-export.md)
- [イベント周回プランナー](docs/event-planner.md) / [周回プランJSON Schema](public/schemas/event-planner-v1.schema.json)
- [公開手順](docs/deployment.md) / [公開データの範囲](docs/separation.md) / [非公開回帰の実行](docs/private-regression.md)
- [開発参加](CONTRIBUTING.md) / [権利表示](THIRD_PARTY_NOTICES.md)

推定式と暫定の選出方針を含み、ゲーム内結果との一致を保証しません。未観測の育成範囲、同レアリティの内部順位、複数代替Snapの割当手順は未検証です。入力・算出結果の利用は利用者自身で確認してください。

自作コードは当面、オープンソースライセンスを付与しない方針です（All rights reserved）。MIT等のLICENSEファイルは追加せず、再利用許諾は設定していません。第三者ライブラリ・素材のライセンスと権利表示は引き続き遵守します。詳細は権利表示を参照してください。

静的なカード・育成・ランク・ボーナス表はcatalog、動的な所持・進捗・手入力上書きはcollectionで管理します。ランク定義を含むマスタJSONを「JSON Import / Export」で取り込み、マスタと所持の2ファイルで移行できます。実際の定義・表は初期状態や配信物に含めません。

初期化は「JSON Import / Export」最下部の「データの初期化」を開いて実行します。所持・育成情報とマスタ（ランク定義を含む）は別々に初期化します。確認ダイアログが表示され、所持参照が残るマスタ初期化は拒否されます。必要なJSONをExportし、先に所持・育成データを初期化してください。変換プロファイル・共通仮育成設定・イベントプランナーの保存内容は初期化対象外です。
