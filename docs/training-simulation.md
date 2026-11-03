# 共通育成シミュレーションAPI

育成条件・状態生成・成果計算を分離します。今回の変更は計算モデルだけです。既存の仮育成UIと保存、JSON変換出力の意味は維持します。新しい条件を編集する画面はまだありません。

## 条件と状態生成

`src/app/training-conditions.ts`の`TrainingConditions`は`member`（trainingStage / awakeningStage / liveSkillLevel / gekisouSkillLevel / level）と`snap`（rank / level）を持ちます。各軸は`null`で現状維持、正の安全な整数で指定値以下の合法な最大値、`'max'`で合法最大を指定します。現在値は下げません。`KEEP_TRAINING`は全項目維持、`MAXIMUM_TRAINING`は既存の凸なし最大育成プリセットです。

`applyTrainingConditions(master, collection, conditions)`が唯一の状態生成処理です。条件と入力所持を検証し、Member特訓・Snap上限解放を決めてから、それぞれ育成後の段階に対応するLv上限以下の合法Lvを選びます。段階・Lv行が飛び飛びでも、存在しない段階は生成しません。上限や合法値はcatalogの対応group、rarity、スキル配列から取得します。未確認の覚醒／特訓／スキル依存は追加しません。最後に既存のcollection検証を通します。不整合は推測で修復せずエラーにします。

入力と出力はネストも分離され、catalogを変更しません。カードの追加・削除はせず、進捗・手入力上書き・アイテム・旧互換値・TGWランクを保持します。collection/catalogの形式・Schema・保存キーは変更しません。この条件型はメモリ内のAPIであり、永続化形式は今回追加しません。

## 成果計算

`src/app/training-simulation.ts`の`simulateTraining(master, collection, conditions)`は以下を返します。

- `current` / `target`: 検証済み現在状態と共通処理で生成した育成後状態。
- `before` / `after`: キャラ別ランク、総合ランク、ボーナス、色・バンド別評価値と総計。各側の同じcollectionをランク推定と評価値に渡し、選出も再実行します。
- `materials`: `calculateMaterialRequirementsToTarget`で現在→目標の差分を計算。未対応・欠落は未計算、現物は既存のcard単位、EXPはLv開始時点からの上限を維持します。
- `bands` / `snaps` / `snapMaterials`: 同一シナリオの内訳。Member素材はキャラ／バンド別、共有Snapは独立集計します。
- `bondTheory(bandId)`: 同じtargetからバンド単位で遅延計算する既存の絆反復計算。ペアの絆理論上限と絆最大時の理論キャラランクを返します。実際の獲得済み絆ランクではありません。理論ランクを通常評価値へ適用しません。

`trainingBondTheory(master, target, bandId)`も直接使用できます。手動ランク・絆合計の除外、未入力進捗、不動点の規則は既存処理のままです。通常成果では手動ランクとボーナス上書き（0を含む）を維持します。定義不足・未計算を0の成長として表しません。

## 既存処理からの移行と次のUI

`maximumTrainingTarget` / `simulateMaximumTraining`は`MAXIMUM_TRAINING`を共通APIへ渡す互換入口です。Member特訓・スキル・Lvは最大、覚醒維持、Snap上限解放維持・Lv最大で、PR #24の結果を再現します。既存素材画面と`maximumTrainingBondTheory`の呼び出しも維持します。

`TrainingSettings`と検証・初期値・保存処理はそのまま維持します。`legacyTrainingConditions`が旧4項目を明示的に変換します。Snapは維持し、Member Lvには互換用の`'maxIfTrainingRaised'`を指定します。これは特訓が上がったときだけLvを上限へ引き上げるモードです。`applyHypotheticalTraining`はこのアダプター経由で状態生成を共通化します。追加した条件に旧設定の既定最大値を割り当てません。破損設定の保護と保存失敗処理は変更しません。

評価値画面の旧仮育成では従来どおり現在collectionをランク計算へ渡します。JSON変換も従来どおり現在ランク・Snap・アイテムと旧仮育成後Memberを出力します。新しい共通シミュレーションの育成後ランク／Snapへ黙って移行しません。

次のUI改修では、共通条件の編集・共有・保存仕様を決め、評価値・必要素材の両画面から`simulateTraining`を呼びます。絆の展開時は返却された`bondTheory`を使用し、条件・所持・catalog変更時に画面側の遅延結果を破棄します。新結果のJSON変換への適用は別途仕様決定が必要です。キャラランク・絆・評価値は結果であり、条件入力には追加していません。
