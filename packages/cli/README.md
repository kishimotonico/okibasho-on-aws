# cli

AIエージェントや開発者が端末からアップロードするためのコマンド（`share-html`）。

TypeScript + Node.js で書き、依存を単一JSにバンドルして npm で配布する（`npx share-html`）。対象は開発者とAIエージェントに割り切り、開発環境がないユーザーは Web UI を使う。

やること:

- ログイン（ブラウザ経由の OAuth Authorization Code + PKCE、トークン保存）
- ファイル / ディレクトリのアップロード（`--name` で slug 指定）
- 発行された URL の表示
