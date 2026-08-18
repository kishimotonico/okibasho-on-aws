
# 社内向けHTML共有サービス 実装・レビュー資料

## 1. 目的

Claude Code、Codex などのAIエージェントや開発者が生成したHTMLを、社内メンバーへ簡単に共有するための小規模なWebサービスを構築する。

主な用途は以下。

- 分析結果や説明資料をHTMLで共有する
- 簡単なUIモックを共有する
- 単一HTMLだけでなく、画像・CSS・JavaScriptなどを含む複数ファイル構成も共有する
- ブラウザからドラッグ＆ドロップでアップロードする
- Claude Code / Codex 等からCLI経由でアップロードする

社員数は約30名で、アクセス数は少ない。

想定アクセス数は概ね以下。

```text
全ユーザー合計:
10〜100 request/hour 程度
```

高負荷・高可用性・極端な低レイテンシは求めない。

優先順位は以下。

1. シンプルなアーキテクチャ
2. セキュリティ境界が明確であること
3. 運用コストが低いこと
4. AIエージェントや開発者から容易に利用できること
5. AWS上でIaC管理できること

---

# 2. 基本方針

AWS上に以下の構成で実装する。

```text
Google Workspace / Google Account
               │
               ▼
        Cognito User Pool
        ├ Web App Client
        └ CLI App Client
               │
               ▼

       app.share.example.jp
            TRUSTED
               │
          CloudFront
               │
         API Gateway
               │
             Lambda
          ┌────┴────┐
          │         │
     metadata     Presigned PUT
          │         │
          ▼         ▼
                    S3
                     │
                     ▼
       pages.share.example.jp
            UNTRUSTED
               │
          CloudFront
               │
              OAC
               │
               ▼
         Private S3
```

主要AWSサービスは以下。

- Amazon S3
- Amazon CloudFront
- Amazon Cognito
- Amazon API Gateway HTTP API
- AWS Lambda
- Route 53
- ACM
- AWS CDK

DynamoDB、WAF、Lambda@Edge、Step Functions、EventBridge等はMVPでは使用しない。

---

# 3. ドメイン構成

trustedな管理アプリと、untrustedなアップロードコンテンツを別originに分離する。

```text
app.share.example.jp
```

用途:

- ログイン
- アップロードUI
- My Pages
- ページ削除
- slug変更
- retention変更
- API

こちらはtrusted originとして扱う。

---

```text
pages.share.example.jp
```

用途:

- アップロードされたHTML
- JavaScript
- CSS
- 画像
- その他ページ内アセット

こちらはuntrusted originとして扱う。

AIが生成した任意JavaScriptが実行される可能性があるため、管理アプリと同一originにしない。

これにより、

```text
pages.share.example.jp
```

上のJavaScriptから、

```text
app.share.example.jp
```

の以下へ直接アクセスできないようにする。

- DOM
- localStorage
- sessionStorage
- app専用Cookie

ブラウザのSame-Origin Policyをセキュリティ境界として利用する。

---

# 4. 認証

## 4.1 Web

Amazon Cognito User Poolを使用する。

CognitoからGoogleを外部IdPとして利用する。

想定としては会社用Googleアカウントのみ許可する。

例:

```text
@example.co.jp
```

認証フロー:

```text
Browser
  ↓
app.share.example.jp
  ↓
Cognito
  ↓
Google
  ↓
Cognito callback
  ↓
app.share.example.jp
```

Googleが本人確認を行い、アプリ側で許可対象ドメインを判定する。

少なくとも以下を確認する。

```text
email_verified = true
email domain = allowed domain
```

所有者識別にはCognitoの`sub`を主に使用する。

メールアドレスは表示・監査用途として保存する。

```json
{
  "ownerSub": "...",
  "ownerEmail": "user@example.co.jp"
}
```

メールアドレスは変更される可能性があるため、内部的なowner keyとしては使わない。

---

# 5. CLI認証

WebとCLIで独自の認証方式を分けず、同じCognito User Poolを利用する。

Cognito内にApp Clientを2つ作成する。

```text
Cognito User Pool
├ Web App Client
└ CLI App Client
```

CLI App Clientはpublic clientとする。

client secretは使用しない。

認証方式:

```text
OAuth 2.0 Authorization Code
+ PKCE
```

想定UX:

```bash
$ share-html login

Opening browser...
```

CLIがローカルHTTPサーバーを一時的に起動する。

例:

```text
http://127.0.0.1:42831/callback
```

フロー:

```text
CLI
 │
 │ PKCE challenge生成
 │
 ├──────────────▶ Browser
 │                    │
 │                    ▼
 │                 Cognito
 │                    │
 │                    ▼
 │                  Google
 │                    │
 │                    ▼
 ◀──── localhost callback
 │
 │ authorization code
 │
 ▼
Cognito token endpoint
 │
 ▼
access token
refresh token
```

初回認証後はrefresh tokenを保存し、毎回ブラウザログインしなくてよいようにする。

CLIからAPIを呼ぶときは、

```http
Authorization: Bearer <access-token>
```

とする。

API GatewayのJWT AuthorizerでCognito JWTを検証する。

独自のPersonal API TokenはMVPでは実装しない。

---

# 6. CLI実装方針

CLIはNode.jsベースを第一候補とする。

理由:

- Windows環境で利用しやすい
- 単一JSファイルまたは小規模パッケージとして配布しやすい
- `fetch`等が標準利用可能
- Claude Code / Codex等から実行しやすい
- Rustのバイナリ配布より運用が軽い

Bun専用にはしない。

Bunが存在する環境では利用できてもよいが、Node.js互換を基本とする。

想定コマンド:

```bash
share-html login
share-html ./report.html
share-html ./dist/
```

アップロード成功時:

```text
Uploaded 4 files

https://pages.share.example.jp/p/xxxxxxxx/
```

CLIの責務は以下に限定する。

```text
auth
manifest生成
API呼び出し
presigned PUTによるS3 upload
結果URL表示
```

OAuth処理は独立モジュール化する。

例:

```text
cli/
  auth.ts
  upload.ts
  config.ts
```

PKCE等は可能なら既存の標準的なOAuthライブラリを利用し、独自実装を最小限にする。

CLI専用の独自認証プロトコルは作らない。

---

# 7. アップロードフロー

WebとCLIは同じAPIを使用する。

```text
Web / CLI
    │
    │ Cognito JWT
    ▼
POST /api/pages
    │
    ▼
API Gateway
    │ JWT Authorizer
    ▼
Lambda
    │
    ├ pageId生成
    ├ owner取得
    ├ metadata作成
    └ presigned PUT URL生成
              │
              ▼
Web / CLI ───────────────▶ S3
             PUT
```

Lambda経由でファイル本体をアップロードしない。

S3への直接uploadにする。

---

## 7.1 Page作成

例:

```http
POST /api/pages
Authorization: Bearer <jwt>
```

request:

```json
{
  "files": [
    {
      "path": "index.html",
      "contentType": "text/html"
    },
    {
      "path": "assets/chart.png",
      "contentType": "image/png"
    }
  ],
  "retention": "30d"
}
```

response例:

```json
{
  "pageId": "019c...",
  "slug": "019c...",
  "url": "https://pages.share.example.jp/p/019c.../",
  "uploads": [
    {
      "path": "index.html",
      "uploadUrl": "https://..."
    },
    {
      "path": "assets/chart.png",
      "uploadUrl": "https://..."
    }
  ]
}
```

クライアントは各URLへ直接PUTする。

---

## 7.2 Upload完了

必要であれば、

```http
POST /api/pages/{pageId}/complete
```

を設ける。

これにより、

- 必要なファイルがupload済みか
- `index.html`が存在するか
- metadataを公開状態にしてよいか

を確認できる。

MVPで不要と判断すれば省略してもよい。

実装担当側でレビューして決定すること。

---

# 8. ページIDとslug

内部IDと外部URLを分ける。

## pageId

不変。

UUIDまたはUUIDv7等を使用する。

例:

```text
019c1292-...
```

S3の保存パスは常にpageId基準とする。

```text
pages/<page-id>/
```

pageIdはrenameしない。

---

## slug

初期値:

```text
slug = pageId
```

ユーザーが後から変更可能。

例:

```text
https://pages.share.example.jp/p/payment-flow/
```

slug変更時もS3実データは移動しない。

```text
pageId = immutable
slug   = mutable
```

slugは一意でなければならない。

最低限、以下を制限する。

- `/`
- `..`
- URLとして危険な文字
- システム予約語

slugとして許可する文字列は実装時に明文化する。

例:

```regex
[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}
```

日本語slugを許可するかはMVPでは必須ではない。

---

# 9. S3構造

DynamoDBを使用せず、小規模なmetadata/indexもS3で管理する。

想定構造:

```text
pages/
  <page-id>/
    index.html
    assets/
      app.js
      chart.png
    metadata.json

users/
  <cognito-sub>/
    <page-id>.json

slugs/
  <slug>.json
```

---

## 9.1 Page metadata

```text
pages/<page-id>/metadata.json
```

例:

```json
{
  "id": "019c...",
  "slug": "payment-flow",
  "ownerSub": "cognito-sub",
  "ownerEmail": "user@example.co.jp",
  "createdAt": "2026-08-18T12:00:00+09:00",
  "updatedAt": "2026-08-18T12:00:00+09:00",
  "expiresAt": "2026-09-17T12:00:00+09:00",
  "retention": "temporary",
  "entrypoint": "index.html",
  "fileCount": 4
}
```

これをmetadataの正本とする。

---

# 10. User index

My Pages取得用。

```text
users/<cognito-sub>/<page-id>.json
```

内容は最小限でよい。

例:

```json
{
  "id": "019c...",
  "slug": "payment-flow",
  "createdAt": "...",
  "expiresAt": "..."
}
```

一覧取得:

```text
ListObjectsV2
Prefix = users/<current-user-sub>/
```

この規模では十分な性能となる想定。

---

# 11. Slug index

```text
slugs/<slug>.json
```

例:

```json
{
  "pageId": "019c..."
}
```

slugからpageIdを解決する。

slug変更時:

```text
DELETE slugs/<old-slug>.json
PUT    slugs/<new-slug>.json
UPDATE pages/<page-id>/metadata.json
UPDATE users/<sub>/<page-id>.json
```

S3にはtransactionがない。

したがって更新処理は、

- 冪等
- 再実行可能
- 中途半端な状態を検出可能

にすること。

厳密なtransactionが必要になるほど機能が増えた場合はDynamoDB移行を検討する。

現段階ではS3のみとする。

---

# 12. Object Tag

Object Tagを検索インデックスとしては使わない。

Object Tagは主にLifecycleや運用属性に使用する。

例:

```text
retention=temporary
page-id=019c...
```

owner情報の正本はmetadata JSONとする。

Object Tagのowner検索は前提としない。

---

# 13. 保存期間

デフォルト:

```text
30日
```

ユーザー操作によって:

```text
無期限
```

へ変更できる。

metadata:

```json
{
  "retention": "temporary",
  "expiresAt": "..."
}
```

無期限:

```json
{
  "retention": "permanent",
  "expiresAt": null
}
```

---

## 13.1 論理期限

閲覧時に期限切れページを表示しない。

```text
expiresAt < now
```

であれば404または410相当とする。

---

## 13.2 物理削除

S3 Lifecycleを利用する。

temporary pageにLifecycle対象となるタグを設定する。

ただしLifecycle処理は即時ではないため、

```text
アクセス可否の正本 = metadata.expiresAt
物理削除 = S3 Lifecycle
```

と役割を分ける。

無期限ページはLifecycle対象外とする。

retention変更時にはタグも更新する。

---

# 14. HTML配信

LambdaからHTMLやアセットを直接配信しない。

```text
pages.share.example.jp
    ↓
CloudFront
    ↓
Private S3
```

とする。

理由:

- HTML
- CSS
- JavaScript
- image
- large asset
- Range Request
- Cache-Control
- ETag

などの静的配信機能をアプリ側で再実装しないため。

今回CloudFrontは高速化目的よりも、

```text
private S3を安全かつ普通のHTTP配信として扱う
```

ために使用する。

---

# 15. S3公開設定

S3 Bucketは完全privateとする。

Public Access Blockを有効化する。

CloudFrontからのみ読み取り可能にする。

```text
CloudFront
   ↓
OAC
   ↓
S3
```

S3 Website Hostingは使用しない。

---

# 16. pages側の認証

`pages.share.example.jp`も社内認証済みユーザーのみ閲覧可能とする。

CloudFront Signed Cookieを利用する。

```text
Cognito login
   ↓
app.share.example.jp
   ↓
CloudFront Signed Cookie
   ↓
pages.share.example.jp
   ↓
CloudFront
   ↓
S3
```

Signed URLではなくSigned Cookieを基本とする。

理由:

一つのページが、

```text
index.html
app.js
style.css
image.png
```

など複数ファイルを参照するため。

---

# 17. Cookie設計

管理アプリの認証CookieとCloudFront閲覧Cookieを分離する。

## App session

用途:

```text
app.share.example.jp
```

に限定。

管理操作:

- upload
- delete
- slug変更
- retention変更
- My Pages

に使用。

---

## CloudFront Signed Cookie

用途:

```text
pages.share.example.jp
```

の閲覧のみ。

可能な限り、

```text
HttpOnly
Secure
SameSite=Lax
```

を使用する。

pages側から管理APIの認証情報を取得できない設計とする。

Signed Cookieが漏洩した場合でも、

```text
社内共有ページの閲覧
```

以外の操作権限を持たせない。

---

# 18. Cookie発行方式

`app.share.example.jp`からsibling domainである

```text
pages.share.example.jp
```

専用Cookieを直接設定できない点に注意する。

実装候補は以下のどちらか。

### 案A

親ドメインCookie:

```text
Domain=.share.example.jp
```

CloudFront閲覧Cookieのみを共有する。

App管理用Cookieは、

```text
Domain=app.share.example.jp
```

に限定。

MVPではこちらを第一候補とする。

---

### 案B

pages側に小さな認証callbackを用意する。

```text
app
 ↓
one-time code
 ↓
pages/auth/callback
 ↓
pages domain cookie発行
```

セキュリティ分離はより明確だが、実装が増える。

MVPでは過剰な可能性が高い。

実装担当には案Aを基本案としてレビューしてもらう。

---

# 19. CloudFront構成

CloudFront Distributionは2つを基本とする。

```text
AppDistribution
PagesDistribution
```

理由はパスではなくorigin単位でセキュリティ境界を明確化するため。

---

## App Distribution

```text
app.share.example.jp
```

origin:

```text
API Gateway
```

必要に応じて管理UIのstatic assetも扱う。

管理UIの配信方法は以下のどちらでもよい。

- Lambda/APIからHTMLを返す
- 管理UI専用S3 originを置く

MVPでは構成が単純な方を選ぶ。

---

## Pages Distribution

```text
pages.share.example.jp
```

origin:

```text
Private S3
```

OAC使用。

CloudFront Signed Cookie必須。

---

# 20. URL解決

ユーザーURL:

```text
https://pages.share.example.jp/p/<slug>/
```

内部的には、

```text
slug
 ↓
pageId
 ↓
pages/<page-id>/index.html
```

へ解決する必要がある。

ここは実装時に方式を決める。

候補:

### A. CloudFront Functionでrewrite

軽量なURL変換のみEdgeで行う。

ただしslug → pageIdのdynamic lookupが必要な場合は単純なCloudFront Functionのみでは難しい。

### B. slugをS3 keyとしてredirect/resolveする仕組み

### C. `/p/<page-id>/`を初期MVP URLとし、custom slugを後からredirectで扱う

この部分は実装上の重要レビュー項目。

**slugを変更してもS3の実データを移動しない**という原則は維持する。

実装担当には、CloudFront/S3の責務を過度に複雑にせずにslug解決できる方式を提案してもらう。

---

# 21. API

最低限以下を想定。

```text
POST   /api/pages
GET    /api/pages
GET    /api/pages/{id}
PATCH  /api/pages/{id}
DELETE /api/pages/{id}
POST   /api/pages/{id}/complete
```

必要に応じてAPI数は削減してよい。

---

## POST /api/pages

用途:

- pageId生成
- metadata作成
- presigned PUT URL発行

---

## GET /api/pages

現在のログインユーザーのページ一覧。

```text
users/<sub>/
```

を利用する。

---

## PATCH /api/pages/{id}

変更可能:

```text
slug
retention
```

owner変更はMVP対象外。

---

## DELETE /api/pages/{id}

以下を削除する。

```text
pages/<id>/
users/<sub>/<id>.json
slugs/<slug>.json
```

削除処理は冪等にする。

---

# 22. Authorization

API Gateway JWT Authorizerを利用する。

Lambda自身でJWTの署名検証を実装しない。

Lambdaには認証済みclaimsが渡される前提。

利用する主要claim:

```text
sub
email
email_verified
```

各更新APIでは必ずowner確認を行う。

```text
metadata.ownerSub == currentUser.sub
```

でなければ403。

---

# 23. Web UI

MVPでは簡素でよい。

最低限:

```text
Login
Upload
My Pages
```

Upload画面:

- HTML単体
- ディレクトリ
- drag & drop
- retention選択
  - 30日
  - 無期限

アップロード成功後:

```text
https://pages.share.example.jp/p/<slug>/
```

をコピー可能にする。

---

# 24. My Pages

最低限表示:

```text
slug
URL
createdAt
expiresAt
retention
```

操作:

```text
URLコピー
slug変更
30日 / 無期限変更
削除
```

高度な管理UIは不要。

---

# 25. セキュリティ前提

アップロードされたHTMLはtrustedではない。

以下を前提とする。

- 任意JavaScriptが含まれる
- AI生成コードが含まれる
- 外部サイトへ通信するコードが含まれる可能性がある
- バグを含む可能性がある

したがって、

```text
管理originとcontent originを分離
```

する。

同時に、pages側から管理APIを呼ばれたとしても、管理用credentialが送られない設計とする。

---

# 26. Content-Type

アップロード時にContent-Typeを適切に保存する。

少なくとも以下。

```text
.html  text/html
.css   text/css
.js    application/javascript
.json  application/json
.png   image/png
.jpg   image/jpeg
.svg   image/svg+xml
```

可能であれば標準MIME判定ライブラリを利用する。

ユーザー入力のContent-Typeを無条件に信用しない。

---

# 27. Path validation

directory uploadではpath traversalを防止する。

禁止例:

```text
../
/absolute/path
C:\...
```

S3 keyは必ず、

```text
pages/<page-id>/<relative-path>
```

配下に限定する。

symlinkについてもCLI側で扱いを明示する。

MVPでは、

```text
symlinkは無視または禁止
```

でよい。

---

# 28. サイズ制限

大規模ファイル共有サービスではない。

適切な上限を設定する。

初期候補:

```text
1ファイル: 50〜100 MB
1ページ合計: 100〜500 MB
ファイル数: 100〜1000程度
```

具体値は実装担当レビュー時に決める。

目的は、

```text
HTML資料・簡単なモック
```

なので極端に大きなアップロードは不要。

---

# 29. CLI設定保存

CLIは最低限以下を保存する。

```text
refresh token
Cognito metadata
```

Windowsではユーザーディレクトリ配下へ保存する。

可能ならOS Credential Storeを利用する。

ただしMVPで依存関係が大幅に増える場合は、ファイル保存でもよい。

その場合:

- ユーザー専用ディレクトリ
- 適切な権限設定
- tokenをログに出さない

こと。

---

# 30. Logging

最低限以下をCloudWatch Logsへ記録する。

- page作成
- page削除
- slug変更
- retention変更
- upload failure
- authorization failure

JWTやrefresh token、presigned URLそのものはログに出さない。

---

# 31. IaC

AWS CDKを使用する。

言語はTypeScriptを第一候補とする。

SAMよりCDKを優先する理由:

このシステムはLambdaだけではなく、

```text
S3
CloudFront
OAC
Cognito
API Gateway
Route53
ACM
```

を組み合わせるため。

想定構成:

```text
infra/
  bin/
  lib/
    auth.ts
    storage.ts
    api.ts
    cloudfront.ts
    dns.ts
```

分割は過剰にしない。

1 Stackでも問題ない。

---

# 32. MVPで実装する機能

必須:

- Google/Cognitoログイン
- 特定Google Workspaceドメイン制限
- HTML単体アップロード
- ディレクトリアップロード
- Web drag & drop
- Node.js CLI
- CLI Authorization Code + PKCE
- presigned PUT upload
- private S3
- CloudFront配信
- app/pages origin分離
- CloudFront Signed Cookie
- UUID pageId
- URL発行
- default 30日
- 無期限
- My Pages
- slug変更
- 削除

---

# 33. MVPで実装しないもの

不要:

- 管理者ロール
- 複雑なRBAC
- 他人のpage編集
- 組織/チーム
- コメント
- version管理
- page履歴
- analytics
-全文検索
- DynamoDB
- RDS
- WAF
- Lambda@Edge
- Step Functions
- ECS
- Kubernetes
- MCP server
- Rust専用CLI
- CI/CD upload統合
- 外部公開
- password sharing

MCPは将来的に必要ならCLI/APIのwrapperとして追加できる。

---

# 34. 将来拡張候補

必要になった場合のみ検討する。

- MCP
- GitHub Actions upload
- page title
- description
- search
- shared-with
- expiration延長
- owner transfer
- admin view
- access log
- page versioning
- custom retention期間
- DynamoDBへのmetadata移行
- pages originのより厳密なcookie分離

---

# 35. 実装担当に確認してほしい点

以下についてレビューを依頼する。

## Architecture

- CloudFront Distributionをapp/pagesで2つに分ける設計が妥当か
- CloudFront Signed Cookieの発行方法
- `.share.example.jp` scopeのSigned Cookieで十分な安全性を確保できるか
- appの認証credentialがpagesへ漏れないか

## Cognito

- Web + CLI App Client構成
- Authorization Code + PKCE
- localhost callback
- Google federation
- 特定メールドメイン制限

## S3

- metadata/indexをS3だけで管理する設計
- users/ prefixによるMy Pages
- slugs/ index
- Lifecycle + retention tag
- concurrent update時の扱い

## URL

特に以下は実装前に設計を確認したい。

```text
https://pages.share.example.jp/p/<slug>/
```

から、

```text
pages/<page-id>/index.html
```

へ解決する方式。

CloudFront/Lambda/S3の構成を不必要に複雑にしない方法を提案してほしい。

## CLI

- Node.jsで十分シンプルに実装可能か
- OAuth/PKCEに適切な既存ライブラリがあるか
- token storage
- directory upload
- presigned PUT upload

---

# 36. 設計上の基本原則

実装時には以下を優先する。

```text
Simple > Feature rich

Standard AWS feature > Custom implementation

Browser security boundary > Application-level workaround

Shared auth model > Separate custom CLI token

Private S3 + CloudFront > Lambda static file proxy

Presigned S3 upload > Lambda file relay

S3 metadata > Database
    ※現規模・現要件に限る
```

ただし「AWSサービスを増やせばベストプラクティスになる」という判断は避ける。

対象は30人規模の小さな社内ツールである。

---

# 37. 完成イメージ

Web:

```text
1. app.share.example.jp を開く
2. Googleログイン
3. HTMLまたはディレクトリをdrop
4. 30日 / 無期限を選択
5. Upload
6. URLが表示される
7. 社内メンバーへURL共有
```

CLI:

```bash
$ share-html login
Opening browser...
Authenticated.

$ share-html ./report/
Uploading 4 files...

https://pages.share.example.jp/p/019c1292-.../
```

slug変更後:

```text
https://pages.share.example.jp/p/payment-flow/
```

閲覧者:

```text
URLを開く
 ↓
未認証ならGoogle認証
 ↓
CloudFront Signed Cookie
 ↓
HTML表示
```

---

# 38. レビュー依頼

この資料をベースに、実装前に以下をレビューしてほしい。

1. 現在のAWS構成に不要な複雑性がないか
2. よりシンプルに置き換えられる箇所がないか
3. セキュリティ境界に問題がないか
4. Cognito / CloudFront Signed Cookieの組み合わせが適切か
5. slug解決方法をどう実装するのが最も単純か
6. S3 metadata/index方式に実運用上の問題がないか
7. CLI OAuthを過剰実装せずに実現できるか
8. MVPから削った方がよい機能がないか
9. 将来の変更を困難にする設計がないか

特に問題がなければ、この設計をベースとして実装へ進める。