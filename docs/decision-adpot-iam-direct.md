# 引き継ぎ: okibasho を「案3（IAM 活用案）」で実装する

## 0. この文書の位置づけ

リポジトリ `page-share-on-aws` の設計を、レビューの結果として大きく変更する。
`docs/` 配下の既存設計の一部は**無効になった**。本書が新しい正本であり、
`docs/` を本書に合わせて書き換えるところから始める。

実装コード自体はまだスケルトンしかないので、捨てるものはほぼない。

## 1. 何を変えたのか（1段落）

旧設計は「静的 SPA + API Gateway + JWT Authorizer + Lambda で REST API を建て、
presigned PUT で S3 に上げる」だった。これを「**認可を IAM ポリシーに委譲し、
ブラウザと CLI が Cognito Identity Pool 経由の一時 IAM クレデンシャルで
S3 を直接操作する**」構成に変える。API Gateway・API Lambda・REST API・
`shared` パッケージがすべて不要になる。

判断の根拠: 30 人規模・10〜100 req/hour の社内ツールで、`docs/concept.md` の
優先順位（シンプル > セキュリティ境界の明確さ > 低コスト）に最も忠実な構成だから。
owner 認可がアプリコードから消え、IAM の Resource ARN に置き換わるため、
アプリのバグで他人のページを壊せなくなる。

## 2. 全体構成

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
        │ OAC
   CloudFront（pages.share.example.jp / UNTRUSTED）
        └ CloudFront Function: /<user>/... → /pages/<user>@<domain>/... + index.html 補完
        └ Trusted Key Group: Signed Cookie 必須
        └ Response Headers Policy / Geo restriction

   CloudFront（app.share.example.jp / TRUSTED）
        ├ /auth/*  → Lambda（Signed Cookie 発行）
        └ /*       → S3（管理UIの静的ファイル）

   EventBridge Scheduler（1時間ごと）→ Lambda（期限切れ cleanup）
```

**Lambda は 2 つだけ**（Signed Cookie 発行 / cleanup）。どちらも小さく独立している。
**API Gateway は 0 個。サーバーサイドのビジネスロジックは 0 行。**

## 3. パッケージ構成

```
packages/
  infra/   AWS CDK（単一スタック、機能境界は Construct）
  web/     管理UI（静的 SPA。S3 + CloudFront で配信）
  cli/     okiba（Node.js のみ。AWS CLI に依存しない）
```

`packages/api` と `packages/shared` は**削除する**。API が存在しないため、
共有すべき API 型もない。slug 規則や拡張子→Content-Type の対応表のような定数は
`packages/cli` 側に置き、`web` から相対 import するか、必要になった時点で
小さな共有モジュールを切り直す。

## 4. 認証・認可（ここが設計の中核）

### 4.1 Cognito User Pool

- Google Workspace を外部 IdP として連携。**Managed Login** を使う（ログイン画面を自作しない）
- メールドメイン制限は **PreSignUp Lambda トリガー**で実装する。
  `event.request.userAttributes.email` のドメインと `email_verified` を検証し、
  不一致なら reject する（20 行程度）
- App Client は 2 つ。どちらも **public client（client secret なし）+ PKCE**
  - web 用: callback は `https://app.share.example.jp/callback`
  - cli 用: callback は `http://127.0.0.1:<port>/callback`（localhost 許可）
- 当面は Google IdP を後回しにして、Cognito のローカルユーザー（管理者作成）で進めてよい。
  Managed Login + Authorization Code + PKCE というフローは変わらないので、
  後から IdP を足してもクライアントのコードは変わらない

### 4.2 Cognito Identity Pool

- 認証プロバイダは上記 User Pool
- **unauthenticated access は無効にする**
- **Attributes for access control** で、User Pool の `email` クレームを
  プリンシパルタグ `email` にマッピングする（カスタムマッピング）

authenticated role の信頼ポリシー（`sts:TagSession` を忘れると `AccessDenied` になる）:

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

### 4.3 権限ポリシー — これが認可の全量

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

**このポリシーが唯一のセキュリティ境界**。旧設計にあった
`metadata.ownerSub == currentUser.sub` の照合はアプリから削除する。
CDK のレビュー時はここを重点的に見ること。

## 5. S3 構造（owner prefix）

```text
pages/
  <email>/                        例: tanaka@example.jp
    <slug>/                       例: q3-report
      index.html
      assets/...
      .metadata.json              このページの正本
```

- `users/<sub>/<slug>.json` のインデックスは**廃止**。二重書き込みをしない
- My Pages = `ListObjectsV2(Bucket, Prefix: 'pages/<email>/', Delimiter: '/')` の
  CommonPrefixes が slug 一覧。各 slug の `.metadata.json` を並列 GetObject して詳細を取る。
  数十ページなら十分。将来遅くなったら、メタ情報をキー名に埋める等の手を考える
- slug の一意性は**ユーザー単位**。他人と衝突しないので、グローバルな slug 予約も
  条件付き書き込みによる排他制御も不要になった
- `.metadata.json` の内容:

```json
{
  "slug": "q3-report",
  "owner": "tanaka@example.jp",
  "createdAt": "2026-08-26T04:00:00Z",
  "expiresAt": "2026-09-25T04:00:00Z"
}
```

`expiresAt` が `null` なら無期限。クライアントが書くので自己申告だが、
影響は自分の prefix とストレージコストだけで他人には及ばない（許容する判断をした）。

### S3 の設定

- 完全 private + Public Access Block。S3 Website Hosting は使わない
- **CORS を設定する**（ブラウザから直接 PUT / LIST するため。忘れると Web UI だけ落ちる）

```json
[{
  "AllowedOrigins": ["https://app.share.example.jp"],
  "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3000
}]
```

- **S3 Lifecycle ルールとオブジェクトタグは使わない**（後述の cleanup に一本化）

## 6. URL 解決（CloudFront Function）

公開 URL は `/<user>/<slug>/`。`<user>` はメールのローカル部だけを見せる。
全員が同じ Workspace ドメインなので、ドメイン部は Function で静的に補完できる
（KeyValueStore もマッピングテーブルも不要）。pages origin は配信専用なので、
パス上の `/p/` 接頭辞は置かない。

pages Distribution の viewer-request に付ける。ランタイムは **`cloudfront-js-2.0`** を指定すること。

```js
function handler(event) {
  var req = event.request;
  var m = req.uri.match(/^\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!m) return { statusCode: 404, statusDescription: 'Not Found' };
  var user = m[1];
  if (user.indexOf('@') !== -1) {
    return { statusCode: 404, statusDescription: 'Not Found' };
  }
  var slug = m[2];
  var rest = m[3] || '/';
  if (rest.endsWith('/')) rest += 'index.html';
  req.uri = '/pages/' + user + '@example.jp/' + slug + rest;
  return req;
}
```

`@` を含む user を弾いているのは、`/a@b.jp@example.jp/` のような入力で
別ユーザーの prefix を指させないため。ドメイン名は CDK からビルド時に埋め込む。

## 7. 閲覧認証（Signed Cookie）※独自ドメイン導入後

- pages Distribution に Trusted Key Group を設定。CloudFront の公開鍵は CDK で作り、
  秘密鍵は SSM SecureString（または Secrets Manager）に置く
- 発行するのは **`/auth/*` の Lambda 1 つ**。app Distribution のビヘイビアとして
  Function URL を紐づける
  - `POST /auth/pages-cookie`、`Authorization: Bearer <id_token>`
  - **`aws-jwt-verify`（AWS 公式ライブラリ）で JWKS 検証**してから署名する
  - `Domain=.share.example.jp` / `Secure` / `HttpOnly` / `SameSite=Lax` で
    `CloudFront-Policy` / `CloudFront-Signature` / `CloudFront-Key-Pair-Id` を Set-Cookie
- 管理 UI のセッション Cookie（もし持つなら）は `__Host-` プレフィックスを付ける。
  pages 上の untrusted JS からの cookie tossing で上書きされないため
- 未ログインで閲覧 URL を開いたときのフロー:

```text
pages.share.example.jp/<user>/<slug>/ → 403
 → CloudFront カスタムエラーページ（元URLを持って app へ飛ばす小さなHTML）
 → app: Cognito ログイン（済んでいればスキップ）
 → POST /auth/pages-cookie で Signed Cookie 発行
 → 元の pages URL へリダイレクト
```

**注意: `cloudfront.net` は Public Suffix List に載っているため親ドメイン Cookie を
設定できない。この機能は独自ドメイン導入後にしか有効化できない。**
それまで pages 側は閲覧認証なしで検証する。

## 8. 保存期間と cleanup

**旧設計の「論理期限（閲覧時に 404/410）」は廃止する。** pages 側は
CloudFront → S3 の直配信で Lambda を通らないため、`expiresAt` を評価するコードが
動く場所が存在しない。設計上の穴だった。

新しい方式:

- `.metadata.json` の `expiresAt` が唯一の判定材料
- EventBridge Scheduler が **1 時間ごと**に cleanup Lambda を起動
- cleanup Lambda:
  1. `ListObjectsV2(Prefix: 'pages/')` をページネーションで走査し、
     `/.metadata.json` で終わるキーだけを拾う
  2. 各 metadata を GetObject し、`expiresAt` が現在時刻を過ぎているものを特定
  3. その prefix を `DeleteObjects` でまとめて削除（冪等・再実行可能に書く）
  4. ついでに `.metadata.json` が存在しない孤児 prefix も回収する
     （アップロード中断で発生しうる）
- 削除処理は CLI / Web の削除と**同じ関数**を使う。ロジックを 2 本持たない

期限切れから実際に消えるまで最大 1 時間のズレが出るが、社内ツールとして十分。

**cleanup Lambda のロールだけは prefix 制限のない権限を持つ**ので、
IAM の境界の外にある唯一の処理になる。ここはレビュー対象。

## 9. CLI（`okiba`）

**Node.js のみで実装する。AWS CLI のインストールを前提にしない。**

依存: `@aws-sdk/client-s3`、`@aws-sdk/credential-providers`、
PKCE 用に `openid-client`（または `node:crypto` で自前実装）、拡張子→MIME の判定ライブラリ。
依存を単一 JS にバンドルして npm 配布（`npx okiba`）。

### `okiba login`

1. 127.0.0.1 の空きポートで一時 HTTP サーバーを立てる
2. Cognito の authorize URL（Authorization Code + PKCE）をブラウザで開く
3. コールバックで受けた code を `/oauth2/token` で交換
4. **refresh token** を保存する。保存先は `~/.config/okibasho/` 配下、パーミッション 0600。
   token をログに出さないこと

### `okiba <path> [--name <slug>] [--permanent]`

```ts
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const idToken = await refreshIdToken()          // 保存済み refresh token から
const credentials = fromCognitoIdentityPool({
  identityPoolId,
  logins: { [`cognito-idp.${region}.amazonaws.com/${userPoolId}`]: idToken },
})
const s3 = new S3Client({ region, credentials })
// prefix は pages/<email>/<slug>/  … email は id_token のクレームから取る
```

処理:
1. slug の検証（後述の未決事項。決めたら明文化して実装する）
2. ディレクトリを再帰的に走査。**path traversal を拒否**（`../`、絶対パス、
   ドライブレター）。**symlink は無視または拒否**
3. 各ファイルを PutObject。Content-Type は**拡張子から判定**して付ける
4. `.metadata.json` を書く
5. `https://pages.share.example.jp/<user>/<slug>/` を表示

その他: `okiba list`（ListObjectsV2）、`okiba rm <slug>`（DeleteObjects、冪等）。

## 10. 管理 UI（`packages/web`）

静的 SPA。S3 + CloudFront で配信する。SSR もサーバー関数も使わない。

フレームワークは自由（TanStack Start の SPA モード + prerender でも、素の Vite + React でも
よい）。**API クライアントは書かない**。ブラウザから直接 AWS SDK for JavaScript v3 で
S3 を叩く。

画面:
- ログイン（Cognito Managed Login へリダイレクト → callback で id_token を得る）
- アップロード（単一ファイル / ディレクトリ / drag & drop、slug 指定、保存期間の選択）
- My Pages（一覧・URL コピー・保存期間変更・削除）

## 11. CDK（`packages/infra`）

単一スタック。`lib/constructs/` に機能ごとに分ける。

```
lib/
  okibasho-stack.ts        各 Construct の組み立てだけ
  config.ts                  既存。env / domains を集約（domains は任意）
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

`config.domains` が未設定でも `cdk synth` が通ること。ドメイン関連の分岐は
`domains.ts` の 1 箇所に閉じ込め、他の構成に波及させないこと。

CDK snapshot テストを Phase 1 から用意する。

**確認事項**: Identity Pool の L2 Construct（`aws-cdk-lib/aws-cognito-identitypool`）が
使用中の aws-cdk-lib バージョンで安定版として入っているか確認する。
attributes for access control（principal tag マッピング）が L2 で設定できない場合は、
`CfnIdentityPoolRoleAttachment` の escape hatch を使う。

## 12. どの案でも入れると決めた改善（実装すること）

1. **CloudFront Response Headers Policy** — pages 側に
   `X-Content-Type-Options: nosniff`、`Cross-Origin-Opener-Policy: same-origin`、
   `frame-ancestors` の制限。app 側に HSTS と CSP。
   アプリのコードは 1 行も要らず、origin 分離が破れたときの保険になる
2. **CloudFront の Geo restriction** — 無料。日本国内（必要なら数か国）に絞る。
   WAF は月 $6〜 かかるので入れない
3. **GitHub Actions OIDC** — アクセスキーを GitHub に置かず、OIDC プロバイダ +
   引受ロールで `cdk deploy` する

## 13. 既知の落とし穴

1. `cloudfront.net` は Public Suffix List 掲載。親ドメイン Cookie が設定できないので、
   Signed Cookie 閲覧認証は独自ドメイン導入後
2. Identity Pool のプリンシパルタグは、ロールの信頼ポリシーに `sts:TagSession` が
   ないと機能しない。忘れると原因の分かりにくい `AccessDenied` になる
3. `s3:prefix` 条件があるため、ListObjectsV2 には**必ず prefix を渡す**。
   渡さないと `AccessDenied`
4. CloudFront Functions のランタイムは `cloudfront-js-2.0` を指定する。
   1.0 だと `String.prototype.endsWith` などが使えない
5. S3 の CORS を忘れるとブラウザからの PUT だけが落ちる（CLI では再現しない）
6. Identity Pool の unauthenticated access は必ず無効にする
7. メールアドレスが S3 キーになる。大文字小文字や `+` 付きアドレスの扱いを
   User Pool 側で正規化しておく
8. 削除の途中失敗で孤児 prefix が残りうる。cleanup 側で回収する設計にしておく

## 14. 未決事項（実装担当が決めて明文化する）

- **slug の許可文字**。最低限 `/`・`..`・URL として危険な文字・予約語を拒否する。
  候補は `[a-z0-9][a-z0-9_-]{0,63}`
- **サイズ・ファイル数の上限をどう受けるか**。この構成では IAM で強制できない
  （`PutObject` には `s3:content-length-range` に相当する条件キーがなく、
  presigned POST policy 限定のため）。S3 Lifecycle + 請求アラートで運用的に受けるか、
  上限を設けないかを決める。**これは案 3 を選んだ時点で受け入れたトレードオフ**
- 管理 UI のフレームワーク
- テストランナー、CI

## 15. やらないこと（明示的にスコープ外）

API Gateway / REST API / JWT Authorizer / DynamoDB / Lambda@Edge / WAF /
S3 Lifecycle + オブジェクトタグ / presigned URL / `packages/api` / `packages/shared` /
既存 ALB との統合。

ALB は S3 をターゲットにできず、Lambda ターゲット経由だとレスポンス 1MB 上限で
配信に使えないため、この構成には組み込みどころがない。

## 16. フェーズ分割と受け入れ条件

方針は「縦に薄く」。統合リスクの高いところを最小構成で早く一周させる。

### Phase 0: 前提（手動）
- AWS アカウントとリージョンの確定 → `config.ts` の `env` を設定
- `cdk bootstrap`
- **独自ドメインの取得と Route 53 hosted zone の用意**（早めにやると Phase 3 の制約が消える）

### Phase 1: 配信の背骨
- pages バケット（private / Public Access Block / CORS）
- pages Distribution + OAC + Response Headers Policy + Geo restriction
- CloudFront Function（`/<user>/` の展開 + index.html 補完）
- CDK snapshot テスト

受け入れ: 手で置いた `pages/test@example.jp/demo/index.html` が
`/test/demo/` で表示される。

### Phase 2: 認証と最初の E2E
- Cognito User Pool + Managed Login + App Client x2（当面ローカルユーザー）
- Cognito Identity Pool + authenticated role + IAM ポリシー + プリンシパルタグ
- CLI: `login`（PKCE + localhost コールバック + token 保存）
- CLI: アップロード（単一ファイル / ディレクトリ、`.metadata.json` 書き込み、URL 表示）

受け入: `okiba login` → `okiba ./dist/` でアップロードし、
発行された URL で閲覧できる（このフェーズでは閲覧認証なし）。
**別ユーザーの prefix に書こうとすると AccessDenied になることをテストで確認する。**

### Phase 3: 閲覧認証 ※独自ドメインが前提
- Route 53 + ACM、app / pages のカスタムドメイン
- CloudFront 公開鍵 + Key Group、秘密鍵を SSM SecureString へ
- `/auth/pages-cookie` Lambda（`aws-jwt-verify` で検証 → 親ドメイン Cookie 発行）
- 403 カスタムエラーページ → app → 元 URL の再認証フロー

受け入: 未ログインで pages URL を開くとログインへ誘導され、ログイン後に元のページが表示される。

### Phase 4: 管理 UI
- 静的 SPA を app バケットへ、app Distribution に origin 追加
- ログイン → Identity Pool → 一時クレデンシャル取得
- アップロード画面（単一 / ディレクトリ / drag & drop、slug 指定、保存期間）
- My Pages（一覧・URL コピー・保存期間変更・削除）

受け入: ブラウザだけでログイン → drag & drop アップロード → URL コピーまでできる。

### Phase 5: 仕上げ
- EventBridge Scheduler + cleanup Lambda（期限切れ削除・孤児回収）
- Google IdP 追加 + メールドメイン制限（PreSignUp トリガー）
- CLI の npm 配布
- CI（typecheck / test / synth）、GitHub Actions OIDC
- 入力検証の詰め（slug 規則の確定を含む）

## 17. 最初にやること

`docs/` を本書に合わせて書き換える。具体的には:

- **`docs/architecture.md`**
  - 全体構成図を差し替え
  - 「API」節を**削除**（REST API が存在しない）
  - 「認証 > API」節（API Gateway JWT Authorizer）を**削除**
  - 「アップロード」節を書き換え（presigned PUT → 一時クレデンシャルで S3 直）
  - 「S3構造」節を書き換え（owner prefix、users インデックス廃止）
  - 「URL解決」節を書き換え（`/<user>/<slug>/` と Function の内容）
  - 「保存期間」節を書き換え（論理期限を廃止し cleanup に一本化した経緯を残す）
  - 「入力の扱い」から **Content-Type 強制の項を削除**。pages は任意の HTML・JS が
    動く前提の untrusted origin なので、Content-Type を偽られてもリスクが増えない。
    origin 分離を採用した時点で消えている懸念だった
  - 「認可は IAM ポリシーに委譲する」という節を新設し、ポリシー全文を載せる
- **`docs/concept.md`** — MVP スコープはほぼ不変。slug の説明を「ユーザー単位で一意」に修正
- **`docs/open-questions.md`**
  - 「upload 完了 API の要否」→ API が存在しないので**項目ごと削除**
  - 「サイズ上限の具体値」→「IAM では強制できない。運用でどう受けるか」に書き換え
  - 「slug の許可文字」はそのまま残す
- **`docs/roadmap.md`** — 上記フェーズ分割に差し替え
- **`README.md`** — パッケージ表から `api` / `shared` を削除、`web` / `cli` の説明を更新

`packages/api` と `packages/shared` の削除、`pnpm-workspace.yaml` と
各 `tsconfig` の参照整理もここで行う。

コミットメッセージは日本語の Conventional Commits で、本文に経緯と目的を書くこと
（`AGENTS.md` のルール）。