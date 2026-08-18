# cli

AIエージェントや開発者が端末からアップロードするためのコマンド（`share-html`）。

## 開発

```bash
pnpm --filter @page-share/cli dev -- --help
pnpm --filter @page-share/cli test
pnpm --filter @page-share/cli build
```

ビルド成果物は `dist/share-html.js`（単一JS、shebang 付き）。

## 接続先の設定

環境変数（優先）または `~/.config/share-html/config.json`:

| 環境変数               | 設定ファイルのキー | CDK CfnOutput    |
| ---------------------- | ------------------ | ---------------- |
| `SHARE_HTML_API_URL`   | `apiUrl`           | `ApiEndpointUrl` |
| `SHARE_HTML_ISSUER`    | `issuer`           | `OidcIssuerUrl`  |
| `SHARE_HTML_CLIENT_ID` | `clientId`         | `CliAppClientId` |

## コマンド

- `share-html login` — OAuth PKCE でログイン（トークンは `~/.local/state/share-html/tokens.json` に保存）
- `share-html logout` — 保存したトークンを削除
- `share-html <path> [--name <slug>] [--retention temporary|permanent] [--dry-run]` — HTML をアップロード
