# web

管理アプリ（app 側）のフロントエンド。

TanStack Start（React）を使う。SPAモード + prerenderで静的ファイルとしてビルドし、S3 origin から配信する。server functions / SSR は使わない。

やること:

- Cognito 経由の Google ログイン
- アップロード画面（単一ファイル / ディレクトリ / drag & drop、名前の指定）
- My Pages（一覧・URLコピー・保存期間変更・削除）
