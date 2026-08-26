# cli

AI エージェントや開発者が端末からアップロードするためのコマンド（`share-html`）。
Node.js のみで動き、AWS CLI は不要。S3 は Cognito Identity Pool の一時クレデンシャルで直接操作する。

## 開発

```bash
pnpm --filter @page-share/cli dev -- --help
pnpm --filter @page-share/cli test
pnpm --filter @page-share/cli build
```

ビルド成果物は `dist/share-html.js`（単一 JS、shebang 付き）。

## 接続先の設定

環境変数（優先）または `~/.config/share-html/config.json`:

| 環境変数                      | 設定ファイルのキー | CDK CfnOutput     |
| ----------------------------- | ------------------ | ----------------- |
| `SHARE_HTML_ISSUER`           | `issuer`           | `OidcIssuerUrl`   |
| `SHARE_HTML_CLIENT_ID`        | `clientId`         | `CliAppClientId`  |
| `SHARE_HTML_IDENTITY_POOL_ID` | `identityPoolId`   | `IdentityPoolId`  |
| `SHARE_HTML_USER_POOL_ID`     | `userPoolId`       | `UserPoolId`      |
| `SHARE_HTML_REGION`           | `region`           | `Region`          |
| `SHARE_HTML_BUCKET`           | `bucket`           | `PagesBucketName` |
| `SHARE_HTML_PAGES_BASE_URL`   | `pagesBaseUrl`     | `PagesBaseUrl`    |

refresh token は `~/.config/share-html/` 配下にパーミッション 0600 で保存する。

## コマンド

- `share-html login` — OAuth PKCE（127.0.0.1 コールバック）
- `share-html logout` — 保存したトークンを削除
- `share-html <path> [--name <slug>] [--permanent] [--dry-run]` — HTML をアップロード
- `share-html list` — 自分のページ一覧
- `share-html rm <slug>` — ページを削除（冪等）
