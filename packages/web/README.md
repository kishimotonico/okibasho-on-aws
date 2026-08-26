# web

管理アプリ（app 側）のフロントエンド。

TanStack Start（React）を使う。SPA モード + prerender で静的ファイルとしてビルドし、S3 origin から配信する。server functions / SSR は使わない。ブラウザから Cognito Identity Pool の一時クレデンシャルで S3 を直接操作する。

## 開発

```bash
pnpm --filter @page-share/web dev
```

接続先は `packages/web/.env.example` を `.env` にコピーして埋める（`cdk deploy` の CfnOutput に対応）。

| 環境変数                  | CDK CfnOutput     |
| ------------------------- | ----------------- |
| `VITE_HOSTED_UI_BASE_URL` | `HostedUiBaseUrl` |
| `VITE_OIDC_ISSUER`        | `OidcIssuerUrl`   |
| `VITE_WEB_APP_CLIENT_ID`  | `WebAppClientId`  |
| `VITE_IDENTITY_POOL_ID`   | `IdentityPoolId`  |
| `VITE_USER_POOL_ID`       | `UserPoolId`      |
| `VITE_REGION`             | `Region`          |
| `VITE_PAGES_BUCKET`       | `PagesBucketName` |
| `VITE_PAGES_BASE_URL`     | `PagesBaseUrl`    |

## ビルド

```bash
pnpm --filter @page-share/web build
```

成果物は `dist/client`（静的ファイル）。CloudFront の 404 rewrite 先は `/_shell.html`。

## 機能

- Cognito Hosted UI によるログイン（Authorization Code + PKCE、`oidc-client-ts`）
- アップロード画面（単一ファイル / ディレクトリ / drag & drop、slug 指定、保存期間選択）
- My Pages（自分のページ一覧、閲覧 URL コピー、保存期間の変更、削除）
