# アーキテクチャ

本書が設計の正本である。決定済みの設計だけを書く。

## 全体構成

```text
   ブラウザ（管理UI）                        CLI（okiba）
        │                                         │
        │  Authorization Code + PKCE              │  同左
        ▼                                         ▼
   Cognito User Pool（Google IdP / Managed Login / PreSignUp でドメイン制限）
        │  id_token
        ▼
   Cognito Identity Pool
        │  AssumeRoleWithWebIdentity + TagSession（PrincipalTag: email）
        ▼
   一時 IAM クレデンシャル
        │  PutObject / GetObject / DeleteObject / ListObjectsV2
        │  ※ IAM が pages/<email>/* に限定。他人の prefix は触れない
        ▼
   S3（pages バケット・完全 private・Public Access Block）
        ▲
        │ meta/配下のJSONの作成・削除で該当ページだけ即時 / 毎時の期限切れ削除 /
        │ 日次のKVS全件突き合わせ
   Lambda（PageMaintenance、同時実行1。アラームは持たない）
        │ UpdateKeys（IfMatch）
        ▼
   CloudFront KeyValueStore（tag → S3 prefix / share-id / パスワード / IP 完全一致リストの投影。
                             1 ページ 1 キーで、停止・削除・期限切れはキーの削除、
                             再発行は同じキーの上書き）
        ▲
        │ OAC                              │ 参照
   CloudFront（okibasho.example.com / UNTRUSTED、単一 Distribution）
        └ デフォルトビヘイビア＝/p/*（内部。/ は app へ 302。/p/ 以外は 404。
             Signed Cookie 必須（独自ドメイン設定時のみ））
             CloudFront Function: /p/<user>/... → /pages/<user>@<domain>/... + index.html 補完
        └ /s/* ビヘイビア（外部共有。KVS 参照、Basic / IP 制限、Signed Cookie は付けない）
             CloudFront Function: /s/<tag><share-id>/... → KVS の投影先へ rewrite
        └ /errors/* ビヘイビア（カスタムエラーレスポンス専用。関数なし。
             BucketDeployment が pages バケットの errors/ に配置した固定ページを配信）
        └ 共通設定: errorResponses（404 → /errors/404.html。独自ドメイン設定時は
          403 → /errors/403.html も足し、app のログイン導線にする）/
          Response Headers Policy（Referrer-Policy: no-referrer 等）/ Geo restriction / IPv6 無効化

   CloudFront（app.okibasho.example.com / TRUSTED）
        ├ /auth/*  → Lambda Function URL（Signed Cookie 発行。独自ドメイン設定時のみ）
        └ /*       → S3（管理UIの静的ファイル）
```

使う AWS サービス: S3 / CloudFront / CloudFront KeyValueStore / Cognito User Pool / Cognito Identity Pool / Lambda（3つ） / EventBridge Rule / Route 53 / ACM。IaC は AWS CDK（TypeScript）。

Lambda は次の 3 つ。どれも小さく独立している。API Gateway は無い。認可は IAM ポリシーに委譲する。

- Signed Cookie 発行（独自ドメイン設定時のみ作る）
- PreSignUp（メールドメイン制限）
- PageMaintenance（`meta/` 配下の metadata の `share` を CloudFront KeyValueStore へ投影しつつ、期限切れページの削除も担う。詳細は「外部共有」節と「保存期間」節）

このほかに、CDK の `BucketDeployment`（pages バケットの `errors/` に固定ページを配置するためだけのカスタムリソース Lambda）が存在する。これは IAM の境界の外にある処理として次節で扱う。

CDK のスタックはメインの 1 つ（+ us-east-1 の証明書だけのスタック）とし、機能的・概念的な境界は Construct で表現する（一覧は「CDK」節）。Stack 本体は各 Construct の組み立てだけを行う。

DynamoDB、WAF、Lambda@Edge、API Gateway、S3 Lifecycle、presigned URL は使わない。CloudFront KeyValueStore は外部共有の投影先として採用したため、この対象からは外れる。

## origin と URL 空間

trusted な管理アプリと untrusted な共有ページを別 origin に分ける。ここでいう origin は scheme・hostname・port の組である。

| origin | 信頼 | 用途 |
| --- | --- | --- |
| `app.okibasho.example.com` | trusted | ログイン、アップロード UI、My Pages、Signed Cookie 発行 |
| `okibasho.example.com` | untrusted | アップロードされた HTML・JS・CSS・画像 |

アップロードされた HTML には任意の JavaScript（AI 生成コードを含む）が入りうる。管理アプリと同一 origin にすると DOM・storage・Cookie へアクセスできてしまう。この境界にブラウザの Same-Origin Policy をそのまま使う。

| URL | 公開範囲 | 認証 | Distribution | S3 key |
| --- | --- | --- | --- | --- |
| `https://okibasho.example.com/p/<user>/<slug>/` | 内部（ログイン必須） | Signed Cookie 必須（独自ドメイン設定時） | pages（`/p/*`） | `pages/<email>/<slug>/` |
| `https://okibasho.example.com/s/<tag><share-id>/` | 外部（ページ作成者が発行した URL を知っている人） | share-id自体が推測困難な秘匿情報（基本の保護）＋任意で自動生成パスワードによるBasic認証＋任意でIP制限 | pages（`/s/*`） | KVS の投影から解決（実体は `pages/<email>/<slug>/`） |

`<user>` はメールのローカル部だけを見せる。全員が同じ Workspace ドメインなので、ドメイン部は CloudFront Function で静的に補完する。

内部 URL のパスに `/p/` を置くのは、外部共有用の `/s/` と名前空間を分けるためである。

ホスト名は pages と app の 2 つとする。外部への URL 共有はページ単位のオプトインとして実装した（詳細は「外部共有」節）。共有していないページは従来どおりログイン必須である。

### 独自ドメイン

サービスドメインを 1 つ決め（例: `okibasho.example.com`）、pages をその apex に、app を `app.` サブドメインに置く。設定はサービスドメイン 1 つだけで、ホスト名は導出する。

| 役割 | ホスト名 | 導出 |
| --- | --- | --- |
| pages | `okibasho.example.com` | `SERVICE_DOMAIN` そのもの |
| app | `app.okibasho.example.com` | `app.` + `SERVICE_DOMAIN` |
| Signed Cookie の `Domain` | `okibasho.example.com` | `SERVICE_DOMAIN` そのもの |

pages を apex に置くのは共有 URL を短くするためである。app が apex でないことによる違いはない。Cookie の届く範囲は app が apex でも `app.` でも同じで、アップロードできるのは信頼済みのメンバーだけなので、apex に偽のログイン画面を置かれる懸念は考えない。

Signed Cookie の `Domain` はサービスドメインにする。Hosted Zone のドメイン（`example.com`）にすると、同じゾーンに同居する他サービスへ Cookie が送られてしまう。サービスドメインと Hosted Zone のドメインは別の概念として扱う。

DNS と証明書は次のとおり。

- Route 53 の Hosted Zone は他サービスのレコードも入っている共用のもの（`example.com`）を使い、サブゾーンへの委任はしない。同じ AWS アカウントにあることが前提で、ID と名前を渡す。CDK はゾーンを参照するだけで、作るレコードは証明書の DNS 検証用 CNAME と pages / app の Alias レコード（A。app は AAAA も）に限る。同じ名前のレコードが既にあればデプロイが失敗するだけで、上書きはしない。スタック削除で消えるのもこのレコードだけである
- ACM 証明書は us-east-1 の `OkibashoCertificate` スタックで作り、`CertificateValidation.fromDns` で検証まで CDK に任せる。SAN は pages と app の 2 つ。メインスタックへは CloudFormation の `Fn::GetStackOutput`（弱参照。`cdk.json` の `@aws-cdk/core:defaultCrossStackReferences: weak`）で渡す。弱参照なので、証明書スタックはメインスタックより先に消さない
- Cognito Managed Login のドメインは `amazoncognito.com` のままにする。独自ドメインにしたくなったら、証明書に `auth.` を足して `UserPoolDomain` を `customDomain` に切り替える

独自ドメインを設定しなくても、今までどおり CloudFront のデフォルトドメインでデプロイして使える。そのとき作らないのは証明書の参照・alias・Route 53 レコード・Signed Cookie 閲覧認証一式（`/auth/*`・Key Group・403 エラーページ）である。`cloudfront.net` は Public Suffix List に載っていて親ドメイン Cookie を置けないため、閲覧認証はドメインが無いと原理的に成り立たない。ドメイン無しでは内部ページ `/p/*` はログイン不要のまま配信される。

CloudFront の Distribution は app 用と pages 用の 2 つ。pages 用の 1 つに `/p/*`（内部）と `/s/*`（外部共有）の 2 ビヘイビアを持たせる。別 Distribution や第 3 ホストにはしない。理由は「外部共有」節にまとめる。

## 認可は IAM ポリシーに委譲する

owner 認可はアプリコードに置かず IAM に委譲する（[concept.md](concept.md) の優先順位: シンプル > 境界の明確さ > 低コスト）。ブラウザと CLI は Cognito Identity Pool 経由の一時 IAM クレデンシャルで S3 を直接操作し、触れられる範囲は IAM の Resource ARN と条件キーが決める。

authenticated role の権限ポリシーが唯一のセキュリティ境界である。自分のメール（PrincipalTag）prefix の `pages/` と `meta/` に対する PutObject / GetObject / DeleteObject と、`s3:prefix` 条件で同じ範囲に絞った ListBucket だけを許可する。

- 他人の prefix への Put / Get / Delete / List は `AccessDenied` になる。`pages/` と `meta/` の両方が対象で、ページ成果物と metadata（正本）を同じ条件で守る
- metadata に owner を持たせていない。所有者はキー（`pages/<email>/...` `meta/<email>/...`）そのものが表しており、認可も IAM だけが行うため、アプリのバグで他人のページを壊せない
- `s3:prefix` 条件があるため、`ListObjectsV2` には必ず prefix を渡す。渡さないと `AccessDenied`
- CDK のレビュー時はこのポリシーと、ロールの信頼ポリシー（次節）を重点的に見る

IAM の境界の外にある処理が 2 つある。いずれもレビュー対象である。

- PageMaintenance Lambda: `meta/` 配下の metadata を全件読める（外部共有の平文パスワードも含む）。`s3:GetObject` は `meta/*` に絞っており、ページ成果物本体は読めない。`s3:DeleteObject` は期限切れ削除のために `pages/*` と `meta/*` の両方に及ぶ、prefix 制限の無い削除権限を持つ。書き込みは CloudFront KeyValueStore の `UpdateKeys`（と確認用の `GetKey`）で、pages バケットへの書き込み権限（`PutObject`）は持たない
- エラーページ配置ロール（`BucketDeployment` のカスタムリソース Lambda）: `errors/` 配下にだけ書ける。CDK は destination バケット全体への書き込みを付与するため、bucket policy の Deny で絞っている

これらは prefix を跨いで S3 を操作できる分、authenticated role より広い権限を持つ。デプロイ操作を行える者（PowerUser 相当のアクセス）は元々この構成の信頼境界の内側にいる前提であり、Lambda 実行ロールをユーザー単位・機能単位にこれ以上細分化することは目指さない。

## 認証

### Web

Cognito User Pool に Google Workspace を外部 IdP として連携する。Managed Login を使う（ログイン画面を自作しない）。組織の Workspace ドメインのアカウントのみ許可する。

Google IdP は任意で、`GOOGLE_CLIENT_ID` を設定したときだけ作る。Cognito のローカルユーザー（管理者作成の ID / パスワード）も併用し、Google アカウントを持たないデバッグ用ユーザーに使う。App Client は `COGNITO` と `GOOGLE` の両方を許可するので、Managed Login には両方の入口が並ぶ。クライアントは IdP を指定せずに authorize へ飛ばすだけで、Google の有無を知らない。

- Google OAuth クライアントは GCP の「内部」アプリとして作る。組織外の Google アカウントは Google 側の同意画面で弾かれる
- client ID は秘密ではないので環境変数で渡す。client secret は Secrets Manager の `okibasho/google-client-secret`（プレーンテキスト）に手で置き、CDK は `SecretValue.secretsManager` で参照する。Cognito の IdP リソースは CloudFormation の `ssm-secure` 動的参照に対応していないため、SSM Parameter Store は使わない
- 属性マッピングは `email` と `email_verified`。`email_verified` は明示的にマッピングしないと PreSignUp に届かない
- App Client は IdP を名前の文字列で参照するため、CloudFormation の依存が付かない。`client.node.addDependency(provider)` で IdP を先に作る

メールドメイン制限は PreSignUp Lambda トリガーで実装する。Google の有無に関係なく常に置き、ローカルユーザーの作成（`PreSignUp_AdminCreateUser`）にもかける。S3 のキーを必ず `EMAIL_DOMAIN` 配下にするためである。次のどれかに当たれば reject する。

- メールのドメインが `EMAIL_DOMAIN` と一致しない
- メールに大文字か `+` を含む
- Google から来た（`PreSignUp_ExternalProvider`）のに `email_verified` が `true` でない

デバッグ用ユーザーは実在しないアドレス（例: `okibasho-debug@example.jp`）で作る。実在する Google アカウントと同じメールでローカルユーザーを作ると、同じメールの User Pool ユーザーが 2 つでき、同じ S3 prefix を共有してしまう。

将来 Google だけにするときは、App Client から `COGNITO` を外して `GOOGLE_CLIENT_ID` を必須にし、web と CLI の authorize に `identity_provider=Google` を付けて Managed Login の選択画面を飛ばす。

App Client は 2 つ。どちらも public client（client secret なし）+ PKCE。

- web 用: callback は `https://<app のホスト名>/callback`（独自ドメイン設定時は `app.okibasho.example.com`、未設定なら CloudFront の Distribution ドメイン）。開発時は `http://localhost:3000/callback`
- cli 用: callback は `http://127.0.0.1:<port>/callback`（localhost 許可）。Cognito は callback URL をポートまで含めた完全一致で照合するため、空きポートを動的に 1 つだけ選ぶことはできない。候補ポート `8976` `8977` `8978` を登録し、空いている最初のポートを使う。全部使用中ならポートを空けるよう伝えて終了する

メールアドレスが S3 キーになる。大文字や `+` を含むアドレスを PreSignUp で拒否するのは、キーの揺れを増やさないためである。

### CLI

Web と CLI で認証方式を分けず、同じ User Pool を使う。CLI のログインは OAuth 2.0 Authorization Code + PKCE。CLI が一時的に 127.0.0.1 の HTTP サーバーを立てて callback を受ける。初回認証後は refresh token を XDG state ディレクトリ（`~/.local/state/okibasho/`、`XDG_STATE_HOME` 準拠）にパーミッション 0600 のファイルで保存し、毎回のブラウザログインを不要にする。設定ファイル（`~/.config/okibasho/`）とは置き場所を分ける。OS Credential Store は使わない（ネイティブ依存を持ち込むと単一 JS バンドル配布が崩れる）。token をログに出さない。独自の Personal API Token は作らない。

### Cognito Identity Pool

認証プロバイダは上記 User Pool。unauthenticated access は無効にする。

Attributes for access control で、User Pool の `email` クレームをプリンシパルタグ `email` にマッピングする（カスタムマッピング）。

authenticated role の信頼ポリシーは、`Federated` プリンシパルを `cognito-identity.amazonaws.com` とし、`cognito-identity.amazonaws.com:aud` が対象の Identity Pool と一致し、`amr` に `authenticated` を含むときだけ `sts:AssumeRoleWithWebIdentity` と `sts:TagSession` を許可する。`sts:TagSession` を忘れるとプリンシパルタグが乗らず、原因の分かりにくい `AccessDenied` になる。

クライアントは id_token を Identity Pool に渡し、一時 IAM クレデンシャルを得る。Cognito のアクセストークンには `email` クレームが入らないため、id_token を使う。

### 内部ページの閲覧（Signed Cookie）※独自ドメイン設定時のみ

pages Distribution のデフォルトビヘイビア（`/p/*`）に Trusted Key Group を設定する。`/s/*` と `/errors/*` には付けない。

鍵ペアはカスタムリソース（`SigningKeyPair`。Provider フレームワーク + Lambda）がデプロイ時に生成する。AWS には CloudFront 用の鍵ペアを生成するリソースが無いためである。Lambda は Node の `crypto` で RSA 2048 の鍵ペアを作り、両方を SSM Parameter Store に置き、公開鍵 PEM だけを属性で返す。秘密鍵は CloudFormation にもログにも出さない。

| パラメータ | 種類 | 使う場所 |
| --- | --- | --- |
| `/<スタック名>/pages-signing/<generation>/public-key` | String（PEM） | Update で同じ公開鍵を返すために保持する。`PublicKey` の `encodedKey` には Create / Update の戻り値（`getAttString`）を渡す |
| `/<スタック名>/pages-signing/<generation>/private-key` | SecureString（PEM） | 発行 Lambda がコールドスタート時に `GetParameter`（復号あり）で読む |

鍵ペアは generation ごとに不変で、PhysicalResourceId はその generation のパラメータのプレフィックスである。Create で生成し、Delete でその generation の 2 つを消す。`generation` を進めると Update は新しい PhysicalResourceId で新しい鍵ペアを作り、旧 generation の削除は CloudFormation が送る Delete に任せる（Rollback も同じ仕組みで元の generation に戻る）。handler は既存のパラメータを上書きしない。公開鍵が変わって `PublicKey` が置き換わり、古い Cookie は 403 になって再ログインが走るだけで済む。新旧の公開鍵を Key Group に併存させる無停止ローテーションは持たない。

発行するのは `/auth/*` の Lambda 1 つ。Function URL を Lambda OAC 付きで app Distribution の `/auth/*` ビヘイビアに紐づけ、CloudFront 経由でしか呼べないようにする。

- `POST /auth/pages-cookie`。id_token は JSON ボディ `{ "idToken": "..." }` で渡す。OAC 付きの Function URL では CloudFront が `Authorization` ヘッダを自分の SigV4 署名で上書きするため、`Authorization: Bearer` は使えない
- Lambda OAC で POST するとき、ビューアは `x-amz-content-sha256`（ボディの SHA-256 の hex）を送る必要がある。web は `crypto.subtle.digest` で計算して付ける
- `aws-jwt-verify`（AWS 公式ライブラリ）で User Pool と web 用 App Client の id_token として検証してから、`@aws-sdk/cloudfront-signer` の `getSignedCookies` でカスタムポリシー（Resource は `https://<pages>/p/*`、有効期間 24 時間）に署名する
- `Domain=<サービスドメイン>` / `Path=/p` / `Secure` / `HttpOnly` / `SameSite=Lax` / `Max-Age=86400` で `CloudFront-Policy` / `CloudFront-Signature` / `CloudFront-Key-Pair-Id` を Set-Cookie し、204 を返す。`Path=/p` にしておくと `/s/*` と app には送られない
- CORS は要らない。呼び出し元は同じ origin（app）の SPA である

Signed Cookie は閲覧専用で、漏れても内部ページの閲覧以外の権限を持たない。1 ページが複数ファイルを参照するため、Signed URL ではなく Signed Cookie を使う。有効期間は 24 時間。切れたら下記の再認証フローが走るだけなので、長さに神経質にならない。

管理 UI のセッション Cookie（もし持つなら）は `__Host-` プレフィックスを付ける。`__Host-` は `Domain` 指定付きでは設定できないため、pages 上の untrusted JS からの cookie tossing（親ドメイン Cookie の送りつけ）で app session を上書きできない。現状の web は Cookie を持たず、トークンは localStorage にある。

未ログインで閲覧 URL を開いたときのフロー:

```text
okibasho.example.com/p/<user>/<slug>/ → 403（Cookie が無い・期限切れ）
 → CloudFront カスタムエラーページ /errors/403.html
     元 URL を持って https://app.okibasho.example.com/pages-login?return=<元URL> へ location.replace
 → app: AuthGate が Cognito ログインを要求（済んでいればスキップ）
 → /pages-login: return を検証し、POST /auth/pages-cookie で Signed Cookie 発行
 → 元の pages URL へ location.replace
```

- `errors/403.html` は `errors/404.html` と同じく固定の HTML で、app の URL を `BucketDeployment` の `Source.data` でデプロイ時に埋める。パスが `/p/` で始まるときだけ app へ飛ばし、それ以外（`/s/*` の Geo restriction による 403 や `/`）は「閲覧できません」の固定文言を出す。同じブラウザで直前（60 秒以内）に app へ飛ばしたばかりなら再度は飛ばさず固定文言を出す（sessionStorage で判定）。Cookie を発行したのに 403 が続く設定ミスでループしないためである
- `/pages-login` の `return` は「`VITE_PAGES_BASE_URL` と同じ origin で、パスが `/p/` で始まる `https` の URL」だけ受け付ける。open redirect を防ぐ。それ以外は `/` へ寄せる
- `/callback` はログイン前のパスを復元する。今は `/` と `?slug=` だけを復元しているが、`/pages-login?return=...` も復元できるようにする（相対パスであることを確認して `redirect({ href })`）
- 403 のカスタムエラーレスポンスは Distribution 全体に効くが、CloudFront Function が返した 401 / 403 / 404 には適用されない。`/s/*` の share-router が返す 403 はこの導線に巻き込まれない
- viewer-request の CloudFront Function と Signed Cookie の検証のどちらが先に走るかは公式に明記されていない。どちらの順でも app に着地するよう、`/` → app の 302 は pages-router に持たせ、Cookie 無しの `/p/*` は 403 ページに任せる

ドメイン無しでは `/auth/*` ビヘイビア・Key Group・403 エラーレスポンスを作らず、web の `/pages-login` は存在するだけで誰も飛ばされない。web にドメインの有無による分岐は無い。

## S3構造

```text
pages/
  <email>/                        例: tanaka@example.jp
    <slug>/                       例: q3-report
      index.html
      assets/...

meta/
  <email>/                        例: tanaka@example.jp
    <slug>.json                   このページの正本
```

`pages/` はページ成果物（配信対象）だけを置く。metadata はその外の `meta/` に分けて置く。両方とも `<email>/<slug>` で対応する 1 ページを指す。

- `users/<sub>/<slug>.json` のようなインデックスは別途持たない。二重書き込みをしない
- My Pages = `ListObjectsV2(Bucket, Prefix: 'meta/<email>/')` のキー一覧から slug を得る（`meta/<email>/<slug>.json` の `<slug>` 部分）。各 slug の metadata を並列 GetObject して詳細を取る。数十ページなら十分。将来遅くなったら、メタ情報をキー名に埋める等の手を考える
- slug の一意性はユーザー単位。他人と衝突しないので、グローバルな slug 予約も条件付き書き込みによる排他制御も不要
- slug の許可文字は `[a-z0-9][a-z0-9_-]{0,63}`。大文字は S3 キーと URL の大文字小文字問題を避けるため受け付けず、暗黙の変換もしない。`.` で始まる名前、`/`、`..` は拒否する
- metadata（`meta/<email>/<slug>.json`）の内容:

```json
{
  "createdAt": "2026-08-26T04:00:00Z",
  "expiresAt": "2026-09-25T04:00:00Z",
  "share": {
    "id": "V1StGXR8_Z5jdHi6B-myT",
    "password": "k7mq-3xwp-9rtd-h2vn",
    "allowedIps": ["203.0.113.5"]
  }
}
```

`slug` と `owner` はキー（`meta/<email>/<slug>.json`）そのものが表すため、metadata には持たせない。表示にはキー由来の値を使う。

`expiresAt` が `null` なら無期限。クライアントが書くので自己申告だが、影響は自分の prefix とストレージコストだけで他人には及ばない。

`share` は外部共有の設定で、無ければ外部共有していない。`password` は任意（付けていなければ Basic 認証をしない）。フィールドの詳細は「外部共有」節にある。

metadata はページ成果物の prefix（配信対象）の外にあるため、CloudFront から読める心配がない。ユーザーが同名ファイルをアップロードしても正本と衝突しない。

### S3 の設定

- 完全 private + Public Access Block。S3 Website Hosting は使わない
- バケットバージョニングを有効にし、非現行バージョンは 30 日で消す（誤削除・誤上書きからの復旧余地）。利用者のロールに `s3:DeleteObjectVersion` は与えないので、利用者の操作で旧版まで消えることはない
- CORS を設定する（ブラウザから直接 PUT / LIST / DELETE するため。忘れると Web UI だけ落ちる）。許可するメソッドは GET / PUT / POST / DELETE / HEAD、ヘッダは全許可、`ExposeHeaders` に `ETag`、`MaxAgeSeconds` は 3000 とする

`POST` は `DeleteObjects` が使う。AllowedOrigins は app Distribution が公開するホスト名（独自ドメインか CloudFront のデフォルトドメイン）から組み立てる。開発時は `http://localhost:<port>` も AllowedOrigins に足す。

- S3 Lifecycle ルールとオブジェクトタグは使わない。期限切れ削除は PageMaintenance Lambda の定期処理に一本化する

CloudFront から読めるのを配信対象の prefix（`pages/`）だけに制限する bucket policy を置く。OAC には `s3:GetObject` に加えて `s3:ListBucket` を与える。存在しないファイルに 403 ではなく 404 を返すためである。403 を認証失敗、404 をファイル欠落として扱う。

## アップロード

Web と CLI は API を持たない。Identity Pool の一時クレデンシャルで S3 に直接 PutObject / ListObjectsV2 / DeleteObjects する。

slug の指定は任意。web は省略時に乱数（小文字英数字 10 文字）を自動生成し、CLI は従来どおり省略時にパス名から生成する。決定した slug を使って以降の PutObject に進む。

```text
1. Cognito ログイン（Authorization Code + PKCE）→ id_token
2. Identity Pool から一時 IAM クレデンシャルを取得
3. meta/<email>/<slug>.json を先に書く
4. ディレクトリを走査し、pages/<email>/<slug>/ 配下へ PutObject
5. 同じ prefix を List し、今回のアップロードに含まれないキーを DeleteObjects
6. https://okibasho.example.com/p/<user>/<slug>/ を表示
```

metadata を先に書くのは、途中で失敗しても一覧に残り続けるようにするためである。成果物の Put や差分削除で失敗しても、metadata さえ書けていれば一覧から見え続け、利用者が消すか上げ直せる。metadata の Put 自体が失敗すれば新規ページとして一覧に現れないので、これも上げ直せば済む。

再アップロードは同じ prefix を上書きする。バージョンディレクトリは持たない。ファイルが減ったり名前が変わったりしたときに古いオブジェクトが残ると、公開 URL からいつまでも読めてしまう。5 の差分削除がこれを防ぐ。

metadata の無い pages/ 配下のファイルは削除しない。metadata を先に書く順にしたことで「アップロード中の孤児」は原理的に生まれなくなったが、それとは別に、S3 にファイルを置くだけで共有する経路を今後検討しており、その場合は metadata の無いページが正規に存在しうる。孤児として消してよいかどうかの判断はその検討にあわせて別途決める。

同じ slug への同時アップロードは想定しない。触れるのは所有者本人の prefix だけであり、自分で 2 箇所から同時に上げる状況はまず起きない。仮に起きても IAM 上は両方成功し、後から書いたオブジェクトが残る。

## URL解決

内部向けの公開 URL は `/p/<user>/<slug>/`。実装は `packages/infra/lib/functions/pages-router.js`（pages Distribution のデフォルトビヘイビアに viewer-request として付ける CloudFront Function。`/p/` 以外は 404 にする）。ランタイムは `cloudfront-js-2.0` を指定する（1.0 だと `String.prototype.endsWith` などが使えない）。

- `/` は app の URL へ 302 する。app の URL はメールドメインと同じくビルド時に埋め込む（独自ドメインの有無に関係なく常に有効）
- `%2f` / `.` / `..` / 空セグメントを含む URI は 404 にする
- `@` を含む user を弾く。`/a@b.jp@example.jp/` のような入力で別ユーザーの prefix を指させないため
- `/p/<user>/<slug>` に完全一致するなら末尾 `/` 付きへ 301 する（クエリ文字列は保持）。スラッシュ無しのまま HTML を返すと、ページ内の相対パスが壊れる
- 末尾 `/` なら `index.html` を補い、`/pages/<user>@<domain>/<slug>/...` へ書き換える。ドメイン名は CDK からビルド時に埋め込む
- Lambda@Edge も S3 Website Hosting も使わない

外部向けの URL 解決（`/s/*`）は別の CloudFront Function（`share-router.js`）が担う。詳細は次の「外部共有」節にまとめる。

## 外部共有

ページ単位で、ログインなしでも見られる URL を発行できる。正本は metadata（`meta/<email>/<slug>.json`）の `share` フィールドで、無ければそのページは外部共有していない。

### 同一 Distribution に `/s/*` を足した理由

別 Distribution や第 3 ホストにはしていない。Trusted Key Group・CloudFront Function・Response Headers Policy・Cache Policy はいずれもビヘイビア単位で設定できるため、1 つの Distribution に `/p/*`（内部）と `/s/*`（外部共有）を共存させられる。

- Signed Cookie は `/p/*` だけに付ける（理由は「認証」節）
- カスタムエラーレスポンスは Distribution 単位の設定だが、CloudFront Function が返したレスポンスには適用されない。そのため `/s/*` が返す 401 / 403 / 404 はこの導線に巻き込まれない

Distribution 単位の設定は `/s/*` にも及ぶ副作用がある。

- Geo restriction（「配信」節）は `/s/*` にも効くため、外部共有も日本国外からは見られない。現状は受容し、海外の相手に共有する要件が出たら別 Distribution を再検討する
- `enableIpv6: false` は pages Distribution 全体に効く。`/s/*` の IP 完全一致判定を IPv4 に絞るための設定である

### `/p/` と `/s/` が同一 origin であることのリスク評価

内部ページには現状ページ単位のアクセス制御が無く、内部ユーザーなら誰でも読める。`/s/` の HTML がログイン済み内部ユーザーのブラウザで `/p/` を same-origin で読めても、その内部ユーザーが元々読めるもの以上には届かない。外部の閲覧者は Signed Cookie を持たないため `/p/` は読めない。Service Worker の scope はスクリプトのディレクトリ配下に限られ、S3 からは `Service-Worker-Allowed` ヘッダを返せないので、あるページの Service Worker が他のページの経路を奪うこともできない。

もう一つ考えるべき経路がある。同じブラウザに残った別の共有ページの資格情報を使う手口である。チームメンバーが自分の共有ページ B（`/s/B/`）に JS を仕込むと、同じブラウザにキャッシュされた別ページ A（`/s/A/`）向けの Basic 資格情報（realm はどの共有 URL でも `okibasho` で共通なので、A 用に入力した認証情報がブラウザから B にも送られうる）や、A が許可している IP からのアクセスを使って `/s/A/` を same-origin で読める可能性がある。それでも結論は変わらない。B の作者はチームメンバーであり `/p/` から A の元ページをそのまま読めるうえ、この経路には A の share-id を事前に知っている必要がある。知らなければ `/s/A/` を開けない。B にアップロードされた HTML が第三者の CDN スクリプトを読み込んでいる場合は、その JS が A を読めればスクリプト提供元にも A の内容が渡りうる点だけは明記しておく。

したがって origin 分離の境界は「app と pages の間」のままで足りており、`/s/` を第 3 origin にする動機は無い。次のいずれかが起きたら再検討する。

- ページ単位の内部アクセス制御を入れる
- 外部ユーザーがアップロードできるようにする

### tag と share-id

外部共有 URL は `/s/<tag><share-id>/`（33 文字）で、前半 11 文字が tag、後半 22 文字が share-id である。

- tag は `base64url(SHA-256(UTF-8(prefix)))` の先頭 11 文字（66bit）。`prefix` はページ成果物の prefix（`pages/<email>/<slug>/`、末尾 `/` あり）そのもので、tag を計算するときだけの小文字化・正規化はしない。ページの prefix から一意に決まるため、KVS のキーとして使える
- share-id はクライアント（web / CLI）が CSPRNG で生成する 128bit の値を base64url（パディングなし）にした 22 文字（`/^[A-Za-z0-9_-]{22}$/`）。tag だけでは推測できないため、share-id 自体が推測困難な credential であり、Basic 認証や IP 制限はその上に足す追加の防御という位置付けである。試行回数制限は無い
- 固定テストベクター（`packages/core/src/page/tag.ts`・infra の同名テストで一致を確認する）:

  | prefix | tag |
  | --- | --- |
  | `pages/alice@example.com/hello/` | `prgdKq0F-Hu` |
  | `pages/tanaka@example.jp/q3-report/` | `XLCXXgKt3re` |

- share-id 自体が推測困難な秘匿情報であり、これだけで基本の保護として十分という位置付け。パスワード（Basic 認証）は任意の上乗せで、付けるときだけシステムが `generateSharePassword`（`@okibasho/core`）で自動生成する（手入力は受け付けない）。ユーザー名は `guest` 固定・自由入力にしない。metadata は所有者本人しか読めない IAM 境界の内側にあるため、ハッシュ化・salt はやめて平文で持つ。管理 UI はいつでも再表示・コピー・付け外しができる（「最初の1回だけ表示」の完了画面は持たない）
- IP 制限は「IPv4アドレスの完全一致リスト」（1〜20件）として仕組みだけ残す。CIDR のような範囲指定・正規化はしない。管理 UI には出さず、metadata の直接編集で設定する運用にする。既存の IP リストは、web で共有を作り直しても消さず引き継ぐ

tag の衝突（66bit）は考慮しない。1 万ページ規模でも偶然の衝突は 10⁻¹³ 程度である。

### KVS エントリと投影の規則

CloudFront KeyValueStore には、正本（metadataの `share`）から導出した投影だけを置く。キーは tag（1 ページ 1 キー）、値は次のフィールドを持つ JSON 文字列（1KB 以内。超えたらそのエントリは投影しない）。

- `p` はそのページの prefix、`id` は share-id。router 側は URL 後半 22 文字とこの `id` を照合する
- `b` は `base64("guest:" + パスワード)`。パスワードを付けているときだけ設定し、router 側は `Authorization` ヘッダと `"Basic " + b` を文字列比較するだけで Basic 認証を判定できる（ハッシュ比較も `crypto` も使わない）。`b` が無ければ router 側は Basic 認証をせず通す
- `ips` は IP 制限（完全一致リスト）があるときだけ。router 側は `ips.indexOf(clientIp) !== -1` だけで判定する
- キーが prefix から一意に決まるため、あるページの tag は常にそのページだけが使う。URL の再発行は「作り直す」という操作で行い、パスワードを付けている場合はそのタイミングでパスワードも作り直す。同じキーの値を上書きする。パスワードの付け外し・共有の停止・削除・期限切れはキーの上書き・削除で表す

投影は 2 つの経路から行う。実装は `packages/infra/lib/lambda/page-maintenance/`。

- **S3 イベント（該当ページだけの即時反映）**: `meta/` 配下の JSON の作成・削除で起動する。イベントのキーをデコードして prefix を導出し、その prefix の現在の metadata を S3 から読み直して「あるべき状態」を決め、tag 1 件分だけ put / delete する。既存の KVS 値は読まない。他ページを巻き込まない 1 ページ単位の `UpdateKeys` なので、通常は数秒〜十数秒で反映される
- **日次の定期処理（全件突き合わせ、reconcile）**: `meta/` 全件と KVS 全件を読み、あるべき状態と実際の差分だけを put / delete する。S3 通知の取りこぼしを最大 1 日で拾う安全網である。即時反映は S3 イベントが担っているため日次で足り、KVS の API 呼び出し（課金対象。無料枠が無い）を毎時払わずに済む。`meta/` 配下の metadata は同時実行数 8 程度の並列で読む

S3 イベントで「共有していない（あるべき状態が無い）」と分かったときは、`GetKey` でそのキーの有無を先に見て、無ければ何もせずに終える。共有していないページの操作でも S3 イベントは飛ぶため、そのたびに `DescribeKeyValueStore` + `UpdateKeys` の 2 回を払わないようにするためである。

あるべき状態が無い（=削除対象）のは、metadata が無い / JSON 不正 / `expiresAt` が ISO 文字列でも `null` でもない（形式異常）/ `expiresAt` を過ぎている / `share` 無し / `share` の検証に失敗 / KVS 値が 1KB を超える、のいずれかである。

Lambda は同時実行 1 なので、連続した S3 イベントは非同期呼び出しとして直列に並ぶ。処理は冪等なので何度実行されても壊れない。5 分より古い呼び出しは破棄し（`maxEventAge`）、リトライは 1 回（`retryAttempts`）に絞り、取りこぼしは日次の定期処理に任せる。

- `UpdateKeys`（IfMatch = `DescribeKeyValueStore` の ETag）は 50 キーごとにチャンク分割する。同じ Key を 1 回の呼び出しに 2 度含めない。`ConflictException` は ETag を取り直してリトライする
- 存在しないキーの `delete` を `UpdateKeys` に渡したときの挙動は公式ドキュメントで明記されていない（`ResourceNotFoundException` になる可能性がある）。1 件だけの delete（put 無し）でそれが起きたときだけ、`GetKey` でそのキーが実際に無いことを確かめて成功扱いにする。あれば別の理由のエラーなので再送出する

共有を OFF にする操作は `share` フィールドを削除すること。URL の再発行は `share.id` の差し替えで行う。どちらも次の投影で KVS のキーが削除・上書きされる。

Lambda の失敗は CloudWatch Logs と Lambda の `Errors` メトリクスで確認する。通知先を運用しないため、アラームは持たない。

### エッジでの判定順（`/s/*` viewer-request）

実装は `packages/infra/lib/functions/share-router.js`。

1. `/s/<id>` のみ（末尾スラッシュ無し）→ 301 `/s/<id>/`（クエリ保持）
2. `%2f` / `.` / `..` / 空セグメント → 404（`/p/*` と同じパス検査）
3. id が `/^[A-Za-z0-9_-]{33}$/` に合わなければ 404。合えば前半 11 文字を tag、後半 22 文字を share-id として分ける
4. tag で KVS を get し、値が無い・パース失敗・`id` が share-id と一致しなければ 404
5. `ips` があり viewer の IP がどれとも完全一致しない → 403
6. `b`（パスワード）が設定されていて、`Authorization` が `"Basic " + b` と一致しない → 401 + `WWW-Authenticate: Basic realm="okibasho", charset="UTF-8"`。`b` が無ければこの判定はせず素通しする
7. URI を投影先の prefix（`p`）+ rest に書き換える（末尾 `/` なら `index.html` を補完）。`Authorization` ヘッダは削除して転送しない

エラーレスポンスの body は短い固定文言にする。

### 外部向けに新たに塞いだもの

- S3 の `NoSuchKey` エラー XML に `pages/<email>/<slug>/...` が出て、メールアドレスとキー構成が見えてしまう問題。Distribution のカスタムエラーレスポンス（404 → `/errors/404.html`）で差し替える。viewer-response の CloudFront Function はオリジンが 400 以上を返すと実行されないため使えない。エラーページは owner や URL の情報を含まない固定文言の HTML で、`BucketDeployment` で pages バケットの `errors/` に配置し、関数を付けない `/errors/*` ビヘイビアから配信する。配置ロールは bucket policy の Deny で `errors/` 配下にだけ書けるようにしている。
- Referer 経由の share-id 漏れと検索エンジンによる索引化への対策は「配信」節のヘッダ設定を参照

### 受容している share-id の漏れ経路

次の経路からの share-id 漏れは対策せず受容する。

- ブラウザの閲覧履歴
- チャットやメールの本文（URL をそのまま貼って共有するため）
- CloudFront の標準アクセスログ。外部共有の閲覧を追うために有効にしている。share-id を含む URL が残るため、ログ用バケットは完全 private にし、読めるのはデプロイ権限を持つ人だけとする。Signed Cookie を残さないよう `logIncludesCookies` は既定の false のままにする
- CloudTrail の KVS データイベント。データイベントを有効化しなければ出力されない

## 保存期間

デフォルト 30 日。ユーザー操作で無期限に変更できる。

閲覧時に期限を検査する仕組みは持たない。閲覧経路は CloudFront → S3 の直配信で Lambda を通らず、`expiresAt` を評価するコードが動く場所がないためである。期限の実施は PageMaintenance Lambda の定期処理に一本化する。外部共有の期限も別途 KVS には持たせない。正本は metadata の `expiresAt` のままとし、期限切れで metadata が消えれば次の投影で KVS のキーも消える（詳細は「外部共有」節）。

仕組み（`packages/infra/lib/lambda/page-maintenance/index.ts`）:

- metadata の `expiresAt` が唯一の判定材料
- EventBridge Rule が 1 時間ごとに PageMaintenance Lambda を `cleanup` タスクで起動し、次の順に処理する
  1. `meta/` 全件の metadata を読む（並列 8）
  2. `expiresAt` が現在時刻を過ぎているページを、成果物 → metadata の順に削除する（CLI / Web の削除と同じ順）
- metadata を消すと S3 イベントが飛ぶので、KVS のエントリは日次の突き合わせを待たずに消える
- 削除処理は CLI / Web の削除と同じ考え方（成果物 → metadata の順）で書く。ロジックを 2 本持たない

期限切れから実際に消えるまで最大 1 時間のズレが出る。チーム向けツールとして十分であり、その間は URL を知っていればまだ見られる（社内向けの `/p/` がこの猶予まで見えるのと同じ許容範囲とする）。

保存期間の起点は「最後にそのページを操作した時刻から 30 日」で統一する。オブジェクトタグも Lifecycle も追随させない。`createdAt` は初回アップロードの値を維持し、期限の計算にだけ使う保存期間変更・再アップロードの時刻とは別物である。

- アップロード（新規・再アップロードとも）: `expiresAt` はアップロード時刻から数え直す。ただし permanent 化済みのページは、`--permanent` を付けずに再アップロードしても permanent のまま維持する（temporary への変更は保存期間変更の操作で行う）
- 保存期間の変更: temporary → permanent、permanent → temporary のどちらも変更時刻から数え直す

## 管理UI（web）

静的 SPA。S3 + CloudFront で配信する。SSR もサーバー関数も使わない。

フレームワークは TanStack Start の SPA モード + prerender。成果物は静的ファイルのみとし、app Distribution の S3 origin から配信する。

API クライアントは書かない。ブラウザから直接 AWS SDK for JavaScript v3 で S3 を叩く。

全ページログイン必須。SPA のルート直下に認証ゲートを置き、未ログインで開くと即 Cognito Managed Login へリダイレクトする。ログイン画面やログインボタンは持たない。唯一の例外は `/callback`（Managed Login からのリダイレクト先）。

画面:

- `/`（トップ）: 上にアップロード（単一ファイル / ディレクトリ / drag & drop、保存期間の選択、slug の指定は任意で、省略すれば乱数の slug を自動生成する）、下に自分のページ一覧（URL コピー・保存期間変更・削除・再アップロード）。一覧の「再アップロード」はアップロードフォームに slug をセットしてスクロールする。`?slug=` クエリもこの画面が受ける
- `/callback`（ログインコールバック処理。未ログインでも到達できる唯一のルート）
- `/pages-login?return=<pages の URL>`（内部ページの閲覧認証。ログイン済みを前提に Signed Cookie を発行して元の URL へ戻る。画面は LoadingShell だけ。詳細は「内部ページの閲覧（Signed Cookie）」節）
- 404

App Distribution のルーティング:

```text
/auth/*  → Signed Cookie 発行 Lambda（Function URL + Lambda OAC）。独自ドメイン未設定ならこの behavior は作らない
それ以外  → 管理UI用 S3 origin（404 は SPA シェルへ rewrite）
```

認証ゲートは CloudFront 側では行わずアプリ側（SPA のルート直下）で行う。理由: Lambda@Edge は不採用、CloudFront Function は JWT を検証できない、app 配信に Signed Cookie を使うと発行元が app 自身になり循環する。守る対象は公開前提の静的バンドルであり、実際のセキュリティ境界はブラウザ側の認証ゲートではなく IAM ポリシー（S3 への書き込み範囲）のままである。

## CLI

TypeScript + Node.js で書き、npm で配布する。実行は `npx okiba`。依存は単一 JS にバンドルする。AWS CLI のインストールを前提にしない。

依存: `@aws-sdk/client-s3`、`@aws-sdk/credential-providers`、PKCE 用に `openid-client`、拡張子→ MIME の判定ライブラリ。

```ts
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const idToken = await refreshIdToken()
const credentials = fromCognitoIdentityPool({
  identityPoolId,
  logins: { [`cognito-idp.${region}.amazonaws.com/${userPoolId}`]: idToken },
})
const s3 = new S3Client({ region, credentials })
// prefix は pages/<email>/<slug>/  … email は id_token のクレームから取る
```

コマンド:

- `okiba login` — PKCE + 127.0.0.1 コールバック + refresh token 保存
- `okiba <path> [--name <slug>] [--permanent]` — 走査して PutObject、差分削除、metadata を書き、URL を表示
- `okiba list` — `ListObjectsV2`
- `okiba rm <slug>` — `DeleteObjects`（冪等）

走査時は path traversal を拒否する（`../`、絶対パス、ドライブレター）。symlink は無視する。Content-Type は拡張子から判定して付ける。

CLI の対象は開発者と AI エージェントに割り切る。開発環境がないユーザーは Web UI の drag & drop を使う前提のため、単一バイナリ配布はしない。

OAuth / PKCE は既存ライブラリ（openid-client）を使い、独自実装を最小限にする。

## CDK

スタックは `Okibasho`（デプロイ先リージョン）と、独自ドメイン設定時だけ作る `OkibashoCertificate`（us-east-1。ACM 証明書だけ）の 2 つ。CloudFront の証明書が us-east-1 にしか置けないための分割で、それ以外の理由でスタックを増やさない。`lib/constructs/` に機能ごとに分ける。

Construct ごとの役割:

- `auth`: UserPool / Managed Login / App Client x2 / Google IdP（設定時のみ）/ PreSignUp Lambda / IdentityPool / authenticated role / principal tag
- `pages-storage`: pages バケット（private, PAB, CORS）/ errors/ への BucketDeployment（配置ロールは bucket policy の Deny で errors/ だけに限定）
- `pages-delivery`: pages Distribution / OAC / CloudFront Function（/p/* /s/*）/ /errors/* ビヘイビアとカスタムエラーレスポンス / Response Headers Policy / Geo restriction
- `page-maintenance`: CloudFront KeyValueStore + PageMaintenance Lambda（S3 イベントでページ単位の投影 + 毎時の期限切れ削除 + 日次の KVS 全件突き合わせ。アラームは持たない）
- `app-delivery`: app バケット + Distribution + SPA 用 CloudFront Function
- `service-domain`: 独自ドメイン（設定時のみ）。Hosted Zone の参照、pages / app それぞれのホスト名と証明書、Alias レコード
- `pages-viewer-auth`: Signed Cookie 閲覧認証（独自ドメイン設定時のみ）。SigningKeyPair（鍵ペアのカスタムリソース）、PublicKey / KeyGroup、発行 Lambda + Function URL（Lambda OAC）

PageMaintenance Lambda 本体（`packages/infra/lib/lambda/page-maintenance/`）は SigV4A が必要な `@aws-sdk/client-cloudfront-keyvaluestore` を呼ぶため、副作用 import で純 JS の `@aws-sdk/signature-v4a` を読み込んでいる（ネイティブの `@aws-sdk/signature-v4-crt` は使わない）。`NodejsFunction` の bundling では `@aws-sdk/*` を external にしない。

環境ごとに変わる値（メールドメイン、デプロイ先、独自ドメイン、Google の client ID）はリポジトリに持たず、`packages/infra/.env`（git 管理外）かシェルの環境変数で渡す。項目は `packages/infra/.env.example` にある。メールドメインだけは必須で、未設定なら synth の時点で止める。

| 環境変数 | 必須 | 意味 |
| --- | --- | --- |
| `EMAIL_DOMAIN` | 必須 | メンバーのメールドメイン |
| `SERVICE_DOMAIN` / `HOSTED_ZONE_ID` / `HOSTED_ZONE_NAME` | 任意（3 つそろえる） | サービスドメインと、それを含む同一アカウントの Hosted Zone。設定すると独自ドメインで構築する |
| `GOOGLE_CLIENT_ID` | 任意 | Google OAuth クライアントの ID。設定すると Google IdP を作る。client secret は Secrets Manager に先に置いておく |

`config.ts` は 3 つのうち一部だけ設定された状態を synth の時点で止める。

Google IdP の有無による分岐は `Auth` の中で IdP を作るか作らないか（と App Client の依存）だけにする。web と CLI は分岐を持たない。

独自ドメインの有無による分岐は次の 2 種類に限り、Construct の中に `if (domain)` を増やさない。

- スタックの組み立て（`okibasho-stack.ts`）で、`ServiceDomain` と `PagesViewerAuth` を作るか作らないか
- 各 Construct が受け取る optional な props（`customDomain?: { domainName, certificate }`、`viewerAuth?: { keyGroup }`）を Distribution の props に渡すか渡さないか

`PagesDelivery` と `AppDelivery` は `domainName`（独自ドメインか CloudFront のデフォルトドメインか）を公開し、CfnOutput・CORS の許可 origin・Cognito のコールバック URL・pages-router に埋め込む app の URL はすべてこの値から組み立てる。下流はどちらのモードかを知らない。

Construct の生成順は Storage → PageMaintenance → ServiceDomain → AppDelivery → Auth → PagesViewerAuth → PagesDelivery → Alias レコード。`AppDelivery` の `/auth/*` ビヘイビアは `PagesViewerAuth` が Auth（User Pool ID・App Client ID）に依存するため、`AppDelivery` 生成後に `addBehavior` で足す。

`SERVICE_DOMAIN` が未設定でも `cdk synth` が通ること。snapshot テストはドメイン無し・ドメインあり（固定の Hosted Zone を渡し、証明書スタックも同じ App に作る）の両方で合成し、どちらのモードも壊れていないことを守る。

Identity Pool は L2 Construct（`aws-cdk-lib/aws-cognito-identitypool`）を使う。attributes for access control（principal tag マッピング）は L2 で設定できないため、`CfnIdentityPoolPrincipalTag` で補う。

GitHub Actions からの `pnpm ship` はアクセスキーを置かず、OIDC プロバイダ + 引受ロールで行う。

### スタック削除

使わなくなったときに `cdk destroy` で認証基盤と配信基盤を消す。作り直しは想定しない。

- User Pool は `DESTROY`。Hosted UI ドメインも一緒に消える
- Google の client secret（Secrets Manager）はスタック外に手で置いたものなので残る。GCP の OAuth クライアントと一緒に手で消す
- 管理 UI 用バケットと pages のアクセスログ用バケットは `DESTROY` + `autoDeleteObjects`。ビルドし直せる静的ファイルとログだけなので中身ごと消す
- pages バケットは `RETAIN`。アップロード済みオブジェクトはスタック削除後も残る。`autoDeleteObjects` は付けない。課金は続くので、不要なら手で空にしてバケットを消す。バージョニングを有効にしているので、空にするには旧バージョンと削除マーカーも消す必要がある
- CloudFront など残りのリソースはデフォルトどおり消える。Distribution の削除は完了まで待たされる
- Signed Cookie の鍵の SSM パラメータはカスタムリソースの Delete で消える
- 独自ドメイン設定時は `Okibasho` → `OkibashoCertificate` の順に消す（`cdk destroy --all` がこの順で消す）
- CDK bootstrap はアカウント共通なので残す

## 配信

Lambda から HTML やアセットを配信しない。Range Request・Cache-Control・ETag などの静的配信をアプリで再実装しないため、pages Distribution は CloudFront → OAC → Private S3 とする。

Response Headers Policy は CDK で付ける。アプリのコードは 1 行も要らず、origin 分離が破れたときの保険になる。

| Distribution | ヘッダ |
| --- | --- |
| pages（`/p/*` `/s/*` 共通） | `X-Content-Type-Options: nosniff`、`Cross-Origin-Opener-Policy: same-origin`、`Content-Security-Policy: frame-ancestors 'none'`、`Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex, nofollow` |
| app | HSTS、`Content-Security-Policy: frame-ancestors 'none'` |

`Referrer-Policy` と `X-Robots-Tag` は外部共有の追加に合わせて足した。share-id を含む URL が Referer 経由で外部に漏れるのと、検索エンジンに索引化されるのを防ぐ。

CloudFront の Geo restriction を日本に絞る。無料である。WAF は月額コストが乗るので入れない。

再アップロードは同じ key の上書きなので、CloudFront のキャッシュが残ると古い内容と新しい内容が混ざる。pages 側は短い TTL（60 秒）にする。invalidation は持たない。クライアントに `cloudfront:CreateInvalidation` を足すと IAM の境界が S3 の外へ広がり、権限を自分の prefix の S3 操作だけに絞る狙いを損なう。チーム向けツールとして最大 60 秒の遅れは許容する。app 配信の静的ファイルはハッシュ付きアセットを長期キャッシュし、シェルだけ短くする。

## 入力の扱い

- Content-Type は拡張子から判定して保存する。判定には標準の MIME 判定ライブラリを使い、対応表を自作しない。未知の拡張子は `application/octet-stream` にする
- pages は任意の HTML・JS が動く前提の untrusted origin なので、Content-Type を偽られてもリスクは増えない。origin 分離を採用した時点で、強制の動機は消えている
- ディレクトリアップロードでは path traversal を防ぐ。`../`、絶対パス、ドライブレターを拒否し、S3 key は必ず `pages/<email>/<slug>/` 配下に限定する
- symlink は無視する
- slug は `[a-z0-9][a-z0-9_-]{0,63}`。ページ直下に `index.html` が無いアップロードは拒否する
- Web での slug 指定は任意。省略時は乱数（小文字英数字 10 文字）を自動生成する。生成関数 `generateRandomSlug`（`packages/core/src/page/slug.ts`）を web と CLI で共有する。CLI は従来どおり `--name` 省略時にパス名から slug を作り、この挙動は変えない

サイズ・ファイル数は IAM で強制できない。`PutObject` には `s3:content-length-range` に相当する条件キーがなく、それは presigned POST policy 限定のためである。クライアント側で次の目安を置き、超えたら送る前に弾く。サーバー側の強制は持たない。逸脱は請求アラートで見つける。

| 対象 | 上限 |
| --- | --- |
| 1ファイル | 50 MB |
| 1ページ合計 | 200 MB |
| ファイル数 | 200 |

## ログ

CloudWatch Logs に最低限、Signed Cookie 発行の成功/失敗、PageMaintenance の削除件数、authorization 失敗を記録する。JWT と refresh token はログに出さない。

ロググループは保持期間 90 日、スタック削除で一緒に消す。CDK が内部で作る Lambda（S3 通知と `autoDeleteObjects`）と CloudFront Functions のロググループは CDK から指定する口が無いため、この設定の対象外になる。pages のアクセスログも同じ 90 日で、こちらは S3 のライフサイクルで消す。

PageMaintenance の定期処理は削除した prefix を残し、誤削除の調査に使えるようにする。

share-id・tag は credential として扱い、ログに全体を出さない。PageMaintenance は監査用に put・delete ごとに prefix と tag の先頭 4 文字 + `…` を出す。

## テスト

テストランナーは Vitest に統一する。設定はパッケージごとの `vitest.config.ts` に置き、ルートの `pnpm test` が `pnpm -r test` で各パッケージへ委譲する。

`packages/core` の S3 操作は、メモリ上の fake S3 に対してアップロード・保存期間・共有設定・一覧・削除の結果を確認する。CLI のコマンドのテストも同じ fake S3 を使う。

CloudFront Function は `node:vm` で handler を直接実行する。rewrite、`@` を含む user の 404、末尾スラッシュの 301、index.html 補完を確認する。share-router.js は KVS の get をモックし、id 形式、IP 制限、Basic 認証、rewrite の各分岐を確認する。

PageMaintenance（`packages/infra/lib/lambda/page-maintenance/`）は S3 / KVS の SDK 呼び出しをモックせず、`validate.ts`（検証・期限切れ・KVS 値の直列化）と `plan.ts`（あるべき状態と実際の KVS の差分計算）、`dispatch.ts`（S3イベントかスケジュールかの判定）を純粋関数として単体テストする。

CDK は `Template.fromStack()` の snapshot テストを正とする。個別リソースのアサーションは、意図を明示したい箇所（bucket が private であること、CORS があること、pages Distribution に OAC と Function が付いていること、authenticated role のポリシーと信頼ポリシー、unauthenticated access が無効であること）にだけ足す。

snapshot は `.env` や環境変数を読まず、固定の値だけを渡して合成する。ドメイン無し（メールドメインだけ）とドメインあり（固定の証明書 ARN・Hosted Zone を含む）の 2 つを持ち、「設定が空でも synth が通る」と「ドメインを渡すと alias・Key Group・`/auth/*`・403 が揃う」の両方をテストで守る。

Signed Cookie 発行 Lambda（`packages/infra/lib/lambda/pages-cookie/`）は、JWT 検証と署名を差し替えられる形にして、ボディの検証・Set-Cookie の属性・ステータスを単体テストする。

IAM の境界は、別ユーザーの prefix に書こうとすると `AccessDenied` になることをテストで確認する。実 AWS が要る確認はデプロイ後に回し、単体ではポリシー文書の形をアサートする。

## パッケージ構成

```text
packages/
  infra/   AWS CDK（メインスタック + us-east-1 の証明書スタック、機能境界は Construct）
  web/     管理UI（静的 SPA。S3 + CloudFront で配信）
  cli/     okiba（Node.js のみ。AWS CLI に依存しない）
  core/    @okibasho/core。web と CLI が共有するページの規則と S3 操作
```

`packages/api` は置かない。API が存在しないため、共有すべき API 型もない。

web と CLI はどちらも S3 を直接操作するので、ページに対する操作そのものを `packages/core` で共有する。中は 2 層に分ける。

- `src/page/`: 純粋なドメインロジック。slug 規則、S3 キーと公開 URL の組み立て、拡張子 → Content-Type、path traversal 検査、上限、metadata の型と検証、保存期間と期限の計算、「既存 metadata + 入力 → 新しい metadata」の組み立て、外部共有の検証と tag
- `src/page-store.ts`: `createPageStore({ s3, bucket, email })` が返す、1 ユーザーのページに対する S3 操作（一覧、metadata の取得、アップロード（並列 Put・差分削除・metadata の書き込み）、保存期間の変更、共有設定の変更、削除）。S3Client は呼び出し側が渡す。ファイル本体は web の File / Blob と CLI の Buffer のどちらも受ける

web と CLI には、それぞれの利用者に向けたアダプタだけが残る。web は `hooks/usePagesApi.ts`（認証情報と接続先から PageStore を作る、失敗を画面向けの文言にする）と `lib/listed-page.ts`（metadata を公開 URL・tag 付きの一覧の行にする）、CLI は `commands/*`（ローカルファイルの収集、`--permanent` から保存期間への変換、端末への表示）を持つ。

`@okibasho/core` はビルドせず、`package.json` の `exports` で TypeScript のソースをそのまま公開する。web は Vite、CLI は esbuild がワークスペースのリンク越しにソースを束ねる。PageMaintenance Lambda は依存を増やさないため、tag 計算だけを複製している。

## やらないこと

API Gateway / REST API / JWT Authorizer / DynamoDB / Lambda@Edge / WAF / S3 Lifecycle + オブジェクトタグ / presigned URL / `packages/api` / 既存 ALB との統合 / 外部共有専用の第 3 origin。

CloudFront KeyValueStore は外部共有の投影先として採用した。「使わない」の対象からは外れる。

`packages/shared` という名前のパッケージも作らない。これは「API サーバーと呼び出し側で型を共有する」用途を想定していたもので、API 自体を持たないため出番がない。web と CLI がどちらも直接 S3 を操作することで生まれた「ページの規則と S3 操作の共有」は、別の目的として `packages/core` が担っている（「パッケージ構成」節）。

外部共有専用の第 3 origin は作らない。`/s/*` は既存の pages Distribution にビヘイビアとして追加しており、origin は増えていない（理由は「外部共有」節）。

ALB は S3 をターゲットにできず、Lambda ターゲット経由だとレスポンス 1MB 上限で配信に使えないため、この構成には組み込みどころがない。
