# アーキテクチャ

決定済みの設計だけを書く。検討中の論点は [open-questions.md](open-questions.md) にある。決まったらここへ移す。

旧設計（静的 SPA + API Gateway + JWT Authorizer + presigned PUT）は破棄した。判断の経緯は [decision-adpot-iam-direct.md](decision-adpot-iam-direct.md) にある。本書が設計の正本である。

## 全体構成

```text
   ブラウザ（管理UI）                        CLI（share-html）
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
        │ OAC
   CloudFront（pages.share.example.jp / UNTRUSTED）
        └ CloudFront Function: /p/<user>/... → /pages/<user>@<domain>/... + index.html 補完
        └ Trusted Key Group: Signed Cookie 必須（独自ドメイン導入後）
        └ Response Headers Policy / Geo restriction

   CloudFront（app.share.example.jp / TRUSTED）
        ├ /auth/*  → Lambda（Signed Cookie 発行）
        └ /*       → S3（管理UIの静的ファイル）

   EventBridge Scheduler（1時間ごと）→ Lambda（期限切れ cleanup）
```

使う AWS サービス: S3 / CloudFront / Cognito User Pool / Cognito Identity Pool / Lambda（3つ） / EventBridge Scheduler / Route 53 / ACM。IaC は AWS CDK（TypeScript）。

Lambda は次の 3 つ。どれも小さく独立している。API Gateway は無い。認可は IAM ポリシーに委譲する。

- Signed Cookie 発行（独自ドメイン導入後）
- cleanup（期限切れと孤児の削除）
- PreSignUp（メールドメイン制限。Google IdP 追加時）

CDK のスタックは 1 つとし、機能的・概念的な境界は Construct で表現する（auth / storage / delivery / app-site / cleanup / domains）。Stack 本体は各 Construct の組み立てだけを行う。スタック分割による cross-stack reference の複雑さは持ち込まない。

DynamoDB、WAF、Lambda@Edge、API Gateway、CloudFront KeyValueStore、S3 Lifecycle、presigned URL は使わない。

## origin と URL 空間

trusted な管理アプリと untrusted な共有ページを別 origin に分ける。ここでいう origin は scheme・hostname・port の組である。

| origin | 信頼 | 用途 |
| --- | --- | --- |
| `app.share.example.jp` | trusted | ログイン、アップロード UI、My Pages、Signed Cookie 発行 |
| `pages.share.example.jp` | untrusted | アップロードされた HTML・JS・CSS・画像 |

アップロードされた HTML には任意の JavaScript（AI 生成コードを含む）が入りうる。管理アプリと同一 origin にすると DOM・storage・Cookie へアクセスできてしまう。この境界にブラウザの Same-Origin Policy をそのまま使う。

| URL | 公開範囲 | 認証 | Distribution | S3 key |
| --- | --- | --- | --- | --- |
| `https://pages.share.example.jp/p/<user>/<slug>/` | 社内（ログイン必須） | Signed Cookie 必須（独自ドメイン導入後） | pages | `pages/<email>/<slug>/` |

`<user>` はメールのローカル部だけを見せる。全員が同じ Workspace ドメインなので、ドメイン部は CloudFront Function で静的に補完する。

ホスト名は `app` / `pages` とする。旧設計にあった URL 共有用 origin（`share`）は持たない。閲覧は社内メンバーに限定し、社外への URL 共有はスコープ外とする。

CloudFront の Distribution は app 用と pages 用の 2 つ。Signed Cookie、Response Headers Policy、403 時の認証導線を別々の設定として持つ。

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
- 旧設計の `metadata.ownerSub == currentUser.sub` 照合は持たない。アプリのバグで他人のページを壊せない
- `s3:prefix` 条件があるため、`ListObjectsV2` には必ず prefix を渡す。渡さないと `AccessDenied`
- CDK のレビュー時はこのポリシーと、ロールの信頼ポリシー（次節）を重点的に見る

cleanup Lambda のロールだけは prefix 制限のない権限を持つ。IAM の境界の外にある唯一の処理であり、レビュー対象である。

## 認証

### Web

Cognito User Pool に Google Workspace を外部 IdP として連携する。Managed Login を使う（ログイン画面を自作しない）。会社の Workspace ドメインのアカウントのみ許可する。

メールドメイン制限は PreSignUp Lambda トリガーで実装する。`event.request.userAttributes.email` のドメインと `email_verified` を検証し、不一致なら reject する。

導入は段階的に行う。当面は Cognito のローカルユーザー（管理者作成）で運用し、Google IdP と PreSignUp は後から追加する。Managed Login + Authorization Code + PKCE というフローは変わらないため、クライアント側の変更は不要（[roadmap.md](roadmap.md) 参照）。

App Client は 2 つ。どちらも public client（client secret なし）+ PKCE。

- web 用: callback は `https://app.share.example.jp/callback`。開発時は `http://localhost:3000/callback`
- cli 用: callback は `http://127.0.0.1:<port>/callback`（localhost 許可）。Cognito は callback URL をポートまで含めた完全一致で照合するため、空きポートを動的に 1 つだけ選ぶことはできない。候補ポート `8976` `8977` `8978` を登録し、空いている最初のポートを使う。全部使用中ならポートを空けるよう伝えて終了する

メールアドレスが S3 キーになる。User Pool 側でメールを小文字に正規化する。`+` 付きアドレスは PreSignUp で拒否する。キーの揺れを増やさないためである。

### CLI

Web と CLI で認証方式を分けず、同じ User Pool を使う。CLI のログインは OAuth 2.0 Authorization Code + PKCE。CLI が一時的に 127.0.0.1 の HTTP サーバーを立てて callback を受ける。初回認証後は refresh token を `~/.config/share-html/` 配下にパーミッション 0600 で保存し、毎回のブラウザログインを不要にする。token をログに出さない。独自の Personal API Token は作らない。

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

### 社内ページの閲覧（Signed Cookie）※独自ドメイン導入後

pages Distribution に Trusted Key Group を設定する。CloudFront の公開鍵は CDK で作り、秘密鍵は SSM SecureString に置く。

発行するのは `/auth/*` の Lambda 1 つ。app Distribution のビヘイビアとして Function URL を紐づける。

- `POST /auth/pages-cookie`、`Authorization: Bearer <id_token>`
- `aws-jwt-verify`（AWS 公式ライブラリ）で JWKS 検証してから署名する
- `Domain=.share.example.jp` / `Secure` / `HttpOnly` / `SameSite=Lax` で `CloudFront-Policy` / `CloudFront-Signature` / `CloudFront-Key-Pair-Id` を Set-Cookie

Signed Cookie は閲覧専用で、漏れても社内ページの閲覧以外の権限を持たない。1 ページが複数ファイルを参照するため、Signed URL ではなく Signed Cookie を使う。

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
- slug の許可文字は `[a-z0-9][a-z0-9_-]{0,63}`。`.` で始まる名前、`/`、`..`、`.metadata.json` は拒否する
- `.metadata.json` の内容:

```json
{
  "slug": "q3-report",
  "owner": "tanaka@example.jp",
  "createdAt": "2026-08-26T04:00:00Z",
  "expiresAt": "2026-09-25T04:00:00Z"
}
```

`expiresAt` が `null` なら無期限。クライアントが書くので自己申告だが、影響は自分の prefix とストレージコストだけで他人には及ばない。

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

公開 URL は `/p/<user>/<slug>/`。pages Distribution の viewer-request に CloudFront Function を付ける。ランタイムは `cloudfront-js-2.0` を指定する（1.0 だと `String.prototype.endsWith` などが使えない）。

```js
function handler(event) {
  var req = event.request;
  var m = req.uri.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!m) return { statusCode: 404, statusDescription: 'Not Found' };
  var user = m[1];
  if (user.indexOf('@') !== -1) {
    return { statusCode: 404, statusDescription: 'Not Found' };
  }
  var rest = m[2] || '/';
  if (/^\/[^/]+$/.test(rest)) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: '/p/' + user + rest + '/' } },
    };
  }
  if (rest.endsWith('/')) rest += 'index.html';
  req.uri = '/pages/' + user + '@example.jp' + rest;
  return req;
}
```

実装では次を満たす。

- `@` を含む user を弾く。`/p/a@b.jp@example.jp/` のような入力で別ユーザーの prefix を指させないため
- `/p/<user>/<slug>` に完全一致するなら末尾 `/` 付きへ 301 する。スラッシュ無しのまま HTML を返すと、ページ内の相対パスが壊れる
- ドメイン名は CDK からビルド時に埋め込む。KeyValueStore もマッピングテーブルも不要
- Lambda@Edge も S3 Website Hosting も使わない

## 保存期間

デフォルト 30 日。ユーザー操作で無期限に変更できる。

旧設計の「論理期限（閲覧時に 404/410）」は廃止する。pages 側は CloudFront → S3 の直配信で Lambda を通らないため、`expiresAt` を評価するコードが動く場所が存在しない。設計上の穴だった。

新しい方式:

- `.metadata.json` の `expiresAt` が唯一の判定材料
- EventBridge Scheduler が 1 時間ごとに cleanup Lambda を起動する
- cleanup Lambda:
  1. `ListObjectsV2(Prefix: 'pages/')` をページネーションで走査する
  2. キーを `pages/<email>/<slug>/` 単位でグループ化する（キーの先頭 3 セグメント）
  3. 各グループについて `.metadata.json` が無ければ孤児として prefix ごと削除する（アップロード中断で発生しうる）
  4. あれば GetObject し、`expiresAt` が現在時刻を過ぎていれば prefix ごと `DeleteObjects` する（冪等・再実行可能に書く）
- 削除処理は CLI / Web の削除と同じ関数を使う。ロジックを 2 本持たない

metadata キーだけを拾う走査では、`.metadata.json` が一度も書けていない孤児を見つけられない。全キーをグループ化してから metadata の有無を見る。

期限切れから実際に消えるまで最大 1 時間のズレが出る。社内ツールとして十分であり、その間は URL を知っていればまだ見られる。

保存期間の変更は `.metadata.json` の `expiresAt` を書き換えるだけである。オブジェクトタグも Lifecycle も追随させない。`createdAt` は初回アップロードの値を維持する。

## 管理UI（web）

静的 SPA。S3 + CloudFront で配信する。SSR もサーバー関数も使わない。

フレームワークは TanStack Start の SPA モード + prerender（既存の選定を維持する）。成果物は静的ファイルのみとし、app Distribution の S3 origin から配信する。

API クライアントは書かない。ブラウザから直接 AWS SDK for JavaScript v3 で S3 を叩く。

画面:

- ログイン（Cognito Managed Login へリダイレクト → callback で id_token を得る）
- アップロード（単一ファイル / ディレクトリ / drag & drop、slug 指定、保存期間の選択）
- My Pages（一覧・URL コピー・保存期間変更・削除）

App Distribution のルーティング:

```text
/auth/*  → Signed Cookie 発行 Lambda（Function URL）。独自ドメイン未設定ならこの behavior は作らない
それ以外  → 管理UI用 S3 origin（404 は SPA シェルへ rewrite）
```

## CLI

TypeScript + Node.js で書き、npm で配布する。実行は `npx share-html`。依存は単一 JS にバンドルする。AWS CLI のインストールを前提にしない。

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

- `share-html login` — PKCE + 127.0.0.1 コールバック + refresh token 保存
- `share-html <path> [--name <slug>] [--permanent]` — 走査して PutObject、差分削除、`.metadata.json` を書き、URL を表示
- `share-html list` — `ListObjectsV2`
- `share-html rm <slug>` — `DeleteObjects`（冪等）

走査時は path traversal を拒否する（`../`、絶対パス、ドライブレター）。symlink は無視する。Content-Type は拡張子から判定して付ける。

CLI の対象は開発者と AI エージェントに割り切る。開発環境がないユーザーは Web UI の drag & drop を使う前提のため、単一バイナリ配布はしない。

OAuth / PKCE は既存ライブラリ（openid-client）を使い、独自実装を最小限にする。

## CDK

単一スタック。`lib/constructs/` に機能ごとに分ける。

```text
lib/
  page-share-stack.ts        各 Construct の組み立てだけ
  config.ts                  env / domains を集約（domains は任意）
  constructs/
    auth.ts                  UserPool / Managed Login / App Client x2 /
                             PreSignUp トリガー / IdentityPool / authenticated role
    storage.ts               pages バケット（private, PAB, CORS）
    delivery.ts              pages Distribution / OAC / CloudFront Function /
                             Key Group / Response Headers Policy / Geo restriction
    app-site.ts              app バケット + Distribution + /auth/* の Lambda
    cleanup.ts               EventBridge Scheduler + cleanup Lambda
    domains.ts               Route 53 + ACM（config.domains 未設定なら作らない）
```

`config.domains` が未設定でも `cdk synth` が通ること。ドメイン関連の分岐は `domains.ts` の 1 箇所に閉じ込め、他の構成に波及させない。未設定の間は CloudFront のデフォルトドメインで構築し、証明書・Route 53・Signed Cookie 閲覧認証は作らない。`config.domains` に `share` は持たない（URL 共有 origin は廃止した）。

Identity Pool の L2 Construct（`aws-cdk-lib/aws-cognito-identitypool`）が使用中の aws-cdk-lib バージョンで安定版として入っているか確認する。attributes for access control（principal tag マッピング）が L2 で設定できない場合は、`CfnIdentityPoolRoleAttachment` の escape hatch を使う。

GitHub Actions からの `cdk deploy` はアクセスキーを置かず、OIDC プロバイダ + 引受ロールで行う。実装は Phase 5。

## 配信

Lambda から HTML やアセットを配信しない。Range Request・Cache-Control・ETag などの静的配信をアプリで再実装しないため、pages Distribution は CloudFront → OAC → Private S3 とする。

Response Headers Policy は CDK で付ける。アプリのコードは 1 行も要らず、origin 分離が破れたときの保険になる。

| Distribution | ヘッダ |
| --- | --- |
| pages | `X-Content-Type-Options: nosniff`、`Cross-Origin-Opener-Policy: same-origin`、`Content-Security-Policy: frame-ancestors 'none'` |
| app | HSTS と CSP |

CloudFront の Geo restriction を日本に絞る。無料である。WAF は月額コストが乗るので入れない。

再アップロードは同じ key の上書きなので、CloudFront のキャッシュが残ると古い内容と新しい内容が混ざる。pages 側は短い TTL（60 秒）にする。invalidation は持たない。クライアントに `cloudfront:CreateInvalidation` を足すと IAM の境界が広がり、案 3 の狙いを損なう。社内ツールとして最大 60 秒の遅れは許容する。app 配信の静的ファイルはハッシュ付きアセットを長期キャッシュし、シェルだけ短くする。

## 入力の扱い

- Content-Type は拡張子から判定して保存する。判定には標準の MIME 判定ライブラリを使い、対応表を自作しない。未知の拡張子は `application/octet-stream` にする
- pages は任意の HTML・JS が動く前提の untrusted origin なので、Content-Type を偽られてもリスクは増えない。origin 分離を採用した時点で、強制の動機は消えている
- ディレクトリアップロードでは path traversal を防ぐ。`../`、絶対パス、ドライブレターを拒否し、S3 key は必ず `pages/<email>/<slug>/` 配下に限定する
- symlink は無視する
- slug は `[a-z0-9][a-z0-9_-]{0,63}`。ページ直下に `index.html` が無いアップロードは拒否する

サイズ・ファイル数は IAM で強制できない。`PutObject` には `s3:content-length-range` に相当する条件キーがなく、それは presigned POST policy 限定のためである。クライアント側で次の目安を置き、超えたら送る前に弾く。サーバー側の強制は持たない。逸脱は請求アラートで見つける。

| 対象 | 上限 |
| --- | --- |
| 1ファイル | 50 MB |
| 1ページ合計 | 200 MB |
| ファイル数 | 200 |

## ログ

CloudWatch Logs に最低限、Signed Cookie 発行の成功/失敗、cleanup の削除件数、authorization 失敗を記録する。JWT と refresh token はログに出さない。

cleanup は削除した prefix を残し、誤削除の調査に使えるようにする。

## テスト

テストランナーは Vitest に統一する。設定はパッケージごとの `vitest.config.ts` に置き、ルートの `pnpm test` が `pnpm -r test` で各パッケージへ委譲する。

CloudFront Function は `node:vm` で handler を直接実行する。rewrite、`@` を含む user の 404、末尾スラッシュの 301、index.html 補完を確認する。

CDK は `Template.fromStack()` の snapshot テストを正とする。個別リソースのアサーションは、意図を明示したい箇所（bucket が private であること、CORS があること、pages Distribution に OAC と Function が付いていること、authenticated role のポリシーと信頼ポリシー、unauthenticated access が無効であること）にだけ足す。

snapshot は `config.env` / `config.domains` が未設定の状態で合成する。これにより「設定が空でも synth が通る」という制約がテストで守られる。

IAM の境界は、別ユーザーの prefix に書こうとすると `AccessDenied` になることをテストで確認する。実 AWS が要る確認はデプロイ後に回し、単体ではポリシー文書の形をアサートする。

## パッケージ構成

```text
packages/
  infra/   AWS CDK（単一スタック、機能境界は Construct）
  web/     管理UI（静的 SPA。S3 + CloudFront で配信）
  cli/     share-html（Node.js のみ。AWS CLI に依存しない）
```

`packages/api` と `packages/shared` は置かない。API が存在しないため、共有すべき API 型もない。slug 規則、S3 キー組み立て、拡張子→ Content-Type、path traversal 検査は `packages/cli` 側に置き、`web` から相対 import する。必要になった時点で小さな共有モジュールを切り直す。

## やらないこと

API Gateway / REST API / JWT Authorizer / DynamoDB / Lambda@Edge / WAF / S3 Lifecycle + オブジェクトタグ / presigned URL / CloudFront KeyValueStore / `packages/api` / `packages/shared` / 既存 ALB との統合 / 社外向け URL 共有 origin。

ALB は S3 をターゲットにできず、Lambda ターゲット経由だとレスポンス 1MB 上限で配信に使えないため、この構成には組み込みどころがない。
