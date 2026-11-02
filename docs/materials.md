# 必要素材

「必要素材」は現在のcollectionに登録したメンバー・Snapを対象に、catalogが定義する合法的な最大段階までの費用を表示します。カード別の素材小計・育成項目別の内訳・全体の素材別小計を確認できます。仮育成の設定や評価値計算とは独立しています。

素材定義を含むcatalog JSONを「JSON Import / Export」のマスタからImportしてください。定義を持たない既存catalogも引き続き有効ですが、未到達の項目は計算不能と表示します。素材所持数の入力・差し引き、優先順位の最適化、バンドアイテムの素材計算は対象外です。

## 定義契約

catalog v1の任意項目`materialDefinition`に以下を内包します。別の保存キーは作らず、collectionの形式・保存バイト列を変更しません。実定義は同梱せず、ブラウザから取得・変換・送信しません。

| 項目 | 内容 |
| --- | --- |
| catalogRevision | 包含するcatalogのrevisionと完全一致する識別子 |
| resources | 素材のid・name・unit（item:個、card:枚、exp:EXP要求量） |
| schedules | id・axis・mode・basis・stages、任意のreason |
| bindings | kind（member/snap）・cardId・axis・scheduleId |

axisはMemberの`trainingStage`・`awakeningStage`・`liveSkillLevel`・`gekisouSkillLevel`・`level`、Snapの`rank`・`level`です。名称と費用の根拠`basis`は提供者が登録し、画面ではテキストとして表示します。

scheduleのmodeは`steps`（到達段階ごとの消費）、`cumulative`（その段階までの累計）、`unsupported`（確認できない費用）です。stagesは`stage`と`amounts: [{resourceId, quantity}]`を持ちます。配列順は意味を持ちません。初期段階のsteps費用は空配列または明示0、以後の消費なしも空配列で明示します。行の欠落を消費0とは解釈しません。unsupportedには空のstagesと必須のreasonを設定します。

計算はstepsなら現在値より大きく目標以下の行を合算し、cumulativeなら目標の累計から現在の累計を引きます。累計から省略した素材は0として扱うため、以前存在した正の数量を省略して減らす定義は拒否します。素材の種類をまたいで数量を足しません。安全な整数の範囲を超える合計はエラーにします。

素材・費用IDの重複、素材やカードの参照切れ、育成軸の不一致、合法段階の欠落・未知の段階、減少する累計、版不一致はImport時に拒否します。費用bindingの省略は許可し、その育成項目を計算不能にします。100素材/段階、1000段階/定義、全体50000段階、素材・定義・binding各20000件、JSON全体10MiBが上限です。識別子・説明・整数はcatalogの一般規則に従います。

最大段階は対応groupの最大の段階・スキルLv・rankです。Lvの目標は最大特訓段階または最大Snap rankのLv上限です。Lv費用表には対応groupの全Lvを登録しますが、上限より先は計算に含めません。既に最大なら追加費用はなく、費用定義が未登録でも「最大段階に到達済み」と表示します。

## EXPと未計算

EXPはLv軸のcumulativeだけに対応します。計算結果は「目標Lvの累計EXP − 現在Lvの累計EXP」で、現在Lvの開始時点からの要求量です。collectionはLv内の途中EXPを保存していないため、これを実際の残り必要EXPとは断定しません。画面と全体集計に上限である旨を表示し、EXPアイテムの効果や個数へ換算しません。

費用定義の欠落・unsupportedは0とせず、項目ごとに理由を表示します。一部が計算不能なら全体は計算済み分の小計です。EXPの上限と確定した素材個数は区別して表示します。異なる費用ルートや代替素材がある場合は、提供者が選んだルートの根拠をbasisに明記してください。代替の選択・最適化機能はありません。

catalogのImportは従来の参照保護と保存失敗保護を使用します。無効なImportは既存catalog/collectionを変更しません。既存のcatalog/collection Export、ランク、評価値、仮育成、変換プロファイルは維持します。旧catalog本体を対象にする互換用ハッシュは新しい任意定義を除外します。
