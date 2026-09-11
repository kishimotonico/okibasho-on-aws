# cli

AI エージェントや開発者が端末からアップロードするためのコマンド（`okiba`）。
Node.js のみで動き、AWS CLI は不要。S3 は Cognito Identity Pool の一時クレデンシャルで直接操作する。

## 開発

```bash
pnpm --filter @okibasho/cli dev -- --help
pnpm --filter @okibasho/cli test
pnpm --filter @okibasho/cli build
```

ビルド成果物は `dist/okiba.js`（単一 JS、shebang 付き）。

## 接続先の設定

環境変数（優先）または `~/.config/okibasho/config.json`:

| 環境変数                 | 設定ファイルのキー | CDK CfnOutput     |
| ------------------------ | ------------------ | ----------------- |
| `OKIBA_ISSUER`           | `issuer`           | `OidcIssuerUrl`   |
| `OKIBA_CLIENT_ID`        | `clientId`         | `CliAppClientId`  |
| `OKIBA_IDENTITY_POOL_ID` | `identityPoolId`   | `IdentityPoolId`  |
| `OKIBA_USER_POOL_ID`     | `userPoolId`       | `UserPoolId`      |
| `OKIBA_REGION`           | `region`           | `Region`          |
| `OKIBA_BUCKET`           | `bucket`           | `PagesBucketName` |
| `OKIBA_PAGES_BASE_URL`   | `pagesBaseUrl`     | `PagesBaseUrl`    |

refresh token は `~/.config/okibasho/` 配下にパーミッション 0600 で保存する。

## コマンド

- `okiba login` — OAuth PKCE（127.0.0.1 コールバック）
- `okiba logout` — 保存したトークンを削除
- `okiba <path> [--name <slug>] [--permanent] [--dry-run]` — HTML をアップロード
- `okiba list` — 自分のページ一覧
- `okiba rm <slug>` — ページを削除（冪等）
