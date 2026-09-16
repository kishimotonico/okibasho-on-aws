# デプロイ手順

初回構築から運用までの手順。設計は [architecture.md](architecture.md) にあり、ここでは操作だけを書く。コマンドはリポジトリのルートで実行する。AWS CLI はデプロイ先のプロファイルとリージョン（例: `ap-northeast-1`）が既定になっている前提。

## 1. 準備

```bash
pnpm install
cp packages/infra/.env.example packages/infra/.env
```

`.env` に `EMAIL_DOMAIN`（必須）を書く。独自ドメインを使うなら `SERVICE_DOMAIN` / `HOSTED_ZONE_ID` / `HOSTED_ZONE_NAME` も書く。Hosted Zone は同じアカウントの Route 53 にある共用のゾーンでよく、CDK が作るのは証明書の検証用 CNAME と pages / app の Alias レコードだけで、他のレコードには触れない。

```bash
aws route53 list-hosted-zones-by-name --dns-name example.com --query 'HostedZones[0].Id' --output text
```

CDK の bootstrap はアカウント・リージョンごとに 1 回。独自ドメインを使うなら証明書スタックのために us-east-1 も要る。

```bash
pnpm --filter @okibasho/infra exec cdk bootstrap
pnpm --filter @okibasho/infra exec cdk bootstrap aws://<account>/us-east-1   # 独自ドメイン設定時
```

## 2. デプロイ

```bash
pnpm --filter @okibasho/infra diff
pnpm --filter @okibasho/infra exec cdk deploy --all
```

独自ドメイン設定時は、証明書の発行と DNS 検証、Alias レコード、Signed Cookie の鍵ペアまでここで揃う。証明書の検証で数分待つ。

Output は後の手順で使う。

```bash
aws cloudformation describe-stacks --stack-name Okibasho \
  | jq -r '.Stacks[0].Outputs[] | "\(.OutputKey)=\(.OutputValue)"'
```

## 3. ユーザーの作成

当面は Cognito のローカルユーザーで運用する（Google IdP は未導入）。メールアドレスが S3 のキーになるので小文字で作る。

```bash
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> \
  --username tanaka@example.jp \
  --user-attributes Name=email,Value=tanaka@example.jp Name=email_verified,Value=true
```

仮パスワードがメールで届き、初回ログイン時に変更を求められる。

## 4. 管理 UI のビルドとアップロード

`packages/web/.env` を Output から埋める（対応表は `packages/web/.env.example`）。`VITE_PAGES_BASE_URL` は `PagesBaseUrl` で、独自ドメイン設定時は `https://okibasho.example.com` になる。

```bash
pnpm --filter @okibasho/web build
aws s3 sync packages/web/dist/client s3://<AppBucketName> --delete
aws cloudfront create-invalidation --paths '/*' --distribution-id \
  "$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='trusted 管理UI配信'].Id" --output text)"
```

`cdk synth` を web のビルドに依存させたくないため、CDK の BucketDeployment ではなく手でアップロードする。Cache-Control はアップロード時に付けない。CloudFront の Response Headers Policy が `/assets/*` を長期キャッシュ、それ以外（`_shell.html` を含む）を `no-cache` にするので、デプロイのたびに invalidation を打てば十分。

## 5. CLI の設定

`~/.config/okibasho/config.json`（`XDG_CONFIG_HOME` があればその下）か、`OKIBA_*` の環境変数で渡す。項目と Output の対応は `npx okiba --help` に出る。

```json
{
  "issuer": "<OidcIssuerUrl>",
  "clientId": "<CliAppClientId>",
  "identityPoolId": "<IdentityPoolId>",
  "userPoolId": "<UserPoolId>",
  "region": "<Region>",
  "bucket": "<PagesBucketName>",
  "pagesBaseUrl": "<PagesBaseUrl>"
}
```

## 6. デプロイ後の確認

独自ドメイン設定時に、ブラウザとシェルから見る。

```bash
curl -sI https://okibasho.example.com/            | head -1     # 302（app へ）
curl -s  https://okibasho.example.com/p/x/y/      | rg -c pages-login   # 1（Cookie 無しの 403 が errors/403.html で返っている）
curl -sI https://okibasho.example.com/nothing     | head -1     # 404
curl -sI https://app.okibasho.example.com/        | head -1     # 200
```

2 行目が 0 なら CloudFront 標準の 403 が返っていて、署名検証の 403 にカスタムエラーレスポンスが効いていない。

ブラウザで確認すること:

- 未ログインで `/p/<user>/<slug>/` を開くとログインに誘導され、ログイン後に元のページが表示される
- そのまま同じブラウザで別の内部ページも開ける（Cookie は 24 時間）
- 共有 URL `/s/...` は Cookie なしで開ける

うまくいかないときは発行 Lambda のログを見る。`{"result":"issued"}` が出ていれば Cookie は発行されている。

```bash
aws logs tail "$(aws logs describe-log-groups --log-group-name-prefix /aws/lambda/Okibasho-PagesViewerAuth --query 'logGroups[0].logGroupName' --output text)" --since 10m
```

初回デプロイでまだ実機確認できていない点は [roadmap.md](roadmap.md) の「デプロイ後に確認する点」にある。

## 7. 運用

- **鍵の作り直し**: `SigningKeyPair` の `generation` を進めて `cdk deploy`。古い Cookie は 403 になって再ログインが走るだけで済む
- **証明書**: DNS 検証のレコードが残っている限り ACM が自動更新する
- **撤去**: `pnpm --filter @okibasho/infra exec cdk destroy --all`。pages バケットは残るので、不要なら手で空にして消す。詳細は [architecture.md](architecture.md) の「スタック削除」
