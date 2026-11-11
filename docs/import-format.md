# JSONインポート仕様 v1

スター予算はcatalog v1の任意項目 `starBudgetDefinition` とcollection v1の任意項目 `starBudgetScenario`／既存 `tgwRank` を使います。[スター予算のJSON契約・保存と復旧](star-budget.md#保存json契約)を参照してください。

素材別充足日数シミュレーターはcatalog v1の任意項目 `supplyDefinition` を使用します。供給資源は `materialDefinition.resources` のIDを参照します。供給定義のない旧catalogは変更不要です。供給定義はv4、試算条件はv5を使用し、旧ドラフトの交換・契約・期間項目を含む形式は非対応です。ユーザーの試算条件は独立したformat・保存キーで管理します。[供給定義・シナリオの仕様](economy.md)を参照してください。

catalogは共通のカード・育成定義、collectionは利用者の所持・進行状態です。どちらもサービス非依存で、出典URLやGitコミットを要求しません。自動取得・変換・送信はしません。

イベント周回プランナーは別format・別保存キーです。この文書のcatalog/collectionとは独立した仕様です。[周回プランJSON仕様](event-planner.md#保存json)を参照してください。

JSON出力の変換プロファイルも別format・別保存キーです。[プロファイルの仕様と使い方](profile-export.md)、[構造Schema](../public/schemas/conversion-profile-v2.schema.json)を参照してください。catalog／collectionのformatとschemaVersionは1を維持します。

正確な構造は[Catalog JSON Schema](../public/schemas/catalog-v1.schema.json)と[Collection JSON Schema](../public/schemas/collection-v1.schema.json)、追加の意味検証はsrc/data/catalog/validate.tsとsrc/storage/collection.tsが定義します。Schemaは必要条件です。参照関係や連動条件は下記の意味検証も必要です。Schemaはnpm run schema:writeでフィールド定義から生成します。

共通ルール:
- formatと整数schemaVersionを必須にします。現在はversion 1だけに対応します。将来の版を黙って読まず、明示的な変換を必要とします。
- 不明なキー・必須キーの欠落・型不一致・負数・小数・安全でない整数を拒否します。文字列は1〜200文字で、空白だけは不可。name/titleも必須です。
- 数値はJavaScriptの安全な整数（最大9007199254740991）。ID・Lv・段階は正整数、パラメータ・率は0以上。ID文字列の先頭ゼロは不可です。危険なオブジェクトキーも拒否します。
- catalogIdとrevisionは英数字で開始する1〜80文字、以降は英数字・ピリオド・下線・ハイフン。実マスタを示す値をアプリが解釈することはありません。
- JSONファイルはUTF-8。catalogは10MiB、collectionは5MiBが上限です。Import失敗ではメモリ内の有効データも保存データも変更しません。
- catalogは各表20000行・全体50000行までです。配列型フィールドは原則空を不可とし10000要素まで。スタンプの対象キャラ配列だけは空を許可します。supportSkillLevelsだけは必ず2要素です。
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

すべての表は省略不可。空catalogは正常な状態ですが、所持計算には必要な定義を登録します。以前保存した作成途中のcatalogも読み込みとExportは可能です。不足・不整合を一覧にし、その間は所持表示・計算を止めます。Importでは構造に加えて参照・育成定義を検証し、不完全なcatalogは拒否します。途中のExportは保管用で、不足解消前の再Importはできません。

明記した任意フィールド以外は必須、記載以外のキーは不可です。Statsはperformance/technic/visualの3つの非負整数です。

| 表 | フィールド | 複合キー |
| --- | --- | --- |
| bands | id, name | id |
| characters | id, bandId, name, displayOrder?: 非負整数（任意） | id |
| members | id, characterId, cardType, rarity, name, title, maxStats: Stats, levelGroup, trainingGroup, awakeningGroup, liveSkillLevels: 整数配列, gekisouSkillLevels: 整数配列 | id |
| snaps | id, characterIds: 整数配列, cardType, rarity, name, title, maxPercentBp: Stats, levelGroup, rankGroup | id |
| characterRankLevels | 正整数の配列 | 値 |
| memberLevels | group, level, rates: Stats | group + level |
| memberTraining | group, stage, rates: Stats | group + stage |
| memberAwakening | group, stage, rates: Stats, leaderSkillLevel | group + stage |
| memberLevelLimits | rarity, trainingStage, limitLevel | rarity + trainingStage |
| snapLevels | group, level, rates: Stats | group + level |
| snapRanks | group, rank, limitLevel, supportSkillLevels: [正整数, 正整数] | group + rank |
| bandItems | id, bandId, name, displayOrder?: 非負整数（任意） | id |
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

cardTypeは正整数のツール独自の色IDとして比較・表示します。1=紅赤、2=紺碧、3=翡翠、4=山吹、5=紫苑とし、未知のIDは「色 7」のように表示します。rarityは選出規則上2=R、3=SR、4=SSR、10=EX、20=BDの比較に対応します。10/20の順位は暫定方針です。未知コードを既知レアリティへ変換しません。育成では元コードを保持します。

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
| characterProgress（任意） | キャラID文字列→進捗オブジェクト。手入力はbondRankTotal/liveClears（表示ラベルはImportした定義から取得）。各値は任意の非負安全整数、欠落は不明。旧stamps/songClears/skillLevel2〜5は互換用に保持するが計算には不使用 |
| totalRankBonus（任意） | 総合ランクによる各P/T/Vへの加算値の手入力上書き。0以上の安全な整数。欠落は定義から算出し、定義にもなければ保留 |
| ownedStampIds（任意） | 所持スタンプの正整数ID配列（20000件以内、重複不可）。未記載・空配列は所持なし。catalog.stamps内の既存IDを参照 |
| resourceInventory（任意） | 素材ID文字列→0以上の安全な整数。20000件以内、IDは素材定義と同じ1〜80文字の英数字開始・英数字／ピリオド／下線／ハイフン。危険なオブジェクトキーは不可。省略・項目欠落は未登録、0は明示的な在庫0 |
| bandItems | item ID文字列→合法Lvまたはnull。nullは明示的な未解放、欠落は未知。Lv0は不可 |

ランク推定は[採用条件・EXP・未確認事項](character-rank.md)を参照してください。推定値は保存せず、既存characterRanksは手入力値として保持します。所持Importでは正の安全な整数の手入力ランクを保持し、計算・出力時にcatalogの合法ランク行を確認します。ランク定義が未登録でも所持と進捗のImportは利用できます。追加フィールドのない旧v1も読み込み可能です。拡張を知らない旧実装への逆方向の読込はできません。

カードIDはそれぞれ重複不可。Lv・各段階・スキル・アイテムLvは対応catalogの行と上限で検証します。表示値や名称等のcatalog由来の項目を所持JSONへ追加しないでください。

catalogIdは対応するcatalogと一致する必要があります。追加進捗も含め、全配列・recordが空のcollectionだけはデータの紐付けがないため、現在のcatalogIdへ正規化できます。catalogのrevisionには結び付けず、各更新を再検証します。旧アプリのformat/masterdataCommitを持つファイルはそのままでは読めません。対応catalogを準備し、外部で明示的に形式を変換してください。

## Importでのキャラクター進捗の保持

所持Importでは、既定でファイルにない`characterProgress`の値を現在の登録から保持します。フィールド全体・キャラクター・個別項目の省略と空オブジェクトが対象です。保存済みの手入力進捗と互換用の旧進捗を項目単位で保持し、ファイルに明記した値（0を含む）は反映します。未知値を0で補完しません。メンバー・Snap・手入力ランク・アイテムは従来どおりファイルの内容で置き換えます。

ファイル選択後に検証し、保持後のデータを保存できた場合だけ即反映します。確認画面・完全置換のチェックはありません。進捗やTGWランクを消す場合は「キャラランク」で空欄を保存するか、「JSON Import / Export」の「データの初期化」で所持・育成データを初期化します。同じファイルも再選択できます。古い非同期読込は新しいImportやマスタ更新・初期化を上書きしません。

素材在庫も`resourceInventory`全体の省略時だけ現在の登録を保持します。明示したオブジェクトは全置換し、`{}`は全解除です。マスタにないIDの登録値もバックアップから復元・保持します。通常の在庫入力と不足計算は`unit: item/card/exp`を対象にします。メンバーEXPとスナップEXPは独立した素材IDに保存し、参照不能IDだけを確認用に分離します。素材の追加・改名・削除を理由に在庫を自動で消しません。別catalogへの空データ正規化は、在庫にも登録がない場合だけです。

この保持はUIのImport時だけです。`importCollection`による解析、起動時の読込、Exportはファイルの省略をそのまま扱います。

## 保存と復旧

キーはatsudori-tools.catalog.v1とatsudori-tools.collection.v1です。別々のJSON文字列として保存し、一方の更新で他方の保存バイト列を書き換えません。起動だけでは保存しません。catalogのブラウザ保存だけは容量節約のため空白・改行を除いたJSONとし、Import／Exportするファイルの整形形式は従来どおりです。過去にブラウザへ保存した整形済みcatalogもそのまま読み込めます。保存キーや所持データを移行・初期化する必要はありません。

破損・未対応version・catalog不一致の元文字列は上書きせず、元JSONをExportできます。catalogの正しい再Importで既存のcollectionが再び検証できれば復旧します。collectionのImportは検証後に即保存・反映し、空にする操作は確認ダイアログを必要とします。Importの保存失敗はエラーとし、既存のメモリ・保存データを維持します。手動編集の保存失敗は未保存を表示し、メモリ内の有効データをExportできます。

localStorageは同一origin内で共有されます。キーは他アプリと分離していますが、同じGitHub Pagesホストの別アプリをセキュリティ境界として隔離するものではありません。Importするデータは自分で管理し、端末・ブラウザも信頼できる環境を使ってください。

推定用のランク定義と総合ランクボーナス表はcatalogの任意項目rankDefinitionへ統合します。catalogとcollectionの2種類で管理し、rankDefinitionを含むマスタJSONをImportします。[定義形式](character-rank.md)を参照してください。

総合ランクボーナス対応はv1への任意項目の追加です。既存のcatalog・collectionはそのまま読み込めます。別ファイルの旧ランク定義の取り込みは廃止しました。rankDefinitionを含むマスタJSONを用意してください。必須項目の削除や意味の置換はありません。新項目は古いアプリでは拒否されるため、旧版への逆方向の読込は対応しません。ボーナス未設定の旧所持は保持したまま評価値を保留します。[ランク定義の拡張](character-rank.md#総合ランクボーナス)を参照してください。

## catalog.rankDefinition（任意）

カード・育成テーブルと同じcatalog JSONに、ランク推定と総合ランクボーナスの静的定義を追加します。engine、id、version、provenance、manualProgress、achievements、rankThresholdsと任意のtotalRankBonusesを持ちます。旧ファイルのformat・schemaVersion・catalog参照は内包しません。詳細は[ランク定義](character-rank.md)とcatalog Schemaを参照してください。

これは既存v1への任意項目追加です。未登録のcatalogも有効であり、collection v1の形式・保存キー・所持データは変更しません。rankDefinitionを内包したcatalog JSONをImportすると、以後のExportにも定義が含まれます。


## TGWランク（任意）

collection v1の`tgwRank`はプレイヤー全体のTGWランクです。1以上の安全な整数だけを保存し、省略は不明としてランク1と区別します。合法ランクの定義は補完しません。旧v1を読み込めますが、新項目を知らない旧アプリへの逆方向の読込には対応しません。

所持Importの保持チェックはTGWランクにも適用します。既定では省略時に保存済み値を保持し、明記した値を優先します。チェックを外した完全復元では省略で削除します。解析・起動・Exportでは補完しません。入力欄の空欄保存でも削除できます。評価値・イベント周回プランナーの計算には使用しません。

## catalog.materialDefinition（任意）

素材名称・単位・育成項目別費用・カードとの対応をcatalogへ内包できます。[必要素材の定義・計算・EXPの制約](materials.md)を参照してください。catalogのrevisionと一致しない定義は拒否します。未登録の旧catalogも有効で、collectionは変更しません。Schemaは`npm run schema:write`で同期します。

## キャラクターの表示順

`characters[].displayOrder`はバンド内の表示順を表す任意の安全な非負整数です。0からの開始や連番を要求せず、別バンドでは同じ値を使えます。同一バンドでは全員に指定して昇順に表示するか、全員で省略します。重複・一部だけの指定は意味検証でImportを拒否し、負数・小数・文字列・null・安全でない整数は構造検証で拒否します。不完全な定義から順序を推測しません。

全員未指定の旧catalogは各画面の従来順を維持します。ランク編集と絆理論値では従来の5行レイアウト順を使い、その他の一覧は元の順序を保ちます。指定がある場合、ランク編集・絆理論値・評価値のキャラクター見出し・詳細フィルタ・Snapの対応キャラクター名に共通の表示規則を使います。バンドアイテムの順序は変更しません。

表示時にcatalogの配列を並べ替えず、Import/Exportではフィールドと配列順を保持します。schemaVersionとcollectionの構造・保存キーは変更せず、移行は不要です。計算・選出には表示順を使いません。拡張フィールドに未対応の古いアプリへ新catalogを渡す場合は拒否されるため、対応版を使用してください。

## 楽曲数とスタンプの自動算出

catalogの任意フィールド`songClearCounts`は、既存キャラID文字列から0以上の安全な整数へのrecordです。正規の正整数IDのみ、20000件以内とします。生成側が確定したプレイ可能な楽曲種類数を受け取り、アプリでは楽曲ID・難易度・バンドの割当を解釈しません。フィールド・キャラの項目がなければ0です。

任意の`stamps`は`{id, name, characterIds}`行の配列です。IDは正の安全な整数で重複不可、nameは通常の文字列規則、characterIdsは既存キャラの正整数ID配列（重複不可、0〜10000件）です。単独・複数・対象なしに対応し、所持しているIDを各対象キャラに1種類ずつ計上します。stampsも各表20000行・全表50000行の制限へ含めます。未登録なら0種類です。

collectionの`ownedStampIds`は初期未記載（所持なし）で、新マスタ追加分もOFFです。同一IDの所持はrevision更新後も保持し、参照するスタンプを削除するマスタ更新・初期化は拒否します。先に所持を解除するか、対応マスタを使用してください。所持・育成データの初期化ではスタンプ所持・素材在庫も解除します。

日常の所持Importでは`ownedStampIds`の**省略時だけ**現在の登録を保持します。明示した配列は置き換え、`[]`は全解除です。旧ファイルの数値進捗からIDを復元しません。保存に成功した場合だけImportを反映し、保存失敗・破損保護は既存の所持データと共通です。旧`characterProgress.stamps`と`characterProgress.songClears`は読込・往復のため保持しますが、通常推定・絆理論値・育成後・外部JSONで一切使いません。ランク定義なしの未算出は維持します。

## 任意のスキルカテゴリ

`skillCategories?: { id: 正整数, kind: "live" | "gekisou" | "support" | "gekisouSupport", name: 文字列 }[]`をcatalog v1へ任意追加できます。IDは表内で一意、表示順は定義配列順です。

メンバーの`liveSkillCategoryIds?`・`gekisouSkillCategoryIds?`、スナップの`supportSkillCategoryIds?`・`gekisouSupportSkillCategoryIds?`は、対応する系統のカテゴリIDを参照する空でない重複なし整数配列です。複数スキルのカテゴリをまとめて指定でき、いずれかの一致で表示します。未定義・異なる系統への参照はImportを拒否します。原本のスキルIDや分類ロジックはcatalogに含めません。

分類不明の場合は参照フィールドを省略します。定義のない旧catalogもImportできます。カード名や育成値からの分類推定はしません。詳細フィルタは系統ごとに単一選択、系統間・既存フィルタ間はAND条件です。「すべて」と全解除で解除でき、マスタ更新で選択カテゴリが消えた場合も解除します。collection・育成条件の保存形式と数値計算は変更しません。

## バンドアイテムの表示順

`bandItems[].displayOrder`はバンド内の任意の安全な非負整数です。全アイテムに指定したバンドは昇順、全件省略した旧catalogのバンドは従来のレイアウト順を維持します。0・飛び番・別バンドの同値を許容し、同一バンドの重複・一部欠落や不正な型・範囲はImportを拒否します。キャラクターの表示順・ID・名前から対応を推測しません。

catalogの配列順とImport/Exportの値は保持します。schemaVersion、collectionの形式・保存キー、入力の保存、評価計算・選出は変更せず、移行は不要です。追加フィールドに未対応の旧アプリには新catalogを渡せません。

`materialDefinition.resources[]` は任意の `displayOrder`（0以上の安全な整数）を受け取ります。在庫表示用で、費用計算・所持には影響しません。省略した既存catalogもImport・Exportでき、既定値を書き足しません。各単位のセクション内で指定値の昇順、同値はcatalog順、未指定は末尾でcatalog順に表示します。

## catalog／collection統合

catalog v1の任意項目 `starBudgetDefinition` に静的値・根拠・未確認区分を保持します。構造は従来のdefinitionと同じで、定義のrevisionはcatalogのrevisionと一致必須です。全11商品、価格段階、区分と値・根拠の整合性を検証します。定義なしの旧catalogも有効です。

collection v1の任意項目 `starBudgetScenario` は次の項目だけを必須にします。ランクは既存の `tgwRank` のみで、scenarioにrankは保存しません。

| 項目 | 型・読み取り時の既定値 |
| --- | --- |
| storyEventPercent | 0〜100の整数またはnull（既定null） |
| eventPremium / seasonPremium | boolean（既定false） |
| selectedProducts | 重複しない既知商品ID配列（既定は全11種、空配列も有効） |

省略された条件を保存・Export時に補完しません。通常Importで項目がなければ保存中の条件を保持し、明示された条件はfalse・null・空配列を含め丸ごと採用します。完全復元では省略分を保持しません。catalog更新・定義の有無によって既存の条件や所持を削除しません。未確認を0に置き換えません。

画面も共通catalog／collectionから読み取り、共通保存・Import/Export・初期化を使います。旧独立JSON・専用保存キーは読み取り・移行・削除しません。

スター予算の旧 `includeArena`／`definition.arena` は入力時に読み捨て、新規保存・Exportには含めません。読込だけで元の保存内容は上書きしません。[互換性方針](star-budget.md#catalogcollection統合)を参照してください。
