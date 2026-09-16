# デプロイ手順

初回構築から運用までの手順。設計は [architecture.md](architecture.md) にあり、ここでは操作だけを書く。コマンドはリポジトリのルートで実行する。AWS CLI はデプロイ先のプロファイルとリージョン（例: `ap-northeast-1`）が既定になっている前提で、リージョンの指定は us-east-1 が要るところだけ明示する。

## 1. 前提

```bash
pnpm install
cp packages/infra/.env.example packages/infra/.env    # EMAIL_DOMAIN は必須
pnpm --filter @okibasho/infra exec cdk bootstrap        # アカウント・リージョンごとに 1 回
```

独自ドメインを使わないなら 2 を飛ばして 3 へ進む。そのときは CloudFront のデフォルトドメインで動き、内部ページ（`/p/*`）はログインなしで見られる。

## 2. 独自ドメインの準備（任意）

サービスドメインを 1 つ決める（例: `okibasho.example.com`）。pages がその apex、管理 UI が `app.okibasho.example.com` になる。

### 2-1. ACM 証明書（us-east-1）

CloudFront の制約で us-east-1 に作る。SAN は apex と `app.` の 2 つ。

```bash
aws acm request-certificate --region us-east-1 \
  --domain-name okibasho.example.com \
  --subject-alternative-names app.okibasho.example.com \
  --validation-method DNS \
  --query CertificateArn --output text
```

DNS 検証用の CNAME を取り出す（2 つ出るが、同じ値のことが多い）。

```bash
aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
  | jq -r '.Certificate.DomainValidationOptions[].ResourceRecord | "\(.Name) CNAME \(.Value)"' | sort -u
```

Route 53 の Hosted Zone に置く場合:

```bash
aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch '{
  "Changes": [{ "Action": "UPSERT", "ResourceRecordSet": {
    "Name": "<Name>", "Type": "CNAME", "TTL": 300,
    "ResourceRecords": [{ "Value": "<Value>" }] } }]
}'
```

`ISSUED` になるまで待つ（数分）。証明書は CNAME が残っている限り自動更新される。

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn <arn>
```

### 2-2. Signed Cookie の鍵ペア

内部ページの閲覧認証に使う。公開鍵も秘密鍵も SSM Parameter Store に置く。名前は固定で、CDK と Lambda がこの名前を読む。

```bash
openssl genrsa -out pages-signing.pem 2048
openssl rsa -in pages-signing.pem -pubout -out pages-signing.pub
aws ssm put-parameter --name /okibasho/pages-signing/public-key  --type String       --value file://pages-signing.pub
aws ssm put-parameter --name /okibasho/pages-signing/private-key --type SecureString --value file://pages-signing.pem
rm pages-signing.pem pages-signing.pub
```

### 2-3. .env

`packages/infra/.env` に書く。

```bash
SERVICE_DOMAIN=okibasho.example.com
CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/...
# Route 53 に Alias レコードを作らせるなら（他サービスと共用のゾーンでよい）
HOSTED_ZONE_ID=Z0123456789ABCDEFGHIJ
HOSTED_ZONE_NAME=example.com
```

Hosted Zone の ID は次で引ける。

```bash
aws route53 list-hosted-zones-by-name --dns-name example.com --query 'HostedZones[0].Id' --output text
```

## 3. スタックのデプロイ

```bash
pnpm --filter @okibasho/infra diff     # 変更内容の確認
pnpm --filter @okibasho/infra deploy
```

Output は後の手順で使う。まとめて表示するには:

```bash
aws cloudformation describe-stacks --stack-name Okibasho \
  | jq -r '.Stacks[0].Outputs[] | "\(.OutputKey)=\(.OutputValue)"'
```

Hosted Zone を渡さなかった場合は、外部の DNS に次を登録する。apex は CNAME を置けない DNS が多いので ALIAS / ANAME 相当の機能を使う。

| 名前 | 向き先（Output） |
| --- | --- |
| `okibasho.example.com` | `PagesDistributionDomainName` |
| `app.okibasho.example.com` | `AppDistributionDomainName` |

## 4. ユーザーの作成

当面は Cognito のローカルユーザーで運用する（Google IdP は未導入）。メールアドレスが S3 のキーになるので小文字で作る。

```bash
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> \
  --username tanaka@example.jp \
  --user-attributes Name=email,Value=tanaka@example.jp Name=email_verified,Value=true
```

仮パスワードがメールで届き、初回ログイン時に変更を求められる。

## 5. 管理 UI のビルドとアップロード

`packages/web/.env` を Output から埋める（対応表は `packages/web/.env.example`）。`VITE_PAGES_BASE_URL` は `PagesBaseUrl` で、独自ドメイン設定時は `https://okibasho.example.com` になる。

```bash
pnpm --filter @okibasho/web build
aws s3 sync packages/web/dist/client s3://<AppBucketName> --delete
aws cloudfront create-invalidation --paths '/*' --distribution-id \
  "$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='trusted 管理UI配信'].Id" --output text)"
```

`cdk synth` を web のビルドに依存させたくないため、CDK の BucketDeployment ではなく手でアップロードする。Cache-Control はアップロード時に付けない。CloudFront の Response Headers Policy が `/assets/*` を長期キャッシュ、それ以外（`_shell.html` を含む）を `no-cache` にするので、デプロイのたびに invalidation を打てば十分。

## 6. CLI の設定

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

## 7. デプロイ後の確認

独自ドメイン設定時に、ブラウザとシェルから見る。

```bash
curl -sI https://okibasho.example.com/            | head -1     # 302（app へ）
curl -sI https://okibasho.example.com/p/x/y/      | head -1     # 403（Cookie 無し。本文は errors/403.html）
curl -sI https://okibasho.example.com/nothing     | head -1     # 404
curl -sI https://app.okibasho.example.com/        | head -1     # 200
```

ブラウザで確認すること:

- 未ログインで `/p/<user>/<slug>/` を開くとログインに誘導され、ログイン後に元のページが表示される
- そのまま同じブラウザで別の内部ページも開ける（Cookie は 24 時間）
- 共有 URL `/s/...` は Cookie なしで開ける

うまくいかないときは、発行 Lambda（`Okibasho-PagesViewerAuthCookieIssuer...`）のログを見る。`{"result":"issued"}` が出ていれば Cookie は発行されている。

```bash
aws logs tail "$(aws logs describe-log-groups --log-group-name-prefix /aws/lambda/Okibasho-PagesViewerAuth --query 'logGroups[0].logGroupName' --output text)" --since 10m
```

初回デプロイでまだ実機確認できていない点は [roadmap.md](roadmap.md) の「デプロイ後に確認する点」にある。

## 8. 運用

- **鍵の作り直し**: 2-2 のパラメータを上書きしてから `cdk deploy`。公開鍵が変わるので CloudFront の `PublicKey` が置き換わり、古い Cookie は 403 になって再ログインが走るだけで済む
- **証明書の差し替え**: 新しい ARN を `CERTIFICATE_ARN` に書いて `cdk deploy`。古い証明書は Distribution から外れてから削除する
- **撤去**: `pnpm --filter @okibasho/infra exec cdk destroy`。pages バケットは残るので、不要なら手で空にして消す。SSM のパラメータと ACM 証明書も手で消す。詳細は [architecture.md](architecture.md) の「スタック削除」
