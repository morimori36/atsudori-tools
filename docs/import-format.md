# JSONインポート仕様 v1

catalogは共通のカード・育成定義、collectionは利用者の所持・進行状態です。どちらもサービス非依存で、出典URLやGitコミットを要求しません。自動取得・変換・送信はしません。

イベント周回プランナーは別format・別保存キーです。この文書のcatalog/collectionとは独立した仕様です。[周回プランJSON仕様](event-planner.md#保存json)を参照してください。

JSON出力の変換プロファイルも別format・別保存キーです。[プロファイルの仕様と使い方](profile-export.md)、[構造Schema](../public/schemas/conversion-profile-v2.schema.json)を参照してください。catalog／collection v1は変更していません。

正確な構造は[Catalog JSON Schema](../public/schemas/catalog-v1.schema.json)と[Collection JSON Schema](../public/schemas/collection-v1.schema.json)、追加の意味検証はsrc/data/catalog/validate.tsとsrc/storage/collection.tsが定義します。Schemaは必要条件です。参照関係や連動条件は下記の意味検証も必要です。Schemaはnpm run schema:writeでフィールド定義から生成します。

共通ルール:
- formatと整数schemaVersionを必須にします。現在はversion 1だけに対応します。将来の版を黙って読まず、明示的な変換を必要とします。
- 不明なキー・必須キーの欠落・型不一致・負数・小数・安全でない整数を拒否します。文字列は1〜200文字で、空白だけは不可。name/titleも必須です。
- 数値はJavaScriptの安全な整数（最大9007199254740991）。ID・Lv・段階は正整数、パラメータ・率は0以上。ID文字列の先頭ゼロは不可です。危険なオブジェクトキーも拒否します。
- catalogIdとrevisionは英数字で開始する1〜80文字、以降は英数字・ピリオド・下線・ハイフン。実マスタを示す値をアプリが解釈することはありません。
- JSONファイルはUTF-8。catalogは10MiB、collectionは5MiBが上限です。Import失敗ではメモリ内の有効データも保存データも変更しません。
- catalogは各表20000行・全体50000行までです。配列型フィールドは空を不可とし10000要素まで。supportSkillLevelsだけは必ず2要素です。
- 文字列はHTMLではなくテキストとして表示します。ブラウザ外へ送信しません。

## catalog

最小の空ファイル:

```json
{
  "format": "atsudori-tools/catalog",
  "schemaVersion": 1,
  "catalogId": "my-catalog",
  "revision": "1",
  "bands": [],
  "characters": [],
  "members": [],
  "snaps": [],
  "characterRankLevels": [],
  "memberLevels": [],
  "memberTraining": [],
  "memberAwakening": [],
  "memberLevelLimits": [],
  "snapLevels": [],
  "snapRanks": [],
  "bandItems": [],
  "bandItemLevels": [],
  "bandItemEffects": [],
  "skillTargets": []
}
```

すべての表は省略不可。空catalogは正常な状態ですが、所持計算には必要な定義を登録します。手動で段階的に作成でき、作成途中の構造が正しいcatalogはローカル保存できます。不足・不整合を一覧にし、その間は所持表示・計算を止めます。Importでは構造に加えて参照・育成定義を検証し、不完全なcatalogは拒否します。途中のExportは保管用で、不足解消前の再Importはできません。

各行のフィールドはすべて必須、記載以外のキーは不可です。Statsはperformance/technic/visualの3つの非負整数です。

| 表 | フィールド | 複合キー |
| --- | --- | --- |
| bands | id, name | id |
| characters | id, bandId, name | id |
| members | id, characterId, cardType, rarity, name, title, maxStats: Stats, levelGroup, trainingGroup, awakeningGroup, liveSkillLevels: 整数配列, gekisouSkillLevels: 整数配列 | id |
| snaps | id, characterIds: 整数配列, cardType, rarity, name, title, maxPercentBp: Stats, levelGroup, rankGroup | id |
| characterRankLevels | 正整数の配列 | 値 |
| memberLevels | group, level, rates: Stats | group + level |
| memberTraining | group, stage, rates: Stats | group + stage |
| memberAwakening | group, stage, rates: Stats, leaderSkillLevel | group + stage |
| memberLevelLimits | rarity, trainingStage, limitLevel | rarity + trainingStage |
| snapLevels | group, level, rates: Stats | group + level |
| snapRanks | group, rank, limitLevel, supportSkillLevels: [正整数, 正整数] | group + rank |
| bandItems | id, bandId, name | id |
| bandItemLevels | itemId, level | itemId + level |
| bandItemEffects | itemId, level, effectType, valueBp, targetIds: 整数配列 | itemId + level |
| skillTargets | id, targetType, bandId, characterId, cardType, tagId | id |

skillTargetsのcharacterId/cardType/tagIdは0を許可します。その他のID・group等は正整数。率・max値・valueBpは非負整数です。各複合キーと整数配列の値は重複不可。ただしsupportSkillLevelsの同値2要素は連動を表すため許可します。

意味検証:
- キャラクター→バンド、カード→キャラクター、Snap→対応キャラクター、アイテム→バンド、効果→アイテムLv・効果対象が存在すること。
- カードが使うLv/特訓/覚醒groupに行があること。各特訓段階のrarity別上限と、その上限Lvの率が存在すること。
- memberAwakeningのleaderSkillLevelはstageと一致、snapRanksの両supportSkillLevelsはrankと一致すること。既存のA/Uとの連動が確認されていない別形態は拒否します。
- Snapのrankごとの上限LvがsnapLevelsに存在すること。
- メンバーが所属するバンドのアイテム定義が必要です。欠落を「補正なし」とは推測しません。アイテムの各合法Lvにちょうど1効果行を必要とします。
- 現在対応するアイテム効果はeffectType=1000、targetIdsは1件。対象はtargetType=3、同じbandId、characterId/cardType/tagId=0です。未知の効果を無視しません。
- valueBpは10の倍数（0.1%単位で表現可能）。複数所持アイテムの率を合算します。
- Lv・覚醒・Snapで使うmax×rateの積は2147483647以下かつ安全な整数。binary32を用いる既存実装の対応範囲を超える入力は拒否します。
- catalogのrevision更新は所持JSONを書き換えません。同じID体系でcatalogIdを固定し、revisionを更新してください。所持を不正にする変更は削除や補完をせず拒否します。

cardTypeは正整数の色IDとして比較・表示します。ゲーム由来の色名対応表は含まず「色 7」のように表示します。rarityは選出規則上2=R、3=SR、4=SSR、10=EX、20=BDの比較に対応します。10/20の順位は暫定方針です。未知コードを既知レアリティへ変換しません。育成では元コードを保持します。

## 単位と育成変換

- maxStatsは育成3項の基準パラメータ。表示P/T/Vそのものではありません。
- memberLevels/memberTraining/memberAwakening/snapLevelsのratesは10000分率です。100%は10000。
- maxPercentBpは表示スナップ％の基準値を100倍した整数。3.21%は321。snapLevelsを適用して表示％を算出します。
- bandItemEffects.valueBpは補正の10000分率。1.3%は130。評価値式へは10で割った0.1%整数13を渡します。
- 特訓・カード覚醒・キャラランク・Snap rankは別項目です。masterの率を合算して一括丸めしません。[計算仕様](calculation.md)を参照してください。

非公開変換ツールはこれらの条件に合わせてJSONを生成してください。出典形式、暗号化、取得元、変換の責務は公開アプリへ持ち込まないでください。

## collection

```json
{
  "format": "atsudori-tools/collection",
  "schemaVersion": 1,
  "catalogId": "my-catalog",
  "members": [],
  "snaps": [],
  "characterRanks": {},
  "bandItems": {}
}
```

| 項目 | 内容 |
| --- | --- |
| members[] | cardId, level, trainingStage, awakeningStage, liveSkillLevel, gekisouSkillLevel（すべて正整数） |
| members[].displayedStatsOverride | 旧所持モデル互換用の任意Stats。往復で保持するが所持計算には使わない |
| snaps[] | supportCardId, level, rank（すべて正整数） |
| characterRanks | キャラID文字列→手入力上書きランク。キー欠落は対応定義があれば推定、なければ未算出 |
| characterProgress（任意） | キャラID文字列→進捗オブジェクト。手入力はstamps/bondRankTotal/liveClears/songClears（表示ラベルはImportした定義から取得）。各値は任意の非負安全整数、欠落は不明。旧skillLevel2〜5は互換用に保持するが計算には不使用（スキルは自動集計） |
| totalRankBonus（任意） | 総合ランクによる各P/T/Vへの加算値の手入力上書き。0以上の安全な整数。欠落は定義から算出し、定義にもなければ保留 |
| bandItems | item ID文字列→合法Lvまたはnull。nullは明示的な未解放、欠落は未知。Lv0は不可 |

ランク推定は[採用条件・EXP・未確認事項](character-rank.md)を参照してください。推定値は保存せず、既存characterRanksは手入力値として保持します。所持Importでは正の安全な整数の手入力ランクを保持し、計算・出力時にcatalogの合法ランク行を確認します。ランク定義が未登録でも所持と進捗のImportは利用できます。追加フィールドのない旧v1も読み込み可能です。拡張を知らない旧実装への逆方向の読込はできません。

カードIDはそれぞれ重複不可。Lv・各段階・スキル・アイテムLvは対応catalogの行と上限で検証します。表示値や名称等のcatalog由来の項目を所持JSONへ追加しないでください。

catalogIdは対応するcatalogと一致する必要があります。追加進捗も含め、全配列・recordが空のcollectionだけはデータの紐付けがないため、現在のcatalogIdへ正規化できます。catalogのrevisionには結び付けず、各更新を再検証します。旧アプリのformat/masterdataCommitを持つファイルはそのままでは読めません。対応catalogを準備し、外部で明示的に形式を変換してください。

## Importでのキャラクター進捗の保持

所持Importでは、既定でファイルにない`characterProgress`の値を現在の登録から保持します。フィールド全体・キャラクター・個別項目の省略と空オブジェクトが対象です。保存済みの手入力進捗と互換用の旧進捗を項目単位で保持し、ファイルに明記した値（0を含む）は反映します。未知値を0で補完しません。メンバー・Snap・手入力ランク・アイテムは従来どおりファイルの内容で置き換えます。

確認画面には保持後の進捗人数と「ファイルにないキャラクター進捗は現在の値を保持」を表示します。バックアップを完全に復元して未記載の進捗も削除したい場合は、このチェックを外します。新しいファイルを選ぶたびに保持が既定に戻ります。読み込むだけでは保存せず、確定時に登録中の値と再照合・検証します。不正なファイルは保持設定にかかわらず拒否します。

この保持はUIのImport確定時だけです。`importCollection`による解析、起動時の読込、Exportはファイルの省略をそのまま扱い、手入力欄の空欄保存や登録初期化では従来どおり進捗を消せます。

## 保存と復旧

キーはatsudori-tools.catalog.v1とatsudori-tools.collection.v1です。別々のJSON文字列として保存し、一方の更新で他方の保存バイト列を書き換えません。起動だけでは保存しません。

破損・未対応version・catalog不一致の元文字列は上書きせず、元JSONをExportできます。catalogの正しい再Importで既存のcollectionが再び検証できれば復旧します。collectionを置き換えるには検証後の確認ボタン、空にするには確認ダイアログを必要とします。保存容量不足・ブラウザ制限では未保存を表示し、メモリ内の有効データをExportできます。

localStorageは同一origin内で共有されます。キーは他アプリと分離していますが、同じGitHub Pagesホストの別アプリをセキュリティ境界として隔離するものではありません。Importするデータは自分で管理し、端末・ブラウザも信頼できる環境を使ってください。

推定用のキャラクターランク定義JSONは所持とは独立してImport・Exportします。[定義形式](character-rank.md)を参照してください。

総合ランクボーナス対応はv1への任意項目の追加です。既存のcatalog・collection・ランク定義は変換せず読み込めます。必須項目の削除や意味の置換はありません。新項目は古いアプリでは拒否されるため、旧版への逆方向の読込は対応しません。ボーナス未設定の旧所持は保持したまま評価値を保留します。[ランク定義の拡張](character-rank.md#総合ランクボーナス)を参照してください。
