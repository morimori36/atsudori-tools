# 開発用Skill

`.agents/skills/` の実ファイルをGit管理する。新しいCodex Cloudタスクでもcheckoutだけで定義・参照文書を読める。グローバルインストール、アプリの依存追加、自動更新は不要。適用方針はAGENTS.mdを参照する。

| Skill | 公式取得元 | 固定リビジョン | ライセンス |
| --- | --- | --- | --- |
| yomiyasu 3.1.0 | https://github.com/nanaism/yomiyasu | db78b9bc5e868549b517a037df7a4d1c93edac23 | MIT、同梱UnicodeデータのUNICODE-LICENSE.txtも保持 |
| Modern Web Guidance | https://github.com/GoogleChrome/modern-web-guidance | 4dd968349e54ca45a05dd5c818fb035c9054b022 | Apache-2.0（Skill内LICENSE） |

## 導入と更新

公式READMEの現行手順を確認し、yomiyasuはCodex Cloud向けコピー方式で `skills/yomiyasu/` を `.agents/skills/yomiyasu/` へ配置した。scripts・references・ライセンスを保持し、実行に不要な `assets/algo-artis.png` は既存の公開画像禁止方針に合わせて除外した。

Modern Web Guidanceは公式の代替導入方法 `npx skills add GoogleChrome/modern-web-guidance --skill modern-web-guidance -a codex -y` を使用した。Web用Skillとguidesだけを導入し、Chrome拡張用Skillは含めない。上流ルートのLICENSEもコピーした。SKILL.mdの必須実行表現を関連作業での参照に調整し、ローカル検索・通信時の注意を追記した（ファイル内に変更表示あり）。その他のガイド本文は変更していない。skills-lock.jsonは公式インストーラーの取得時のハッシュで、ローカル調整後のハッシュではない。

更新は明示的な保守作業として行い、公式手順・ライセンス・差分を確認し、この表のSHAと必要なライセンスを更新する。ロゴ除外と適用範囲の調整を維持し、公開監査を再実行する。

## 利用環境と外部通信

yomiyasuの検査はPython 3と標準ライブラリを使う。`${CLAUDE_SKILL_DIR}` が未展開ならリポジトリ内のSkill絶対パスに置き換える。検査対象は作業ディレクトリ内の通常ファイル、または標準入力で渡す。隠しディレクトリや作業ディレクトリ外のファイルは拒否される。検査記録 `.yomiyasu/` は作業用で、コミットしない。

Modern Web GuidanceのCLIはNode.js/npmとネットワークが必要。`npx ...@latest` はその時点の外部パッケージを取得・実行し、同梱ガイドと内容が異なる場合がある。利用時は `DISABLE_TELEMETRY=1` を付け、検索には一般的なWeb技術の語だけを渡す。上流は検索語・ガイドID等のテレメトリーを説明している。リポジトリ内容・個人情報・Importデータを外部へ渡さない。オフラインではSkill配下の `guides/` を `rg` で検索して該当Markdownを読む。この方法はnpmキャッシュに依存しない。

## 導入時の検証（2026-11-16）

- Codex CLIの `codex debug prompt-input` で新規プロンプトを生成し、両Skill名の列挙を確認した（モデル実行なし）。新しいCloudタスク自体の起動は未検証。
- yomiyasuの本体とPR向け参照文書を読み、架空の保存エラー説明文から不要な読点を1つ除く検証を実施。標準入力の `run --stdin --fact-gaps` と `verify --final -` が成功し、lint・diff・最終稿ハッシュ一致を確認した。条件・動作・否定の意味は保持した。検証用の文章や記録は製品へ残していない。
- 公式CLIで `search "accessible form errors" --skill-version 2026_11_09-5bcc021b` が成功。`retrieve accessible-error-announcement` が成功し、全文を参照した。同梱ガイドもローカル検索・読込可能。フォームの視覚エラーとARIA状態の同期を確認したが、今回はアプリ変更へ適用していない。
- アプリ機能・UI・計算・保存・Schema、CIの実行方針は変更していない。Skillは配信ディレクトリ外に置く。公開された開発資料のみを取得し、Privateリポジトリは使用していない。
