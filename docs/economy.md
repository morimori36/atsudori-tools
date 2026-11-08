# 素材・経済シミュレーター

メニューの「素材・経済シミュレーター」で、期間内の素材供給・通貨交換・用途配分を試算します。素材需要は現在の所持と共通育成条件から毎回再計算します。所持・在庫・カードの育成状態は変更しません。

## 使い方

1. `materialDefinition` と `supplyDefinition` を含むcatalogをImportし、素材在庫で現在庫を登録します。空欄と在庫0は別です。有償・無償通貨も別の素材IDに登録します。
2. 開始日・終了日、固定するランク、LB消費・通常／スキップのランク、バンド別練習Lvと受取条件を入力します。期間ボタンは1・7・30日、任意期間は最大3660日です。
3. イベントの回収日・到達pt・全回収・制限商品全交換、商品別の購入数量と購入済み数を指定します。無制限商品は指定数量だけを交換します。数量0は購入しません。
4. パス、固定報酬の受取回数、外部収入、ガチャ・LB回復・将来用の確保を選択し、「試算して条件を保存」を押します。パス比較は各契約を1回購入し、期間内の契約日をすべて受け取る条件で比較します。
5. 素材／通貨収支、利用権／直接EXP、未確認・未実行、取得元と根拠の明細を確認します。「結果・前提をExport」は共通育成条件・catalogの版・全明細・未計算理由を含むJSONを出力します。「条件JSON」は再Importできます。

入力途中の値は画面切替でも保持し、未反映と表示します。共通育成条件は他の画面と共用し、変更すると保存済みシナリオの需要を再計算します。保存条件とcatalogIdが異なる場合は計算を保留します。対応catalogまたは条件JSONをImportするか、試算条件を初期化してください。

## 確実性と残高

- 確定収入、選択した達成・購入・受取を前提にした条件付き収入、抽選の期待収入を分離します。期待値は在庫登録値や購入資金には使いません。
- 計算済み残高は、登録現在庫＋確定・条件付き収入−実行済み支出−確保分です。推定不足には抽選の期待値も含みます。未確認の供給・必要数・現在庫があれば、全体の推定不足は未確認です。既知の小計と未確認の理由を残します。
- 有償・無償スター、交換通貨、EXP、複製などの異なるIDは自動換算しません。直接付与EXPと無料抽選の利用権は在庫とは別の明細です。無料抽選からカードや星のシールを生成しません。
- 収支は日時順。同日時は購入時特典、その他の収入、用途配分、catalog配列順の商品購入です。購入は要求数量の全体を満たす場合だけ実行し、残高に合わせて黙って減らしません。費用が複数資源でも一括検査します。現在庫未登録の資源を使う支出は保留します。
- 将来用の確保は支出とは別列に記録し、購入可能残高から除きます。ガチャへの支出はカード獲得、LB回復への支出はLB増加を自動生成しません。プレイ予定をLB消費入力に反映してください。

## catalog内の供給定義

catalog v1の任意項目 `supplyDefinition` を使用します。未登録の旧catalogとcollectionは従来どおり有効です。構造は[Schema](../public/schemas/catalog-v1.schema.json)、参照・意味検証は `src/domain/economy/validate.ts` です。実定義、取得機能、上流固有形式の変換は同梱しません。

全数量は非負の安全な整数。比率は `{numerator, denominator}`（分母は正整数）。IDは素材と同じ識別子規則で、危険なキーを拒否します。全ての資源参照は `materialDefinition.resources` 内のIDです。根拠 `basis`、名称はテキストです。版を推測しません。

| 項目 | 内容 |
| --- | --- |
| catalogRevision, revision, basis | 包含catalogと一致する版、供給定義の版、根拠 |
| utcOffsetMinutes | 日付・リセットに使用するUTC差。固定オフセットを明示する。夏時間を推測しない |
| currencies | 通貨収支へ分類する素材ID。分類は換算規則ではない |
| lives | id/name/basis、mode（play/skip）、scoreRank、lbMultiplier、perLb、perPlay |
| studios | bandId/level、tickMinutes、rewardScale、normalMinutes、capMinutes、overflowRate、rounding、lotteryRounding、rewards、basis |
| ranks | rank、studioMultiplier、daily |
| events | id/name/basis、startsAt/endsAt、milestones、repeat |
| offers | id/name/basis、scope、任意eventId、minimumRank、costs、rewards、limit、reset、window |
| passes | id/name/basis、durationDays/priceYen、purchase/daily/weekly/eventDaily、weeklyReset、features |
| fixedSources | id/name/basis、category（permanent/oneTime/paid）、reset/window、rewards、priceYen |
| unavailable | 未取得・未確認の定義と影響する資源ID |

各配列は1000件以内、構造検査は全体20万要素以内、catalog全体は既存の10MiB上限です。任意のeventCoverageは開催カレンダーの収録範囲を示すWindowです。範囲未指定・範囲外でイベントがない日を、開催なしと推測しません。試算は処理10万件・明細20万件までとし、超過をエラーにします。定義不足を正常な収入0として扱いません。

### 報酬・抽選

`Rewards` は `fixed`, `lotteries`, `unavailable` の3配列を必須とします。確認済みの報酬なしは空配列で表します。未取得は `unavailable: [{reason, resourceIds, destination?}]`、対象資源自体が不明なら空の `resourceIds` です。destination省略は在庫への影響、direct/entitlementは直接報酬・権利の保留で、在庫の不足判定とは分離します。

固定報酬は `{resourceId, quantity, destination}`。destinationは `inventory`（在庫）、`direct`（直接付与）、`entitlement`（権利）。抽選は `{draws: Ratio, totalWeight, outcomes: [{weight, rewards: Grant[]}]}`。外れも空rewardsのoutcomeで明示し、重み合計はtotalWeightと完全一致させます。素材別期待値は抽選回数×重みの割合×数量です。確率や回数の欠落は補完しません。

ライブは `perLb` の基礎報酬×lbMultiplier×LB消費数です。期間全体でスキップLBを割合から切り捨て、残りを通常プレイに割り当てます。直接EXPは `perPlay` に分け、入力した実行回数だけで計算します。通常・スキップの定義は独立です。日次ライブ報酬は日末に受け取り、将来日の報酬で前日の商品を買いません。

### スタジオ練習

指定した蓄積時間を受取間隔で区切り、期間末も受け取ります。各受取でcapMinutes（nullは上限なし）を適用し、tickMinutes未満を切り捨てます。normalMinutes以降のtickにはoverflowRateを適用します。時間・上限はtickの倍数が必要です。overflowRate=nullで超過した場合は通常分の小計と、未確認の超過分を分けます。

ランクのstudioMultiplierと、報酬単位を蓄積単位へ換算するrewardScaleを固定報酬と抽選回数の両方へ適用します。rounding=`claim` は受取単位、`tick` は蓄積単位で固定報酬を切り捨てます。抽選回数はlotteryRounding=`floor` で同じ単位で切り捨て、`fractional` は期待回数を維持します。丸め規則null、ランク倍率null、対象Lv欠落は計算を保留します。端数処理は整数比の演算で行います。練習Lvの成長・途中残時間の持越しはシミュレーションしません。

### イベント・交換・リセット

日時は正規の `YYYY-MM-DDTHH:mm:ssZ`。windowは開始を含み終了を含みません。シナリオの日付は開始・終了の両日を含みます。終了日しか分からない上流の秒単位包含時刻は、生成側で終了の次の瞬間へ正規化してください。

累計報酬は `{points, excludeOnFullCollection, rewards}`。全回収時だけ指定された最終通貨を除外し、他の報酬と混ぜません。repeat=`{startsAfter, everyPoints, rewards}` は `max(0, floor((到達pt−startsAfter)/everyPoints))` 回です。設定なしはnull。到達ptなしでは繰り返し数量を未確認にします。イベント通貨は先に在庫へ計上し、交換を経由して素材へ変換します。全回収と低すぎる到達ptの矛盾は拒否します。

商品scopeは `catalog/seal/event/other`。eventは参照イベントを必須とし、回収日時以降を対象にします。minimumRank=nullはランク制限なし、limit=nullは無制限です。costsは同時に支払う資源の配列。代替通貨や為替を推測しません。購入方針のquantityはリセット期間ごとの購入数、alreadyPurchasedは最初の期間だけの購入済み数です。イベントの制限商品全交換は残り枠を購入します。

reset=`{kind, hour, weekday?, day?}`。kindはonce/daily/weekly/monthly。weeklyのみweekday（0=日曜）、monthlyのみday（1〜28）を指定します。最初のリセット期間の残り枠を1回数え、期間内の境界ごとに新しい枠を加えます。30日を4週には換算しません。月末29〜31日、夏時間、未知のリセット規則は未対応として生成側で保留してください。

パスの購入時特典・価格は契約開始が試算期間内の場合だけ、dailyは指定受取日だけ、weeklyは契約内の週次機会、eventDailyはイベントの開催日だけを数えます。期間前に契約開始した場合は、最初の週次枠の受取状況を未確認として保留します。時短機能はfeaturesの説明だけで、報酬倍率に加えません。初回・継続購入の特別特典や複数契約の重複は推測しません。

## 計算と保存の境界

`simulateEconomy()` は `applyTrainingConditions()` → `calculateMaterialRequirementsToTarget()` → `calculateEconomy()` の純粋な経路です。在庫比較は `materialInventoryBalances()` を共用し、素材ごとに一度だけ在庫を引きます。費用未計算項目も結果Exportへ含めます。供給はカード状態を変更せず、育成素材を実際に支出しません。

シナリオは[独立Schema](../public/schemas/economy-scenario-v1.schema.json)、format=`atsudori-tools/economy-scenario`、schemaVersion=1、保存キー=`atsudori-tools.economy-scenario.v1`、上限5MiBです。静的供給定義はcatalog内、ユーザーの期間・練習Lv・ランク・交換方針はシナリオ内、実在庫はcollection内です。共通育成条件は既存の保存とUIを使用します。結果JSONは入力・育成条件・版・根拠を含む説明用の出力で、所持Importには使用できません。

起動だけでは保存しません。破損条件の元JSONはExportでき、正しい条件JSONのImportまたは確認付きの初期化まで保護します。失敗したImportは既存条件を変更しません。通常の保存失敗は未保存と表示し、試算・現在の条件Exportは利用できます。所持とcatalogの初期化は試算条件を削除しません。
