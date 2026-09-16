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

### Google ログイン（任意）

使わないならこの節は飛ばす。ローカルユーザーだけで動く。

GCP のコンソールで、Workspace の組織の下にあるプロジェクトを選んで操作する。Cognito のドメインはデプロイ前から `okibasho-<account>.auth.<region>.amazoncognito.com` に決まっている。

1. Google Auth Platform の「対象」で、ユーザーの種類を「内部」にする。選べないならプロジェクトが組織の下に無い
2. 「ブランディング」でアプリ名とサポートメールを入れ、承認済みドメインに `amazoncognito.com` を足す
3. 「データアクセス」のスコープに `openid` `email` `profile` を足す
4. 「クライアント」で、種類「ウェブ アプリケーション」のクライアントを作る
   - 承認済みの JavaScript 生成元: `https://okibasho-<account>.auth.<region>.amazoncognito.com`
   - 承認済みのリダイレクト URI: `https://okibasho-<account>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
5. 作成直後に JSON をダウンロードする。client secret は後から見られないことがある

client secret を Secrets Manager に置き、client ID を `.env` の `GOOGLE_CLIENT_ID` に書く。

```bash
aws secretsmanager create-secret --name okibasho/google-client-secret \
  --secret-string "$(jq -r .web.client_secret client_secret_*.json)"
jq -r .web.client_id client_secret_*.json
```

JSON は登録後に消す。secret を作り直したときは `put-secret-value` で上書きしてから `cdk deploy` し直す。

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

Google ログインを設定したなら、メンバーは初回ログインで自動的に作られるので、この手順は要らない。

ローカルユーザー（ID / パスワード）は Google を使わないときのメンバーと、デバッグ用に作る。メールは `EMAIL_DOMAIN` のアドレスを小文字で、`+` を付けずに指定する（外れると PreSignUp が拒否する）。Google と併用するなら、実在する Google アカウントと重ならないアドレス（例: `okibasho-debug@example.jp`）にする。Google に移る前のローカルユーザーは、本人が Google で初回ログインする前に `admin-delete-user` で消しておく。ページはメールアドレスで紐づくので消えない。

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

- **鍵の作り直し**: `pages-viewer-auth.ts` の `generation` を 1 増やして `cdk deploy`。新しい世代の鍵ペアが作られ、旧世代は消える。発行済みの Cookie は無効になり、再ログインが走る
- **証明書**: DNS 検証のレコードが残っている限り ACM が自動更新する
- **撤去**: `pnpm --filter @okibasho/infra exec cdk destroy --all`。pages バケットは残るので、不要なら手で空にして消す。バージョニングを有効にしているため、空にするときは旧バージョンと削除マーカーも消す（コンソールの「空にする」はどちらも消す）。詳細は [architecture.md](architecture.md) の「スタック削除」
