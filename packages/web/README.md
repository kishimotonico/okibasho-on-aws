# web

管理アプリ（app 側）のフロントエンド。

TanStack Start（React）を使う。SPA モード + prerender で静的ファイルとしてビルドし、S3 origin から配信する。server functions / SSR は使わない。ブラウザから Cognito Identity Pool の一時クレデンシャルで S3 を直接操作する。

## 開発

```bash
pnpm --filter @okibasho/web dev
```

接続先は `packages/web/.env.example` を `.env` にコピーし、`cdk deploy` の CfnOutput から埋める。デプロイ（`pnpm ship`）は `.env` を使わない。

## ビルド

```bash
pnpm --filter @okibasho/web build
```

成果物は `dist/client`（静的ファイル）。CloudFront の 404 rewrite 先は `/_shell.html`。

## 機能

- 全ページログイン必須。未ログインで開くと即 Cognito Managed Login（Authorization Code + PKCE、`oidc-client-ts`）にリダイレクトする。ログイン画面やログインボタンは持たない。例外は `/callback` のみ
- `/`: 上にアップロード（単一ファイル / フォルダ / drag & drop、公開URL の slug 指定は任意で省略時は自動生成、保存期間選択）、下にアップロード済みページ（開く、URL コピー、保存期間の変更、削除。並びは作成日時の新しい順）。一覧の「再アップロード」はフォームに slug をセットしてスクロールする
- ヘッダー帯はない。ログアウトは右上のユーティリティメニュー。ブランドはフォーム中央の箱アイコンと `okibasho`
