# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。方針は「縦に薄く」、統合リスクの高いところを最小構成で早く一周させる。

## 現状

CloudFront のデフォルトドメインで初回デプロイ済み。web / CLI から Cognito ローカルユーザーでログインし、Identity Pool の一時クレデンシャルで S3 に直接 PutObject / GetObject / DeleteObject / ListObjectsV2 する構成が動いている。`/p/<user>/<slug>/` の内部配信と `/s/<tag><share-id>/` の外部共有配信もどちらも実装済みで、KVS への投影と期限切れページの削除は PageMaintenance Lambda が 1 時間ごとのスケジュールで行う（S3 イベントによる該当ページだけの即時投影も別経路で動く）。

まだ入っていないのは、独自ドメインと Signed Cookie による閲覧認証、Google IdP、CLI の npm 配布、CI である。

## 残っている作業

### 独自ドメインと閲覧認証

設計は [architecture.md](architecture.md) の「独自ドメイン」「内部ページの閲覧（Signed Cookie）」「CDK」節に決めてある。2 つの PR に分け、1 つ目だけでもデプロイできる状態にする。ドメイン無しでも synth・deploy できることは両方の PR で保つ。

PR 1: ドメインの付け替え（`packages/infra` のみ）

- [ ] `config.ts` を `SERVICE_DOMAIN` / `CERTIFICATE_ARN` / `HOSTED_ZONE_ID` / `HOSTED_ZONE_NAME` に置き換える。pages と app のホスト名は導出し、組み合わせの不備は synth で止める。`.env.example` は更新済み
- [ ] `ServiceDomain` Construct（`constructs/service-domain.ts`）。`Certificate.fromCertificateArn`、`HostedZone.fromHostedZoneAttributes`（渡されたときだけ）、pages / app の `{ domainName, certificate }`、Distribution を受け取って Alias レコード（pages は A のみ。IPv6 を無効にしているため。app は A と AAAA）を作るメソッド
- [ ] `PagesDelivery` / `AppDelivery` に `customDomain?: { domainName, certificate }` を足し、`domainName`（独自ドメインか Distribution ドメイン）を公開する。Distribution の `domainNames` / `certificate` は props の spread で渡すだけにする
- [ ] `Auth` の `appDomain` / `appDistributionDomain` を `appDomainName` 1 つにまとめる。CfnOutput（`PagesBaseUrl` / `AppUrl`）と CORS の許可 origin も `domainName` から組み立てる。Hosted Zone を渡さないときのために `PagesDistributionDomainName` / `AppDistributionDomainName` を Output に足す
- [ ] `pages-router.js` に app の URL を埋め込み、`/` を app へ 302 する（ドメインの有無に関係なく常に）。`pages-router.test.ts` に追加
- [ ] snapshot テストにドメインあり（固定の ARN・Hosted Zone）を追加し、alias・証明書・Alias レコードをアサートする
- [ ] `packages/cli/src/config.ts` と `constructs/auth.ts` に残る `share.example.jp` の例を `okibasho.example.com` に直す

受け入れ: `SERVICE_DOMAIN` 未設定で今までどおり synth・deploy でき、設定すると `PagesBaseUrl` が `https://okibasho.example.com`、`AppUrl` が `https://app.okibasho.example.com/` になり、ブラウザで両方開ける。apex の `/` は app へ飛ぶ。

PR 2: Signed Cookie 閲覧認証（`packages/infra` と `packages/web`）

- [ ] `PagesViewerAuth` Construct（`constructs/pages-viewer-auth.ts`）。SSM の公開鍵から `PublicKey` と `KeyGroup`、発行 Lambda（`lambda/pages-cookie/`、`NodejsFunction`、arm64）、Function URL（Lambda OAC）。秘密鍵のパラメータへの `ssm:GetParameter` を Lambda に付与
- [ ] 発行 Lambda。JSON ボディの `idToken` を `aws-jwt-verify` で検証し、`@aws-sdk/cloudfront-signer` の `getSignedCookies` でカスタムポリシー（`https://<pages>/p/*`、24 時間）に署名、`Domain=<サービスドメイン>; Path=/p; Secure; HttpOnly; SameSite=Lax; Max-Age=86400` で 3 つの Cookie を返す。検証失敗は 401、ボディ不正は 400。成功・失敗をログに出す（トークンは出さない）
- [ ] `AppDelivery` に `/auth/*` ビヘイビアを足すメソッド（`allowedMethods: ALLOW_ALL`、キャッシュ無効、`x-amz-content-sha256` を含めて全ヘッダを転送する origin request policy）。スタックで `PagesViewerAuth` があるときだけ呼ぶ
- [ ] `PagesDelivery` に `viewerAuth?: { keyGroup }` を足し、デフォルトビヘイビアの `trustedKeyGroups` と 403 → `/errors/403.html` のカスタムエラーレスポンスを、渡されたときだけ設定する。`/s/*` と `/errors/*` には付けない
- [ ] `static/errors/403.html`。`/p/` で始まるパスだけ `https://<app>/pages-login?return=<元URL>` へ飛ばす。60 秒以内に飛ばした直後なら固定文言。app の URL は `BucketDeployment` の `Source.data` で埋める（404.html と同じ `errors/` に置く）
- [ ] web に `/pages-login` ルート。`return` を検証（`VITE_PAGES_BASE_URL` と同じ origin、`/p/` 始まり）し、`POST /auth/pages-cookie`（`x-amz-content-sha256` 付き）してから `location.replace(return)`。表示は LoadingShell。`/callback` がログイン前の `/pages-login?return=...` を復元できるようにする
- [ ] snapshot（ドメインあり）に Key Group・`/auth/*`・403 を足し、ドメイン無しでは存在しないことをアサートする。Lambda は JWT 検証と署名を差し替えて単体テストする

受け入れ: 未ログインで pages の URL を開くとログインへ誘導され、ログイン後に元のページが表示される。Cookie 発行後 24 時間は再ログインなしで別ページも見られる。`/s/*` は Cookie なしで今までどおり見られる。ドメイン無しの synth・deploy は変わらない。

デプロイ後に確認する点:

- Lambda OAC 越しの POST が通ること（`x-amz-content-sha256` が無いと 403 になるはず。`Authorization` は CloudFront が上書きするためボディで渡す設計にしている）
- `StringParameter.valueForStringParameter` で複数行の PEM が `PublicKey` に入ること。入らなければ `valueFromLookup`（`cdk.context.json` は git 管理外）に切り替える
- viewer-request の CloudFront Function と Signed Cookie の検証のどちらが先か。Cookie 無しで `/` を開いたとき、302 で app へ行くか、403 ページ経由で app へ行くか
- Geo restriction の 403 で `/s/*` を開いたとき、403.html が固定文言を出して app へ飛ばさないこと

Google IdP とメールドメイン制限:

- [ ] Cognito に Google IdP を追加する
- [ ] PreSignUp トリガーでメールドメインを検証し、Workspace ドメイン外のアカウントはサインアップできないようにする

CLI の npm 配布:

- [ ] `packages/cli/package.json` を公開設定にし、`npx okiba` で実行できるようにする

CI:

- [ ] GitHub Actions で typecheck / test / synth を回す
- [ ] GitHub Actions OIDC + 引受ロールで `cdk deploy` できるようにする（アクセスキーは置かない）

入力検証の詰め:

- [ ] slug 規則の確定を含め、残っている検証の穴を塞ぐ

## デプロイ後に確認したい点

- 存在しないパスで `errors/404.html` が返り、S3 のキーが見えないこと（デプロイ後の確認は未了）
- 不正な形式（33 文字でない、`/^[A-Za-z0-9_-]{33}$/` に合わない）の id が 404 になること
- viewer-request の CloudFront Function が `Authorization` ヘッダを読めること（cache policy に含めていなくても）。`Authorization` ヘッダを削除して転送しても OAC の署名が壊れないこと
- 401 でブラウザの認証ダイアログが出ること
- `Buffer` / `crypto.createHash` / `Number.isInteger` が CloudFront Functions runtime 2.0 で動き、コードサイズとコンピュート使用率が上限内に収まること
- `meta/` 配下の JSON の作成・削除・書き換えが数秒〜十数秒で KVS へ反映されること。S3 通知を止めても 1 時間以内の定期処理で追いつくこと
- 共有を停止・削除した旧 id が 404 のままであること
- SigV4A 署名（`@aws-sdk/signature-v4a` の副作用 import）が Lambda 実行環境で通るか
- `NodejsFunction` の bundling（pnpm workspace 特有の PATH 調整を含む）が CI で動くか
- CloudWatch Logs Insights で PageMaintenance Lambda の `Init Duration` / `Duration` を集計する。共有を ON にしてから `/s/` が 404 以外を返すまでの時間を curl のループで測り、連続して 2〜3 ページを操作したときの値（スロットルの影響）も見る
- 存在しない KVS キーへの `UpdateKeys` の delete が実際にどう振る舞うか。`kvs-client.ts` は `ResourceNotFoundException` が起きたときだけ `GetKey` で存在を確かめる実装にしているため、これが実際に必要な分岐かどうかを確認する
- 上記の計測でスロットル待ちが残るようなら、`reservedConcurrentExecutions: 1` を外す検討をする（外す場合は「Describe（ETag）→ metadata の Get → UpdateKeys(IfMatch)」の順に処理を組み直す）

## 見送った案

- `expiresAt` を KVS に入れて router で判定する案。正本は metadata のままなので二重管理にはならないが、社内 `/p/` と同じ許容範囲で足りるので、router を小さく保つほうを取った
- tag の衝突対策（書き込み前の占有チェック）。66bit なら 1 万ページでも偶然の衝突は 10⁻¹³ 程度
- DynamoDB への移行。一覧の N+1 と全件走査は消えるが構成要素が増える。ページ数が数百を超えて一覧が重くなったら再検討する

## ビルド成果物のデプロイ

App Distribution の UI 用 bucket へは、`cdk deploy` とは別に手でアップロードする。`cdk synth` が web のビルドに依存する形にしたくないため、CDK の BucketDeployment は使わない。

```bash
pnpm --filter @okibasho/web build
aws s3 sync packages/web/dist/client s3://<AppBucketName> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'
```

Cache-Control はアップロード時に指定しない。CloudFront の Response Headers Policy が behavior ごとに付与する（`/assets/*` は `public, max-age=31536000, immutable`、`_shell.html` を含むそれ以外は `no-cache`）。ハッシュ付きアセットは長期キャッシュしてよく、`_shell.html` は毎回再検証させるためデプロイのたびに invalidation を打つ。

## 並行の指針

- 基本は「CDK の縦切り 1 本 + 並行 1 本」まで
- 分担はパッケージ単位にする。パッケージが違えば worktree 分離は不要
- `pnpm-lock.yaml` が唯一の衝突点なので、依存を追加するタスクを同時に走らせない
- タスクは「1 タスク = 1 コミットできる粒度 + 受け入れ条件」で切って渡す
