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

クライアントが `Authorization: Bearer` で送るのはIDトークンとする。Cognitoのアクセストークンには `email` クレームが入らないため、上の前提を満たすにはIDトークンが要る。アクセストークンで認可してemailを別途取りに行く形にもできるが、そのためだけにCognitoへの呼び出しと権限を増やすのは、この規模では割に合わない。IDトークンの `aud` はApp Client IDなので、JWT Authorizerのaudience設定とそのまま噛み合う。

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

アップロード完了を通知するAPI（`POST /api/pages/{slug}/complete`）は作らない。代わりに、作成時のリクエストで**アップロードするファイル一覧を宣言させ**、その時点で検証する。

- `index.html` がページ直下にあるかは、宣言された一覧を見れば作成時に判定できる。全部アップロードされた後に確認する必要がない
- 各ファイルのサイズもここで宣言させ、presigned URLの署名対象ヘッダに `Content-Length` を含める。これによりクライアントは宣言したサイズちょうどしかPUTできず、上限をS3側で強制できる（presigned PUTにはPOST policyのような `content-length-range` が無いため、この方法で代替する）
- 途中で失敗して一部のファイルしか上がらなかった場合、そのページは壊れたまま残る。完了APIを足せば検出はできるが、MVPでは「もう一度アップロードし直す」で足りる。放置されたページはretentionの期限で自然に消える

この判断のトレードオフは、slugが確保されたのに中身が無いページが生まれうること。ユーザーには別の名前を使ってもらう。ページ数がそもそも多くない規模なので、これで困るまでは仕組みを足さない。

## API

```text
POST   /api/pages          ページ作成（slug指定は任意）+ presigned URL発行
GET    /api/pages          自分のページ一覧
GET    /api/pages/{slug}   ページ取得
PATCH  /api/pages/{slug}   retention変更
DELETE /api/pages/{slug}   削除（冪等にする）
```

DELETEは `pages/<slug>/`、`meta/<slug>.json`、`users/<sub>/<slug>.json` を消す。

## slug

ページの識別子はslugひとつ。アップロード時にユーザーが指定でき、省略時はランダムなIDを生成する。作成後は変更できない（不変）。

slugは一意で、そのままS3の保存パス（`pages/<slug>/`）とURL（`/p/<slug>/`）になる。内部ID（pageId）とslugの二重管理はしない。

名前を変えたい場合は再アップロードする。AIエージェント経由なら再アップロードのコストはほぼない。

許可する文字は `^[a-z0-9][a-z0-9-]{0,63}$`（英小文字・数字・ハイフン、先頭は英数字、1〜64文字）。

- 大文字を許可しないのは、S3のkeyは大文字小文字を区別する一方で人間もURLも区別しないためである。`Report` と `report` が別ページになると事故になる。大文字が来たら小文字へ変換せずエラーにする（slugは不変なので、意図と違うものが確定するより弾いたほうがよい）
- ドットを許可しないので `.` と `..` は自然に弾かれる。`/` も含まれないため、slugがS3のkeyに紛れ込んでprefixを飛び出すこともない
- 予約語のリストは持たない。閲覧URLは `/p/<slug>/` に名前空間が切られていて、appのルートともS3の他のprefixとも衝突しようがないため、禁止語を並べても守るものがない

省略時は `[a-z0-9]` から12文字をランダムに生成する（暗号論的乱数）。生成されたslugも上のパターンを満たす。UUIDにしないのは、URLに載る文字列として短いほうが扱いやすく、この規模では12文字で衝突を心配する必要がないため。

## S3構造

DynamoDBを使わず、metadata / indexもS3で管理する。

```text
pages/
  <slug>/            # pages Distributionから配信される唯一のprefix
    index.html
    assets/...
meta/
  <slug>.json        # metadataの正本（可変データはすべてここ）
users/
  <cognito-sub>/
    <slug>.json      # 所有関係のマーカー（slug と createdAt だけ。可変データは持たない）
```

metadataを `pages/<slug>/` の中に置かないのは、そこがCloudFrontから配信されるprefixだからである。中に置くと `/p/<slug>/metadata.json` で誰でもownerのメールアドレスを読めてしまい、さらにユーザーが `metadata.json` という名前のファイルをアップロードしたときに正本と衝突する。配信対象と管理データのprefixを分ければ、この2つの問題がまとめて消える。CloudFront側で特定パスを弾く例外ルールも要らなくなる。

`users/<sub>/<slug>.json` は My Pages 一覧用のインデックスではなく、**誰がどの slug を持つか**を示すマーカーである。retention や fileCount など可変な値は `meta/` にだけ置き、同じ情報を2箇所に持たない。PATCH など更新系で meta/ と users/ の整合を揃える必要がなくなり、片方だけ成功して表示と実体がずれる余地をなくすため。

一覧は `users/<sub>/` で slug を列挙し、各 `meta/<slug>.json` を読んで組み立てる。マーカーに対応する meta が無い孤立エントリは、一覧取得時に lazy cleanup でマーカーを削除する。専用ジョブを置かず「読んだときに直す」形にする。加えて `packages/api/scripts/reconcile-user-index.ts` を手動実行して、足りないマーカーの作成や余分なマーカーの削除もできる。

一覧の列挙は `users/<sub>/` の ListObjectsV2 で行う。この規模では十分な性能になる想定。

slugの空き確認は `meta/<slug>.json` の存在チェックで行う。専用のindexは持たない。

S3にtransactionはないので、削除などの複数オブジェクト更新は、冪等・再実行可能にし、中途半端な状態を検出できるようにする。

Object Tagは検索インデックスには使わず、Lifecycleなどの運用属性（`retention=temporary` など）に限定する。owner情報の正本はmetadata JSON。

## 保存期間

デフォルト30日（temporary）。ユーザー操作で無期限（permanent）に変更できる。

- アクセス可否の正本は `metadata.expiresAt`。API（所有者向けの取得）は期限切れに410を返す。ただし**pages側の閲覧は現状止まらない**（CloudFront → S3 直結でmetadataを見る層が無いため）。この食い違いの扱いは [open-questions.md](open-questions.md) で未確定
- 物理削除はS3 Lifecycleに任せる。temporaryページにLifecycle対象のタグを付け、無期限ページは対象外にする。retention変更時はタグも更新する

Lifecycleは即時ではないため、論理期限と物理削除の役割を分けている。

`temporary` の `expiresAt` は**常に `createdAt` + 30日**とする。retentionを変更した時刻からの30日ではない。S3 Lifecycleはオブジェクトの作成日からしか日数を数えられないため、論理期限を変更時刻起点にすると「APIはまだ有効と言うのに実体は消えている」「その逆」が起きる。基準を作成日に揃えれば齟齬が出ない。結果として、作成から30日以上経ったページを `permanent` から `temporary` に戻すと即座に期限切れになる。これは意図した挙動で、`temporary` は「作成から30日」という意味だと決めたということ。

論理期限を過ぎたページに対しても retention の変更は許す。物理削除まで猶予があるので、その間に `permanent` へ変えて救えるほうがよい（Lifecycleが既に走っていればファイルは戻らない）。

Lifecycle用のタグは、`pages/<slug>/` 配下についてはpresigned PUTの署名対象に `x-amz-tagging` を含めることで、**アップロードそのものに付けさせる**。後からAPIがタグを付ける形にすると「アップロードが完了したこと」を知る必要があり、完了APIを作らないという判断と噛み合わない。署名対象に入れてあるため、クライアントが勝手にタグを外すこともできない。`meta/<slug>.json` と `users/<sub>/<slug>.json` はAPIが自分で書くので、書いたあとにタグを付ける。

## URL解決

slugがそのままS3のkeyなので、動的なlookupは不要。CloudFront Functionは静的なrewriteだけを行う。

```text
閲覧リクエスト /p/<slug>/
    ↓ CloudFront Function（prefix付け替えとindex.html補完）
  S3 origin: pages/<slug>/index.html
```

viewer requestに適用するルールは4つだけ。

| 入力 | 出力 |
| --- | --- |
| `/p/<rest>` | `/pages/<rest>` にrewrite |
| 末尾が `/` | `index.html` を補完 |
| 末尾が `/` でなく最終セグメントに `.` が無い | 末尾 `/` 付きへ301 redirect |
| `/p/` 以外 | 404 |

3つ目のredirectは利便性のためだけではない。`/p/<slug>` のままHTMLを返すと、ページ内の相対パス（`./assets/style.css`）が `/p/assets/style.css` に解決されて壊れるため、正規URLへ寄せる必要がある。

4つ目でURL空間を `/p/` だけに閉じている。配信されるprefixが `pages/` ひとつであることをedgeでも明示し、S3の他のprefixがURLとして生えないようにする。

CloudFrontのOACには `s3:GetObject` に加えて `s3:ListBucket` を与える。これがないとS3は存在しないkeyに403 AccessDeniedを返す。存在しないslugを404、認可されていないアクセスを403として区別できるようにしておかないと、閲覧認証（Signed Cookie）を入れたときにtypoしたURLがログイン画面へのリダイレクトループになる。

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

CLIが立てるlocalhostサーバーのポートは固定する。Cognitoはコールバックリダイレクト先をポートまで含めた完全一致で照合するため、空きポートを動的に選ぶことができない。ただし1つに固定するとそのポートが使用中のときログインの手段が無くなるので、`8976` / `8977` / `8978` の3つをApp Clientに登録し、CLIは空いているものを順に試す。

OAuth / PKCEは既存ライブラリ（openid-clientなど）を使い、独自実装を最小限にする。token保存の方法は実装担当に委任（OS Credential Storeか、権限を絞ったユーザー専用ディレクトリへのファイル保存。tokenをログに出さない）。

## 配信

LambdaからHTMLやアセットを配信しない。Range Request・Cache-Control・ETagなどの静的配信をアプリで再実装しないため、pages側は CloudFront → OAC → Private S3 とする。

S3 bucketは完全privateにし、Public Access Blockを有効化する。S3 Website Hostingは使わない。CloudFrontは高速化のためというより、private S3を普通のHTTP配信として扱うために使う。

## 入力の扱い

- Content-Typeは拡張子から判定して保存する。クライアントの申告値を無条件に信用しない。判定には標準のMIME判定ライブラリを使い、対応表を自作しない。未知の拡張子は `application/octet-stream` にする（表示ではなくダウンロードになるだけで、実害がない）
- ディレクトリアップロードではpath traversalを防ぐ。`../`、絶対パス、ドライブレターを拒否し、S3 keyは必ず `pages/<slug>/` 配下に限定する
- symlinkはMVPでは無視または禁止

サイズ上限は次のとおり。用途がHTML資料と簡単なモックなので、候補レンジの下限寄りで始める。足りないという声が出てから上げるほうが、上げすぎて困るより安全である。

| 対象 | 上限 |
| --- | --- |
| 1ファイル | 50 MB |
| 1ページ合計 | 200 MB |
| ファイル数 | 200 |

上限はshared側に定数として置き、APIが作成時に検証する。CLIとWebは同じ定数を参照して、送る前に手元で弾く（サーバー側の検証が正で、クライアント側は早く気付くためのもの）。

## ログ

CloudWatch Logsに最低限、page作成・削除・retention変更・upload失敗・authorization失敗を記録する。JWT、refresh token、presigned URLはログに出さない。

## テスト

テストランナーはVitestに統一する。web（TanStack Start = Vite）と同じランナーを使えるため、パッケージごとに別のランナーを覚えなくてよい。設定はパッケージごとの `vitest.config.ts` に置き、ルートの `pnpm test` が `pnpm -r test` で各パッケージへ委譲する。

CDKは `Template.fromStack()` のsnapshotテストを正とする。個別リソースのアサーションは、意図を明示したい箇所（bucketがprivateであること、OACが付いていることなど）にだけ足す。snapshotは差分レビューの起点であり、テンプレートが意図せず変わったことに気付くための仕掛けとして使う。

snapshotは `config.env` / `config.domains` が未設定の状態で合成する。これにより「設定が空でもsynthが通る」という制約がテストで守られる。
