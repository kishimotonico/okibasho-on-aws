# アーキテクチャ

本書が設計の正本である。決定済みの設計だけを書く。検討中の論点は [open-questions.md](open-questions.md) に、設計に至る背景は文末の「検討の経緯」にある。

## 全体構成

構成図: [architecture.drawio](architecture.drawio)（draw.io 形式。VS Code の Draw.io Integration 拡張か [app.diagrams.net](https://app.diagrams.net) で開く）。外部共有（`/s/*`、KVS、share projector）を追加する前の図のままで、更新していない。

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
        │ 5分ごとに全件読み取り
   Lambda（share projector、同時実行1）── Errors に CloudWatch Alarm（ALERT_EMAIL があれば SNS 通知）
        │ UpdateKeys（IfMatch）
        ▼
   CloudFront KeyValueStore（share-id → S3 prefix / Basic / CIDR の投影。
                             停止・再発行・削除・期限切れは墓標として残す）
        ▲
        │ OAC                              │ 参照
   CloudFront（pages.share.example.jp / UNTRUSTED、単一 Distribution）
        └ デフォルトビヘイビア＝/p/*（内部。/p/ 以外は 404。Signed Cookie 必須、独自ドメイン導入後）
             CloudFront Function: /p/<user>/... → /pages/<user>@<domain>/... + index.html 補完
        └ /s/* ビヘイビア（外部共有。KVS 参照、Basic / IP 制限、Signed Cookie は付けない）
             CloudFront Function: /s/<share-id>/... → KVS の投影先へ rewrite
        └ /errors/* ビヘイビア（カスタムエラーレスポンス専用。関数なし。
             BucketDeployment が pages バケットの errors/ に配置した固定ページを配信）
        └ 共通設定: errorResponses（404 → /errors/404.html。403 は将来の Signed Cookie
          ログイン誘導のために空けてある）/ Response Headers Policy（Referrer-Policy: no-referrer 等）/
          Geo restriction / IPv6 無効化

   CloudFront（app.share.example.jp / TRUSTED）
        ├ /auth/*  → Lambda（Signed Cookie 発行）
        └ /*       → S3（管理UIの静的ファイル）

   EventBridge Scheduler（1時間ごと）→ Lambda（期限切れ cleanup）
```

使う AWS サービス: S3 / CloudFront / CloudFront KeyValueStore / Cognito User Pool / Cognito Identity Pool / Lambda（4つ） / EventBridge Scheduler / Route 53 / ACM。IaC は AWS CDK（TypeScript）。

Lambda は次の 4 つ。どれも小さく独立している。API Gateway は無い。認可は IAM ポリシーに委譲する。

- Signed Cookie 発行（独自ドメイン導入後）
- cleanup（期限切れと孤児の削除）
- PreSignUp（メールドメイン制限。Google IdP 追加時）
- share projector（`.metadata.json` の `share` を CloudFront KeyValueStore へ投影。詳細は「外部共有」節）

このほかに、CDK の `BucketDeployment`（pages バケットの `errors/` に固定ページを配置するためだけのカスタムリソース Lambda）が存在する。これは IAM の境界の外にある処理として次節で扱う。

CDK のスタックは 1 つとし、機能的・概念的な境界は Construct で表現する（auth / storage / delivery / app-site / cleanup / domains）。Stack 本体は各 Construct の組み立てだけを行う。スタック分割による cross-stack reference の複雑さは持ち込まない。

DynamoDB、WAF、Lambda@Edge、API Gateway、S3 Lifecycle、presigned URL は使わない。CloudFront KeyValueStore は外部共有の投影先として採用したため、この対象からは外れる。

## origin と URL 空間

trusted な管理アプリと untrusted な共有ページを別 origin に分ける。ここでいう origin は scheme・hostname・port の組である。

| origin | 信頼 | 用途 |
| --- | --- | --- |
| `app.share.example.jp` | trusted | ログイン、アップロード UI、My Pages、Signed Cookie 発行 |
| `pages.share.example.jp` | untrusted | アップロードされた HTML・JS・CSS・画像 |

アップロードされた HTML には任意の JavaScript（AI 生成コードを含む）が入りうる。管理アプリと同一 origin にすると DOM・storage・Cookie へアクセスできてしまう。この境界にブラウザの Same-Origin Policy をそのまま使う。

| URL | 公開範囲 | 認証 | Distribution | S3 key |
| --- | --- | --- | --- | --- |
| `https://pages.share.example.jp/p/<user>/<slug>/` | 内部（ログイン必須） | Signed Cookie 必須（独自ドメイン導入後） | pages（`/p/*`） | `pages/<email>/<slug>/` |
| `https://pages.share.example.jp/s/<share-id>/` | 外部（ページ作成者が発行した URL を知っている人） | 任意で Basic 認証・IP 制限 | pages（`/s/*`） | KVS の投影から解決（実体は `pages/<email>/<slug>/`） |

`<user>` はメールのローカル部だけを見せる。全員が同じ Workspace ドメインなので、ドメイン部は CloudFront Function で静的に補完する。

内部 URL のパスに `/p/` を置くのは、外部共有用の `/s/` と名前空間を分けるためである。旧 `/<user>/<slug>/` は未公開だったため互換リダイレクトを持たない。

ホスト名は `app` / `pages` の 2 つのままとする。外部への URL 共有はページ単位のオプトインとして実装した（詳細は「外部共有」節）。共有していないページは従来どおりログイン必須である。

CloudFront の Distribution は app 用と pages 用の 2 つ。pages 用の 1 つに `/p/*`（内部）と `/s/*`（外部共有）の 2 ビヘイビアを持たせる。別 Distribution や第 3 ホストにはしない。理由は「外部共有」節にまとめる。

## 認可は IAM ポリシーに委譲する

owner 認可はアプリコードに置かない。ブラウザと CLI は Cognito Identity Pool 経由の一時 IAM クレデンシャルで S3 を直接操作し、触れられる範囲は IAM の Resource ARN と条件キーが決める。

authenticated role の権限ポリシーが唯一のセキュリティ境界である。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOwnPages",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<pages-bucket>",
      "Condition": {
        "StringLike": { "s3:prefix": ["pages/${aws:PrincipalTag/email}/*"] }
      }
    },
    {
      "Sid": "ReadWriteOwnPages",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<pages-bucket>/pages/${aws:PrincipalTag/email}/*"
    }
  ]
}
```

- 他人の prefix への Put / Get / Delete / List は `AccessDenied` になる
- metadata の owner とログインユーザーの照合はアプリに持たない。認可は IAM だけが行うため、アプリのバグで他人のページを壊せない
- `s3:prefix` 条件があるため、`ListObjectsV2` には必ず prefix を渡す。渡さないと `AccessDenied`
- CDK のレビュー時はこのポリシーと、ロールの信頼ポリシー（次節）を重点的に見る

IAM の境界の外にある処理が 3 つある。いずれもレビュー対象である。

- cleanup Lambda: prefix 制限のない削除権限を持つ
- share projector: `pages/` 配下の `.metadata.json` を全件読める（Basic 認証のハッシュも含む）。書き込みは CloudFront KeyValueStore の `UpdateKeys` だけで、pages バケットへの書き込み権限は持たない
- `BucketDeployment` のカスタムリソース Lambda（`packages/infra/lib/constructs/pages-storage.ts` の `ErrorPagesDeployment`）: pages バケットへの書き込み権限を持つ。実際に管理する範囲は `errors/` prefix（カスタムエラーページ）だけである

## 認証

### Web

Cognito User Pool に Google Workspace を外部 IdP として連携する。Managed Login を使う（ログイン画面を自作しない）。組織の Workspace ドメインのアカウントのみ許可する。

メールドメイン制限は PreSignUp Lambda トリガーで実装する。`event.request.userAttributes.email` のドメインと `email_verified` を検証し、不一致なら reject する。

導入は段階的に行う。当面は Cognito のローカルユーザー（管理者作成）で運用し、Google IdP と PreSignUp は後から追加する。Managed Login + Authorization Code + PKCE というフローは変わらないため、クライアント側の変更は不要（[roadmap.md](roadmap.md) 参照）。

App Client は 2 つ。どちらも public client（client secret なし）+ PKCE。

- web 用: callback は `https://app.share.example.jp/callback`。開発時は `http://localhost:3000/callback`
- cli 用: callback は `http://127.0.0.1:<port>/callback`（localhost 許可）。Cognito は callback URL をポートまで含めた完全一致で照合するため、空きポートを動的に 1 つだけ選ぶことはできない。候補ポート `8976` `8977` `8978` を登録し、空いている最初のポートを使う。全部使用中ならポートを空けるよう伝えて終了する

メールアドレスが S3 キーになる。User Pool 側でメールを小文字に正規化する。`+` 付きアドレスは PreSignUp で拒否する。キーの揺れを増やさないためである。

### CLI

Web と CLI で認証方式を分けず、同じ User Pool を使う。CLI のログインは OAuth 2.0 Authorization Code + PKCE。CLI が一時的に 127.0.0.1 の HTTP サーバーを立てて callback を受ける。初回認証後は refresh token を XDG state ディレクトリ（`~/.local/state/okibasho/`、`XDG_STATE_HOME` 準拠）にパーミッション 0600 のファイルで保存し、毎回のブラウザログインを不要にする。設定ファイル（`~/.config/okibasho/`）とは置き場所を分ける。OS Credential Store は使わない（ネイティブ依存を持ち込むと単一 JS バンドル配布が崩れる）。token をログに出さない。独自の Personal API Token は作らない。

### Cognito Identity Pool

認証プロバイダは上記 User Pool。unauthenticated access は無効にする。

Attributes for access control で、User Pool の `email` クレームをプリンシパルタグ `email` にマッピングする（カスタムマッピング）。

authenticated role の信頼ポリシー。`sts:TagSession` を忘れるとプリンシパルタグが乗らず、原因の分かりにくい `AccessDenied` になる。

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "cognito-identity.amazonaws.com" },
    "Action": ["sts:AssumeRoleWithWebIdentity", "sts:TagSession"],
    "Condition": {
      "StringEquals": { "cognito-identity.amazonaws.com:aud": "<identity-pool-id>" },
      "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "authenticated" }
    }
  }]
}
```

クライアントは id_token を Identity Pool に渡し、一時 IAM クレデンシャルを得る。Cognito のアクセストークンには `email` クレームが入らないため、id_token を使う。

### 内部ページの閲覧（Signed Cookie）※独自ドメイン導入後

pages Distribution に Trusted Key Group を設定する。CloudFront の公開鍵は CDK で作り、秘密鍵は SSM SecureString に置く。

発行するのは `/auth/*` の Lambda 1 つ。app Distribution のビヘイビアとして Function URL を紐づける。

- `POST /auth/pages-cookie`、`Authorization: Bearer <id_token>`
- `aws-jwt-verify`（AWS 公式ライブラリ）で JWKS 検証してから署名する
- `Domain=.share.example.jp` / `Secure` / `HttpOnly` / `SameSite=Lax` で `CloudFront-Policy` / `CloudFront-Signature` / `CloudFront-Key-Pair-Id` を Set-Cookie

Signed Cookie は閲覧専用で、漏れても内部ページの閲覧以外の権限を持たない。1 ページが複数ファイルを参照するため、Signed URL ではなく Signed Cookie を使う。有効期間は 24 時間。切れたら下記の再認証フローが走るだけなので、長さに神経質にならない。

管理 UI のセッション Cookie（もし持つなら）は `__Host-` プレフィックスを付ける。`__Host-` は `Domain` 指定付きでは設定できないため、pages 上の untrusted JS からの cookie tossing（親ドメイン Cookie の送りつけ）で app session を上書きできない。

未ログインで閲覧 URL を開いたときのフロー:

```text
pages.share.example.jp/p/<user>/<slug>/ → 403
 → CloudFront カスタムエラーページ（元URLを持って app へ飛ばす小さなHTML）
 → app: Cognito ログイン（済んでいればスキップ）
 → POST /auth/pages-cookie で Signed Cookie 発行
 → 元の pages URL へリダイレクト
```

`cloudfront.net` は Public Suffix List に載っているため親ドメイン Cookie を設定できない。この機能は独自ドメイン導入後にしか有効化できない。それまで pages 側は閲覧認証なしで検証する。ドメイン関連の分岐は `domains.ts` の 1 箇所に閉じ込め、他の構成に波及させない。

## S3構造

```text
pages/
  <email>/                        例: tanaka@example.jp
    <slug>/                       例: q3-report
      index.html
      assets/...
      .metadata.json              このページの正本
```

- `users/<sub>/<slug>.json` のインデックスは持たない。二重書き込みをしない
- My Pages = `ListObjectsV2(Bucket, Prefix: 'pages/<email>/', Delimiter: '/')` の CommonPrefixes が slug 一覧。各 slug の `.metadata.json` を並列 GetObject して詳細を取る。数十ページなら十分。将来遅くなったら、メタ情報をキー名に埋める等の手を考える
- slug の一意性はユーザー単位。他人と衝突しないので、グローバルな slug 予約も条件付き書き込みによる排他制御も不要
- slug の許可文字は `[a-z0-9][a-z0-9_-]{0,63}`。大文字は S3 キーと URL の大文字小文字問題を避けるため受け付けず、暗黙の変換もしない。`.` で始まる名前、`/`、`..`、`.metadata.json` は拒否する
- `.metadata.json` の内容:

```json
{
  "slug": "q3-report",
  "owner": "tanaka@example.jp",
  "createdAt": "2026-08-26T04:00:00Z",
  "expiresAt": "2026-09-25T04:00:00Z",
  "share": {
    "id": "V1StGXR8_Z5jdHi6B-myT",
    "basic": {
      "username": "guest",
      "salt": "dGhpcyBpcyBhIHNhbHQ",
      "hash": "…sha256の16進64桁…"
    },
    "allowedCidrs": ["203.0.113.0/24"]
  }
}
```

`expiresAt` が `null` なら無期限。クライアントが書くので自己申告だが、影響は自分の prefix とストレージコストだけで他人には及ばない。

`share` は外部共有の設定で、無ければ外部共有していない。フィールドの詳細は「外部共有」節にある。

`.metadata.json` は配信対象 prefix の中にある。pages origin は untrusted であり、所有者メールがページ配下から読めても、管理アプリのセッションや他人のページには届かない。ユーザーが同名ファイルをアップロードすると正本と衝突するので、クライアントは `.metadata.json` をアップロード対象から除外する。

### S3 の設定

- 完全 private + Public Access Block。S3 Website Hosting は使わない
- バケットバージョニングは有効にしない（「消したら消える」を優先する）
- CORS を設定する（ブラウザから直接 PUT / LIST / DELETE するため。忘れると Web UI だけ落ちる）

```json
[{
  "AllowedOrigins": ["https://app.share.example.jp"],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3000
}]
```

`POST` は `DeleteObjects` が使う。開発時は `http://localhost:<port>` も AllowedOrigins に足す。

- S3 Lifecycle ルールとオブジェクトタグは使わない。期限切れ削除は cleanup Lambda に一本化する

CloudFront から読めるのを配信対象の prefix（`pages/`）だけに制限する bucket policy を置く。OAC には `s3:GetObject` に加えて `s3:ListBucket` を与える。存在しないファイルに 403 ではなく 404 を返すためである。403 を認証失敗、404 をファイル欠落として扱う。

## アップロード

Web と CLI は API を持たない。Identity Pool の一時クレデンシャルで S3 に直接 PutObject / ListObjectsV2 / DeleteObjects する。

slug の指定は任意。web は省略時に乱数（小文字英数字 10 文字）を自動生成し、CLI は従来どおり省略時にパス名から生成する。決定した slug を使って以降の PutObject に進む。

```text
1. Cognito ログイン（Authorization Code + PKCE）→ id_token
2. Identity Pool から一時 IAM クレデンシャルを取得
3. ディレクトリを走査し、pages/<email>/<slug>/ 配下へ PutObject
4. 同じ prefix を List し、今回のアップロードに含まれないキーを DeleteObjects
   （.metadata.json はここでは消さない）
5. .metadata.json を最後に書く
6. https://pages.share.example.jp/p/<user>/<slug>/ を表示
```

再アップロードは同じ prefix を上書きする。バージョンディレクトリは持たない。ファイルが減ったり名前が変わったりしたときに古いオブジェクトが残ると、公開 URL からいつまでも読めてしまう。4 の差分削除がこれを防ぐ。`.metadata.json` がある限り cleanup は孤児とみなさない。

途中で失敗すると中途半端なファイルが残りうる。削除は冪等にし、`.metadata.json` が無い孤児 prefix は cleanup が回収する。

同じ slug への同時アップロードは想定しない。触れるのは所有者本人の prefix だけであり、自分で 2 箇所から同時に上げる状況はまず起きない。仮に起きても IAM 上は両方成功し、後から書いたオブジェクトが残る。

## URL解決

内部向けの公開 URL は `/p/<user>/<slug>/`。実装は `packages/infra/lib/functions/pages-router.js`（pages Distribution のデフォルトビヘイビアに viewer-request として付ける CloudFront Function。`/p/` 以外は 404 にする）。ランタイムは `cloudfront-js-2.0` を指定する（1.0 だと `String.prototype.endsWith` などが使えない）。

- `%2f` / `.` / `..` / 空セグメント / `.metadata.json` を含む URI は 404 にする
- `@` を含む user を弾く。`/a@b.jp@example.jp/` のような入力で別ユーザーの prefix を指させないため
- `/p/<user>/<slug>` に完全一致するなら末尾 `/` 付きへ 301 する（クエリ文字列は保持）。スラッシュ無しのまま HTML を返すと、ページ内の相対パスが壊れる
- 末尾 `/` なら `index.html` を補い、`/pages/<user>@<domain>/<slug>/...` へ書き換える。ドメイン名は CDK からビルド時に埋め込む
- Lambda@Edge も S3 Website Hosting も使わない

外部向けの URL 解決（`/s/*`）は別の CloudFront Function（`share-router.js`）が担う。詳細は次の「外部共有」節にまとめる。

## 外部共有

ページ単位で、ログインなしでも見られる URL を発行できる。正本は `.metadata.json` の `share` フィールドで、無ければそのページは外部共有していない。

### 同一 Distribution に `/s/*` を足した理由

別 Distribution や第 3 ホストにはしていない。Trusted Key Group・CloudFront Function・Response Headers Policy・Cache Policy はいずれもビヘイビア単位で設定できるため、1 つの Distribution に `/p/*`（内部）と `/s/*`（外部共有）を共存させられる。

- Signed Cookie は今後も `/p/*` だけに付ける。`/s/*` には付けない
- カスタムエラーレスポンス（404 → `errors/404.html`。403 は将来の Signed Cookie ログイン誘導のために設定しない）は Distribution 単位の設定だが、CloudFront Function が返したレスポンスには適用されない。そのため `/s/*` が返す 401 / 403 / 404 はこの導線に巻き込まれない

Distribution 単位の設定は `/s/*` にも及ぶ副作用がある。

- Geo restriction（JP のみ）は `/s/*` にも効くため、外部共有も日本国外からは見られない。現状は受容し、海外の相手に共有する要件が出たら別 Distribution を再検討する
- `enableIpv6: false` は pages Distribution 全体に効く。`/s/*` の CIDR 判定を IPv4 に絞るための設定である

### `/p/` と `/s/` が同一 origin であることのリスク評価

内部ページには現状ページ単位のアクセス制御が無く、内部ユーザーなら誰でも読める。`/s/` の HTML がログイン済み内部ユーザーのブラウザで `/p/` を same-origin で読めても、その内部ユーザーが元々読めるもの以上には届かない。外部の閲覧者は Signed Cookie を持たないため `/p/` は読めない。Service Worker の scope はスクリプトのディレクトリ配下に限られ、S3 からは `Service-Worker-Allowed` ヘッダを返せないので、あるページの Service Worker が他のページの経路を奪うこともできない。

もう一つ考えるべき経路がある。同じブラウザに残った別の共有ページの資格情報を使う手口である。チームメンバーが自分の共有ページ B（`/s/B/`）に JS を仕込むと、同じブラウザにキャッシュされた別ページ A（`/s/A/`）向けの Basic 資格情報（realm はどの共有 URL でも `okibasho` で共通なので、A 用に入力した認証情報がブラウザから B にも送られうる）や、A が許可している IP からのアクセスを使って `/s/A/` を same-origin で読める可能性がある。それでも結論は変わらない。B の作者はチームメンバーであり `/p/` から A の元ページをそのまま読めるうえ、この経路には A の share-id を事前に知っている必要がある。知らなければ `/s/A/` を開けない。B にアップロードされた HTML が第三者の CDN スクリプトを読み込んでいる場合は、その JS が A を読めればスクリプト提供元にも A の内容が渡りうる点だけは明記しておく。

したがって origin 分離の境界は「app と pages の間」のままで足りており、`/s/` を第 3 origin にする動機は無い。次のいずれかが起きたら再検討する。

- ページ単位の内部アクセス制御を入れる
- 外部ユーザーがアップロードできるようにする

### share-id とアクセス制御

share-id はクライアント（web / CLI）が CSPRNG で生成する 128bit の値を base64url（パディングなし）にした 22 文字（`/^[A-Za-z0-9_-]{22}$/`）。share-id 自体が推測困難な credential であり、Basic 認証や IP 制限はその上に足す二要素目という位置付けである。試行回数制限は無い。

- Basic 認証のユーザー名・パスワードは印字可能な ASCII に限る。ブラウザと CloudFront Function で非 ASCII の文字コード解釈がずれ、ハッシュが一致しなくなるため
- パスワードは平文で保存しない（salt 付き SHA-256）。UI にも再表示しない
- IP 制限は IPv4 CIDR を 1〜20 件

### KVS エントリと投影の規則

CloudFront KeyValueStore には、正本（`.metadata.json` の `share`）から導出した投影だけを置く。エントリには生きている共有と墓標の 2 種類がある。

```json
{ "p": "pages/<email>/<slug>/", "b": "<salt>:<hash>", "c": ["203.0.113.0/24"] }   // 生きている共有
{ "t": "pages/<email>/<slug>/" }                                                 // 墓標。t は元の所有 prefix
```

- key は share-id、value はこの JSON 文字列（1KB 以内。超えたらそのエントリは投影しない）
- `b` は Basic 設定があるときだけ、`c` は CIDR があるときだけ
- 各エントリの「所有 prefix」は `p` または `t`。`p` / `t` は projector が S3 キー（`pages/<email>/<slug>/.metadata.json`）から導出する。`.metadata.json` の中身（owner / slug）は信用しない
- どちらも無い・JSON 不正のエントリは、projector しか書かないため解釈できないものとして削除してよい

墓標は、停止・再発行・削除・期限切れで消えた share-id を空きにせず、他のページがその id を使って旧 URL を横取りするのを防ぐ。以前は KVS から消えた直後の id を、別のチームメンバーがたまたま同じ id を書いた metadata で再利用できてしまう余地があった。墓標は消さない（KVS 5MB の上限に対して 30 人規模なら十分収まる）。

投影は S3 イベントに頼らず、5 分ごとの全件 reconcile だけで行う。実装は `packages/infra/lib/lambda/share-projector/`。反映経路を 1 本にすることで、イベントの順序・重複・取りこぼしを考えなくて済むようにしている。反映は最大 5 分遅れるが、チーム向けツールとして許容する。

- 対象 prefix は「metadata がある prefix」∪「KVS に生きているエントリまたは墓標がある prefix」の和集合。対象ごとに、その prefix の現在の `.metadata.json` を S3 から読み直して「あるべき状態」を決める。イベントの順序や重複には依存しない
- あるべき状態が無いのは、metadata が無い / JSON 不正 / `share` 無し / `share` の検証に失敗 / `expiresAt` を過ぎている / KVS 値が 1KB を超える、のいずれか。この場合はその prefix の生きているエントリを全部墓標に置き換える
- 同じ prefix に生きたエントリが複数残ることがある（reconcile は全部見る。先頭 1 件だけ見ない）
- あるべき id が既に別 prefix の所有物（生き/墓標問わず）であれば書かない（hijack 警告としてログに出す）。このとき、同じ prefix の生きているエントリで id が異なるものは墓標にする
- それ以外は、同じ prefix の生きているエントリで id が異なるものを墓標にしたうえで、あるべき id を put する。同じ prefix の墓標であれば復活してよい（例: 期限切れ後に保存期間を延ばした場合）。値が変わらないときは書かない
- 同じ id を複数の prefix が同時に desire し、どちらにも既存エントリが無い場合は、prefix の辞書順で先の 1 つだけを採用し、残りは hijack 警告にする
- `UpdateKeys`（IfMatch = `DescribeKeyValueStore` の ETag）は 50 キーごとにチャンク分割する。同じ Key を 1 回の呼び出しに 2 度含めない。`ConflictException` は ETag を取り直してリトライする
- 監査用に、put・墓標化・delete それぞれで prefix（email/slug を含む）と share-id を出す。share-id はログに全体を出さない（先頭 4 文字 + `…`）

cleanup Lambda は KVS を直接知らない。期限切れ（`expiresAt` 超過）や削除は `.metadata.json` の書き換え・消失を通じて次の reconcile で検出され、墓標に置き換わる。

共有を OFF にする操作は `share` フィールドを削除すること。URL の再発行は `share.id` の差し替えで行う。どちらも旧 id は墓標として KVS に残り続け、再利用されない。

projector の `Errors` メトリクスに CloudWatch Alarm を付けている（5 分で 1 件以上、欠損データは notBreaching）。projector は共有停止・期限切れの反映経路そのものであり、壊れても気づけないと停止した共有が見え続けるおそれがあるため。環境変数 `ALERT_EMAIL`（`packages/infra/.env.example` 参照）を設定すると SNS Topic 経由でメール通知する。未設定ならアラームは作るが通知はしない。

### エッジでの判定順（`/s/*` viewer-request）

実装は `packages/infra/lib/functions/share-router.js`。

1. `/s/<id>` のみ（末尾スラッシュ無し）→ 301 `/s/<id>/`（クエリ保持）
2. `%2f` / `.` / `..` / 空セグメント / `.metadata.json` → 404（`/p/*` と同じパス検査）
3. id が `/^[A-Za-z0-9_-]{22}$/` に合わない、または KVS に無い → 404
4. `allowedCidrs`（`c`）があり viewer の IP がどれにも入らない → 403
5. `basic`（`b`）があり `Authorization` が一致しない → 401 + `WWW-Authenticate: Basic realm="okibasho", charset="UTF-8"`
6. URI を投影先の prefix + rest に書き換える（末尾 `/` なら `index.html` を補完）。`Authorization` ヘッダは削除して転送しない

エラーレスポンスの body は短い固定文言にする。

### 外部向けに新たに塞いだもの

- S3 の `NoSuchKey` エラー XML に `pages/<email>/<slug>/...` が出て、メールアドレスとキー構成が見えてしまう問題。CloudFront はオリジンが 400 以上を返すと viewer-response の CloudFront Function を実行しないため、当初検討していた viewer-response（error-scrubber）による差し替えは一度も動かない。代わりに Distribution のカスタムエラーレスポンス（404 → `/errors/404.html`）で差し替える。エラーページは owner や URL の情報を含まない固定文言の HTML で、`BucketDeployment` で pages バケットの `errors/` に配置し、関数を付けない `/errors/*` ビヘイビアから配信する。403 は将来の Signed Cookie ログイン誘導に使うため設定しない。roadmap の当初の課題（Phase 1「404 で S3 のエラー XML を返さない」）もこれで対応した。デプロイ後の確認はまだ済んでいない
- `.metadata.json` の配信。share-router 側の文字列検査に加え、bucket policy でも CloudFront サービスプリンシパルからの `pages/*/.metadata.json` への `s3:GetObject` を Deny する（`packages/infra/lib/constructs/pages-storage.ts`）。Function の文字列比較だけだと、percent-encode されたパスの解釈に依存してしまうための二重化である
- Referer 経由の share-id 漏れ。Response Headers Policy に `Referrer-Policy: no-referrer` を追加した
- 検索エンジンによる索引化。同じポリシーに `X-Robots-Tag: noindex, nofollow` を追加した

### 受容している share-id の漏れ経路

次の経路からの share-id 漏れは対策せず受容する。

- ブラウザの閲覧履歴
- チャットやメールの本文（URL をそのまま貼って共有するため）
- CloudFront の標準アクセスログ。現在は無効化しており出力されない。将来有効化する場合は、share-id を含む URL をログに残すことになるため share-id を credential として扱い、ログ用バケットを private にする
- CloudTrail の KVS データイベント。データイベントを有効化しなければ出力されない

## 保存期間

デフォルト 30 日。ユーザー操作で無期限に変更できる。

閲覧時に期限を検査する仕組みは持たない。閲覧経路は CloudFront → S3 の直配信で Lambda を通らず、`expiresAt` を評価するコードが動く場所がないためである。期限の実施は cleanup Lambda に一本化する。

仕組み:

- `.metadata.json` の `expiresAt` が唯一の判定材料
- EventBridge Scheduler が 1 時間ごとに cleanup Lambda を起動する
- cleanup Lambda:
  1. `ListObjectsV2(Prefix: 'pages/')` をページネーションで走査する
  2. キーを `pages/<email>/<slug>/` 単位でグループ化する（キーの先頭 3 セグメント）
  3. 各グループについて `.metadata.json` が無ければ孤児として prefix ごと削除する（アップロード中断で発生しうる）
  4. あれば GetObject し、`expiresAt` が現在時刻を過ぎていれば prefix ごと `DeleteObjects` する（冪等・再実行可能に書く）
- 削除処理は CLI / Web の削除と同じ関数を使う。ロジックを 2 本持たない

metadata キーだけを拾う走査では、`.metadata.json` が一度も書けていない孤児を見つけられない。全キーをグループ化してから metadata の有無を見る。

期限切れから実際に消えるまで最大 1 時間のズレが出る。チーム向けツールとして十分であり、その間は URL を知っていればまだ見られる。

保存期間の変更は `.metadata.json` の `expiresAt` を書き換えるだけである。オブジェクトタグも Lifecycle も追随させない。`createdAt` は初回アップロードの値を維持する。

再アップロード（同一 slug への上書き）では `expiresAt` を再計算する。temporary ページの期限は更新のたびにリセットされ、再共有し直したページが 30 日で消えない。permanent 化済みのページは `--permanent` を付けずに再アップロードしても permanent のまま維持する（temporary への変更は保存期間変更の操作で行う）。

## 管理UI（web）

静的 SPA。S3 + CloudFront で配信する。SSR もサーバー関数も使わない。

フレームワークは TanStack Start の SPA モード + prerender。成果物は静的ファイルのみとし、app Distribution の S3 origin から配信する。

API クライアントは書かない。ブラウザから直接 AWS SDK for JavaScript v3 で S3 を叩く。

全ページログイン必須。SPA のルート直下に認証ゲートを置き、未ログインで開くと即 Cognito Managed Login へリダイレクトする。ログイン画面やログインボタンは持たない。唯一の例外は `/callback`（Managed Login からのリダイレクト先）。

画面:

- `/`（トップ）: 上にアップロード（単一ファイル / ディレクトリ / drag & drop、保存期間の選択、slug の指定は任意で、省略すれば乱数の slug を自動生成する）、下に自分のページ一覧（URL コピー・保存期間変更・削除・再アップロード）。一覧の「再アップロード」はアップロードフォームに slug をセットしてスクロールする。`?slug=` クエリもこの画面が受ける
- `/callback`（ログインコールバック処理。未ログインでも到達できる唯一のルート）
- 404

App Distribution のルーティング:

```text
/auth/*  → Signed Cookie 発行 Lambda（Function URL）。独自ドメイン未設定ならこの behavior は作らない
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
- `okiba <path> [--name <slug>] [--permanent]` — 走査して PutObject、差分削除、`.metadata.json` を書き、URL を表示
- `okiba list` — `ListObjectsV2`
- `okiba rm <slug>` — `DeleteObjects`（冪等）

走査時は path traversal を拒否する（`../`、絶対パス、ドライブレター）。symlink は無視する。Content-Type は拡張子から判定して付ける。

CLI の対象は開発者と AI エージェントに割り切る。開発環境がないユーザーは Web UI の drag & drop を使う前提のため、単一バイナリ配布はしない。

OAuth / PKCE は既存ライブラリ（openid-client）を使い、独自実装を最小限にする。

## CDK

単一スタック。`lib/constructs/` に機能ごとに分ける。

```text
lib/
  okibasho-stack.ts        各 Construct の組み立てだけ
  config.ts                  環境変数から emailDomain / domains を読む
  constructs/
    auth.ts                  UserPool / Managed Login / App Client x2 /
                             IdentityPool / authenticated role / principal tag
    pages-storage.ts         pages バケット（private, PAB, CORS）/ errors/ への BucketDeployment /
                             .metadata.json への bucket policy Deny
    pages-delivery.ts        pages Distribution / OAC / CloudFront Function（/p/* /s/*）/
                             /errors/* ビヘイビアとカスタムエラーレスポンス /
                             Response Headers Policy / Geo restriction
    external-share.ts        CloudFront KeyValueStore + share projector Lambda
                             （5 分ごとの全件 reconcile。Errors アラーム）
    app-delivery.ts          app バケット + Distribution + SPA 用 CloudFront Function
```

share projector 本体（`packages/infra/lib/lambda/share-projector/`）は SigV4A が必要な `@aws-sdk/client-cloudfront-keyvaluestore` を呼ぶため、副作用 import で純 JS の `@aws-sdk/signature-v4a` を読み込んでいる（ネイティブの `@aws-sdk/signature-v4-crt` は使わない）。`NodejsFunction` の bundling では `@aws-sdk/*` を external にしない。

Signed Cookie 発行 Lambda・cleanup・PreSignUp・ドメイン関連（Route 53 / ACM）の Construct は、それぞれの機能の導入と同時に追加する。導入順は [roadmap.md](roadmap.md) にある。

環境ごとに変わる値（メールドメイン、デプロイ先、独自ドメイン）はリポジトリに持たず、`packages/infra/.env`（git 管理外）かシェルの環境変数で渡す。項目は `packages/infra/.env.example` にある。メールドメインだけは必須で、未設定なら synth の時点で止める。

`config.domains` が未設定でも `cdk synth` が通ること。ドメイン関連の分岐は 1 つの Construct に閉じ込め、他の構成に波及させない。未設定の間は CloudFront のデフォルトドメインで構築し、証明書・Route 53・Signed Cookie 閲覧認証は作らない。

Identity Pool は L2 Construct（`aws-cdk-lib/aws-cognito-identitypool`）を使う。attributes for access control（principal tag マッピング）は L2 で設定できないため、`CfnIdentityPoolPrincipalTag` で補う。

GitHub Actions からの `cdk deploy` はアクセスキーを置かず、OIDC プロバイダ + 引受ロールで行う。

### スタック削除

使わなくなったときに `cdk destroy` で認証基盤と配信基盤を消す。作り直しは想定しない。

- User Pool は `DESTROY`。Hosted UI ドメインも一緒に消える
- 管理 UI 用バケットは `DESTROY` + `autoDeleteObjects`。ビルドし直せる静的ファイルだけなので中身ごと消す
- pages バケットは `RETAIN`。アップロード済みオブジェクトはスタック削除後も残る。`autoDeleteObjects` は付けない。課金は続くので、不要なら手で空にしてバケットを消す
- CloudFront など残りのリソースはデフォルトどおり消える。Distribution の削除は完了まで待たされる
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
- Web での slug 指定は任意。省略時は乱数（小文字英数字 10 文字）を自動生成する。生成関数 `generateRandomSlug`（`packages/cli/src/page/slug.ts`）を web と CLI で共有する。CLI は従来どおり `--name` 省略時にパス名から slug を作り、この挙動は変えない

サイズ・ファイル数は IAM で強制できない。`PutObject` には `s3:content-length-range` に相当する条件キーがなく、それは presigned POST policy 限定のためである。クライアント側で次の目安を置き、超えたら送る前に弾く。サーバー側の強制は持たない。逸脱は請求アラートで見つける。

| 対象 | 上限 |
| --- | --- |
| 1ファイル | 50 MB |
| 1ページ合計 | 200 MB |
| ファイル数 | 200 |

## ログ

CloudWatch Logs に最低限、Signed Cookie 発行の成功/失敗、cleanup の削除件数、authorization 失敗を記録する。JWT と refresh token はログに出さない。

cleanup は削除した prefix を残し、誤削除の調査に使えるようにする。

share-id は credential として扱い、ログに全体を出さない。share projector は監査用に put・墓標化・delete ごとに prefix と share-id の先頭 4 文字 + `…` を出す。

## テスト

テストランナーは Vitest に統一する。設定はパッケージごとの `vitest.config.ts` に置き、ルートの `pnpm test` が `pnpm -r test` で各パッケージへ委譲する。

CloudFront Function は `node:vm` で handler を直接実行する。rewrite、`@` を含む user の 404、末尾スラッシュの 301、index.html 補完を確認する。share-router.js は KVS の get をモックし、id 形式、IP 制限、Basic 認証、rewrite の各分岐を確認する。

share projector（`packages/infra/lib/lambda/share-projector/`）は S3 / KVS の SDK 呼び出しをモックせず、`validate.ts`（検証・期限切れ・KVS 値の直列化）と `plan.ts`（あるべき状態と実際の KVS の差分計算）を純粋関数として単体テストする。

CDK は `Template.fromStack()` の snapshot テストを正とする。個別リソースのアサーションは、意図を明示したい箇所（bucket が private であること、CORS があること、pages Distribution に OAC と Function が付いていること、authenticated role のポリシーと信頼ポリシー、unauthenticated access が無効であること）にだけ足す。

snapshot は `.env` や環境変数を読まず、固定のメールドメインだけを渡し、env / domains が未設定の状態で合成する。これにより「設定が空でも synth が通る」という制約がテストで守られる。

IAM の境界は、別ユーザーの prefix に書こうとすると `AccessDenied` になることをテストで確認する。実 AWS が要る確認はデプロイ後に回し、単体ではポリシー文書の形をアサートする。

## パッケージ構成

```text
packages/
  infra/   AWS CDK（単一スタック、機能境界は Construct）
  web/     管理UI（静的 SPA。S3 + CloudFront で配信）
  cli/     okiba（Node.js のみ。AWS CLI に依存しない）
```

`packages/api` と `packages/shared` は置かない。API が存在しないため、共有すべき API 型もない。slug 規則、S3 キー組み立て、拡張子→ Content-Type、path traversal 検査は `packages/cli` 側に置き、`web` から相対 import する。必要になった時点で小さな共有モジュールを切り直す。

## やらないこと

API Gateway / REST API / JWT Authorizer / DynamoDB / Lambda@Edge / WAF / S3 Lifecycle + オブジェクトタグ / presigned URL / `packages/api` / `packages/shared` / 既存 ALB との統合 / 外部共有専用の第 3 origin。

CloudFront KeyValueStore は外部共有の投影先として採用した。「使わない」の対象からは外れる。

外部共有専用の第 3 origin は作らない。`/s/*` は既存の pages Distribution にビヘイビアとして追加しており、origin は増えていない（理由は「外部共有」節）。

ALB は S3 をターゲットにできず、Lambda ターゲット経由だとレスポンス 1MB 上限で配信に使えないため、この構成には組み込みどころがない。

## 検討の経緯

- [decision-adpot-iam-direct.md](decision-adpot-iam-direct.md) — 旧設計（静的 SPA + API Gateway + JWT Authorizer + presigned PUT）を破棄し、Identity Pool の一時クレデンシャルで S3 を直接操作する現設計を採用した判断
- [notes-optional-metadata.md](notes-optional-metadata.md) — S3 直置きと `.metadata.json` 任意化の検討メモ（未採用）
