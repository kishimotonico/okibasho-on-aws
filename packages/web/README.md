# web

管理アプリ（app 側）のフロントエンド。

TanStack Start（React）を使う。SPA モード + prerender で静的ファイルとしてビルドし、S3 origin から配信する。server functions / SSR は使わない。

## 開発

```bash
pnpm --filter @page-share/web dev
```

接続先は `packages/web/.env.example` を `.env` にコピーして埋める（`cdk deploy` の CfnOutput に対応）。

開発時に実 API へ接続する場合は `.env` に `VITE_API_BASE_URL` を設定する。Vite dev サーバーが `/api` をその URL の origin へプロキシするため、ブラウザからは常に同一 origin の `/api` を叩く。

## ビルド

```bash
pnpm --filter @page-share/web build
```

成果物は `dist/client`（静的ファイル）。CloudFront の 404 rewrite 先は `/_shell.html`。

## 機能

- Cognito Hosted UI によるログイン（Authorization Code + PKCE、`oidc-client-ts`）
- アップロード画面（単一ファイル / ディレクトリ / drag & drop、slug 指定、保存期間選択）

## 未実装（Phase 5 以降）

- My Pages（一覧・URL コピー・保存期間変更・削除）
