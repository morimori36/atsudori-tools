# catalog内のランク定義と推定

カード・育成・ランク推定・総合ランクボーナス表は静的なcatalogにまとめます。所持・育成状態・手入力進捗・ランク上書き・ボーナス上書きは動的なcollectionです。通常の移行・バックアップはこの2ファイルで行います。実際のミッション・閾値・EXP・ラベル・ボーナス表は同梱せず、利用者がImportしたcatalogからのみ読みます。

## catalog.rankDefinition

catalog v1への任意項目の追加です。旧catalogも読み込めます。未登録のときはプロパティを省略し、未知の定義を補完しません。新しい任意項目を含むcatalogは旧アプリでは読み込めません。必須項目の削除や意味の置換はありません。

| 項目 | 内容 |
| --- | --- |
| engine | achievement-thresholds/1 |
| id / version | 定義の識別子と版（1〜200文字） |
| provenance.sources | 出典のid・revision・sha256。空でない配列、重複不可、最大100件 |
| manualProgress | 手入力進捗のkeyとlabel。対応キーのみ、重複不可 |
| achievements | 達成条件のid・kind・label・stage・thresholds・exp |
| rankThresholds | 累積EXPとランクの対応。rank・expの配列 |
| totalRankBonuses（任意） | 総合ランクの閾値rankと各パラメータへのbonusの配列 |

旧ファイルのformat・schemaVersion・catalog参照は内包しません。対応するカード・育成表と同じcatalogで検証するため、内部にcatalogのハッシュを重複保存しません。[catalog Schema](../public/schemas/catalog-v1.schema.json)は構造、アプリは参照と演算上限も検証します。定義は新しい独立ファイルや保存キーに分けず、catalogと一緒にImport・Export・保存します。

## 達成条件と未算出

kindはmembers / snaps / training / awakening / snapRank / skills / stamps / songClears / bondRankTotal / liveClearsです。stageは段階条件だけに指定し、対象外はnullです。thresholdsは正整数の厳密な昇順、expは正整数。同一id、同じkindとstage、手入力キー、出典idの重複を拒否します。手入力ラベルと達成条件の対応も必要です。

累積EXPは先頭のexpが0、以後rankとexpとも厳密な昇順です。catalogの合法ランク・育成・スキル段階に対応することを確認します。達成した閾値の報酬を一度ずつ合計し、到達した最大のランクを使います。未入力進捗は加算せず不明として保持します。推定は現在の所持・進捗から行い、受取履歴を推測しません。

手入力ランクがあれば優先します。定義未登録なら推定を行わず、EXP0や初期ランクで埋めません。旧スキル進捗は互換用に保持し、自動集計へ重複加算しません。現在のcatalogに対応行がない手入力も保存・Exportでは保持し、計算時に不足を示します。「仮育成」や出力時の仮育成でもランクは現在の所持から求めます。

## 総合ランクボーナス

表はcatalog.rankDefinition.totalRankBonusesに置きます。総合ランクの閾値rankは0以上の安全な整数、厳密な昇順。bonusは各P/T/Vへの加算値で、0以上の安全な整数、非減少です。空配列・重複・降順を拒否します。全キャラの現在ランク合計以下の最大閾値を参照します。表をコード内の式へ置換しません。

collection.totalRankBonusの明示的な手入力があれば優先し、0も有効です。空欄で保存すると上書きを削除します。表・対応閾値・ランク合計が欠ける場合は評価値を保留します。個人ランク分を含む合計ボーナスと区別してください。

## 旧形式からの統合

旧catalogと別のcharacter-rank-rules v1を使っている場合は、catalogを登録して「手動メンテナンス」の「旧形式のランク定義を統合」でファイルを選びます。旧定義のcatalogId・revision・ハッシュを元のcatalog表と照合し、正常ならrankDefinitionを追加してcatalog全体を即保存・反映します。既に内包した定義があれば置き換わります。

ブラウザの旧保存キーatsudori-tools.character-rank-rules.v1は読み取り専用の移行元です。適合する旧保存定義があれば確認ボタンを提示します。読込だけでは保存内容を変えません。壊れた旧定義も元文字列をExportでき、統合で旧キーやcollectionを書き換え・削除しません。保存に失敗した場合はエラーを表示し、既存のcatalogを維持します。

統合後はcatalogが唯一の定義元です。旧保存定義が残っていても、内包された定義を上書きしたり別の定義として使用したりしません。マスタの置き換えはrankDefinitionも含む全置換で、定義なしのファイルも検証後に即反映します。未登録の場合は推定を停止し、手動メンテナンスに状態を表示します。

## 生成器が出力する形式

既存catalogのルートに、上表のrankDefinitionオブジェクトを追加してください。総合ランク表はそのtotalRankBonusesです。旧ファイルをそのままネストせず、format・schemaVersion・catalogを除いた静的な定義本体を内包します。動的なcharacterProgressやcharacterRanksをここへ入れないでください。
