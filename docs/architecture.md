# アーキテクチャ

決定済みの設計だけを書く。検討中の論点は [open-questions.md](open-questions.md) にある。決まったらここへ移す。

## 全体構成

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

使うAWSサービス: S3 / CloudFront / Cognito / API Gateway HTTP API / Lambda / Route 53 / ACM。IaCはAWS CDK（TypeScript）。

CDKのスタックは1つとし、機能的・概念的な境界はConstructで表現する（auth / storage / api / CDNなど）。Stack本体は各Constructの組み立てだけを行う。スタック分割によるcross-stack referenceの複雑さは持ち込まない。

DynamoDB、WAF、Lambda@Edge、Step Functions、EventBridgeはMVPでは使わない。metadataの更新に厳密なtransactionが必要になるほど機能が増えたら、DynamoDB移行を検討する。

## origin分離

trustedな管理アプリと、untrustedなアップロードコンテンツを別originに分ける。

ドメインは後付けできるようにする。CDKではドメイン名・証明書をオプショナルな設定値とし、未設定ならCloudFrontのデフォルトドメインで構築する（origin分離自体はデフォルトドメインでも成立する）。ただしSigned Cookieの閲覧認証は親ドメインCookieが必要なため、独自ドメイン設定後に有効化する。

| origin | 信頼 | 用途 |
| --- | --- | --- |
| `app.share.example.jp` | trusted | ログイン、アップロードUI、My Pages、管理API |
| `pages.share.example.jp` | untrusted | アップロードされたHTML・JS・CSS・画像 |

アップロードされたHTMLには任意のJavaScript（AI生成コードを含む）が入りうる。同一originにすると管理アプリのDOM・storage・Cookieへアクセスできてしまうため、ブラウザのSame-Origin Policyをそのままセキュリティ境界として使う。

CloudFront Distributionもapp用とpages用の2つに分け、origin単位で境界を明確にする。

## 認証

### Web

Cognito User PoolにGoogleを外部IdPとして連携する。会社のWorkspaceドメインのアカウントのみ許可し、少なくとも `email_verified = true` とメールドメインを確認する。

導入は段階的に行う。当面はCognitoのローカルユーザー（管理者作成）で運用し、Google IdPとドメイン制限は後から追加する。Hosted UI + Authorization Code + PKCEというフローは変わらないため、クライアント側の変更は不要（[roadmap.md](roadmap.md) 参照）。

所有者の識別にはCognitoの `sub` を使う。メールアドレスは表示・監査用に保存するだけで、owner keyには使わない（変更されうるため）。

### CLI

WebとCLIで認証方式を分けず、同じUser Poolを使う。App Clientを2つ（Web用・CLI用）作り、CLI用はclient secretなしのpublic clientとする。

CLIのログインはOAuth 2.0 Authorization Code + PKCE。CLIが一時的にlocalhostのHTTPサーバーを立ててcallbackを受ける。初回認証後はrefresh tokenを保存し、毎回のブラウザログインを不要にする。独自のPersonal API TokenはMVPでは作らない。

### API

API GatewayのJWT AuthorizerでCognito JWTを検証する。LambdaでJWT署名検証を実装しない。Lambdaは認証済みclaims（`sub` / `email` / `email_verified`）を受け取る前提で、更新系APIでは必ず `metadata.ownerSub == currentUser.sub` を確認し、違反は403にする。

### pages側の閲覧

pages側もCloudFront Signed Cookieで社内ユーザーに限定する。1ページが複数ファイルを参照するため、Signed URLではなくSigned Cookieを使う。

Signed Cookieは閲覧専用で、漏れても社内共有ページの閲覧以外の権限を持たない。`HttpOnly` / `Secure` / `SameSite=Lax` とする。

Cookieの発行はappが行う。appからsibling domainへ直接Cookieを設定できないため、閲覧用Signed Cookieだけ親ドメイン `Domain=.share.example.jp` で発行する。

- appの管理用session Cookieは `__Host-` プレフィックス付きにする。`__Host-` は `Domain` 指定付きでは設定できないため、pages上のuntrusted JSからのcookie tossing（親ドメインCookieの送りつけ）でapp sessionを上書きできない
- Cookieの有効期間はログインセッションと同程度（具体値は実装担当に委任）。切れたら下記の再認証フローが走るだけ

未ログインで閲覧URLを開いたときのフロー:

```text
pages.share.example.jp/p/<slug>/ → 403
 → CloudFrontカスタムエラーページ（元URLを持ってappへリダイレクトする小さなHTML）
 → app: Cognitoログイン（ログイン済みならスキップ）
 → Signed Cookie発行（Domain=.share.example.jp）
 → 元のpages URLへリダイレクト
```

## アップロード

WebとCLIは同じAPIを使う。ファイル本体はLambdaを経由させず、presigned PUT URLでS3へ直接アップロードする。

```text
Web / CLI
    │ Cognito JWT
    ▼
POST /api/pages ─▶ API Gateway (JWT Authorizer) ─▶ Lambda
                                                    ├ slug確定（指定 or 生成、重複チェック）
                                                    ├ metadata作成
                                                    └ presigned PUT URL発行
Web / CLI ──── PUT ────▶ S3
```

## API

```text
POST   /api/pages          ページ作成（slug指定は任意）+ presigned URL発行
GET    /api/pages          自分のページ一覧
GET    /api/pages/{slug}   ページ取得
PATCH  /api/pages/{slug}   retention変更
DELETE /api/pages/{slug}   削除（冪等にする）
```

DELETEは `pages/<slug>/` と `users/<sub>/<slug>.json` を消す。

## slug

ページの識別子はslugひとつ。アップロード時にユーザーが指定でき、省略時はランダムなIDを生成する。作成後は変更できない（不変）。

slugは一意で、そのままS3の保存パス（`pages/<slug>/`）とURL（`/p/<slug>/`）になる。内部ID（pageId）とslugの二重管理はしない。

名前を変えたい場合は再アップロードする。AIエージェント経由なら再アップロードのコストはほぼない。

## S3構造

DynamoDBを使わず、metadata / indexもS3で管理する。

```text
pages/
  <slug>/
    index.html
    assets/...
    metadata.json      # metadataの正本
users/
  <cognito-sub>/
    <slug>.json        # My Pages一覧用のインデックス
```

一覧は `ListObjectsV2` の prefix 指定で取得する。この規模では十分な性能になる想定。

slugの空き確認は `pages/<slug>/metadata.json` の存在チェックで行う。専用のindexは持たない。

S3にtransactionはないので、削除などの複数オブジェクト更新は、冪等・再実行可能にし、中途半端な状態を検出できるようにする。

Object Tagは検索インデックスには使わず、Lifecycleなどの運用属性（`retention=temporary` など）に限定する。owner情報の正本はmetadata JSON。

## 保存期間

デフォルト30日（temporary）。ユーザー操作で無期限（permanent）に変更できる。

- アクセス可否の正本は `metadata.expiresAt`。期限切れは閲覧時に404/410相当にする（論理期限）
- 物理削除はS3 Lifecycleに任せる。temporaryページにLifecycle対象のタグを付け、無期限ページは対象外にする。retention変更時はタグも更新する

Lifecycleは即時ではないため、論理期限と物理削除の役割を分けている。

## URL解決

slugがそのままS3のkeyなので、動的なlookupは不要。CloudFront Functionは末尾 `/` のリクエストに `index.html` を補完するだけの静的なrewriteを行う。

```text
閲覧リクエスト /p/<slug>/
    ↓ CloudFront Function（index.html補完のみ）
  S3 origin: pages/<slug>/index.html
```

Lambda@EdgeもKeyValueStoreも使わない。

将来「slugの後からの変更（可変slug）」が必要になった場合は、CloudFront Function + KeyValueStoreのマッピング層（エントリがあればそちらへrewrite、なければslugをそのままkeyに使う）を足せば、既存データを移動せずに導入できる。

## 管理UI（web）

TanStack Start（React）を使う。SPAモード + prerenderにより成果物は静的ファイルのみとし、App DistributionのS3 originから配信する。server functionsとSSRは使わない（必要になったら配信方式ごと再検討する）。

App Distributionのルーティング:

```text
/api/*   → API Gateway
それ以外  → 管理UI用S3 origin（404はSPAシェルへrewrite）
```

## CLI

TypeScript + Node.jsで書き、npmで配布する。実行は `npx share-html`。依存は単一JSにバンドルする。

CLIの対象は開発者とAIエージェントに割り切る。開発環境がないユーザーはWeb UIのdrag & dropを使う前提のため、単一バイナリ配布はしない。

OAuth / PKCEは既存ライブラリ（openid-clientなど）を使い、独自実装を最小限にする。token保存の方法は実装担当に委任（OS Credential Storeか、権限を絞ったユーザー専用ディレクトリへのファイル保存。tokenをログに出さない）。

## 配信

LambdaからHTMLやアセットを配信しない。Range Request・Cache-Control・ETagなどの静的配信をアプリで再実装しないため、pages側は CloudFront → OAC → Private S3 とする。

S3 bucketは完全privateにし、Public Access Blockを有効化する。S3 Website Hostingは使わない。CloudFrontは高速化のためというより、private S3を普通のHTTP配信として扱うために使う。

## 入力の扱い

- Content-Typeは拡張子から判定して保存する。クライアントの申告値を無条件に信用しない。可能なら標準MIME判定ライブラリを使う
- ディレクトリアップロードではpath traversalを防ぐ。`../`、絶対パス、ドライブレターを拒否し、S3 keyは必ず `pages/<slug>/` 配下に限定する
- symlinkはMVPでは無視または禁止

## ログ

CloudWatch Logsに最低限、page作成・削除・retention変更・upload失敗・authorization失敗を記録する。JWT、refresh token、presigned URLはログに出さない。

## テスト

テストランナーはVitestに統一する。web（TanStack Start = Vite）と同じランナーを使えるため、パッケージごとに別のランナーを覚えなくてよい。設定はパッケージごとの `vitest.config.ts` に置き、ルートの `pnpm test` が `pnpm -r test` で各パッケージへ委譲する。

CDKは `Template.fromStack()` のsnapshotテストを正とする。個別リソースのアサーションは、意図を明示したい箇所（bucketがprivateであること、OACが付いていることなど）にだけ足す。snapshotは差分レビューの起点であり、テンプレートが意図せず変わったことに気付くための仕掛けとして使う。

snapshotは `config.env` / `config.domains` が未設定の状態で合成する。これにより「設定が空でもsynthが通る」という制約がテストで守られる。
