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
        app.example.com
            TRUSTED
               │
        App Distribution
               │
         API Gateway
               │
             Lambda
          ┌────┴────┐                              │
          │         │
     metadata     Presigned PUT
          │         │
          ▼         ▼
               Private S3 ◀──────── OAC ◀── Internal Pages Distribution ◀── pages.example.com
                   ▲                         Signed Cookie必須                社内限定
                   │                         UNTRUSTED
                   │
                   └──────── OAC ◀── Shared Pages Distribution   ◀── share.example.com
                                             認証なし                         URL共有
                                             UNTRUSTED

  Internal Pages Distribution ── CloudFront Function ──┐
  Shared Pages Distribution   ── CloudFront Function ──┴─▶ CloudFront KeyValueStore
                                                            （slug → 現行バージョン）
             Lambda ────────────────────────────────────────▶ CloudFront KeyValueStore
```

使うAWSサービス: S3 / CloudFront / CloudFront KeyValueStore / Cognito / API Gateway HTTP API / Lambda / Route 53 / ACM。IaCはAWS CDK（TypeScript）。

CDKのスタックは1つとし、機能的・概念的な境界はConstructで表現する（auth / storage / api / CDNなど）。Stack本体は各Constructの組み立てだけを行う。スタック分割によるcross-stack referenceの複雑さは持ち込まない。

DynamoDB、WAF、Lambda@Edge、Step Functions、EventBridgeは使わない。metadataのアクセスパターンは「slugで1件引く」と「所有者のページを列挙する」の2つだけで、S3のkey直指定とprefix列挙で足りる。DynamoDBを再検討するのは、閲覧数のようなカウンタ、slug以外の検索軸、一覧の応答が実用上遅くなる、のいずれかが出てきたとき。一覧で先に効いてくるのは `ListObjectsV2` そのものより、slugごとに `meta/` を個別に読むN+1のほうである。

## origin と URL 空間

trustedな管理アプリ、untrustedな社内限定ページ、untrustedなURL共有ページをそれぞれ別originに分ける。ここでいうoriginはscheme・hostname・portの組であり、登録ドメインやDNS zoneの数とは別の概念である。

| origin | 信頼 | 用途 |
| --- | --- | --- |
| `app.example.com` | trusted | ログイン、アップロードUI、My Pages、管理API |
| `pages.example.com` | untrusted | 社内限定のHTML・JS・CSS・画像 |
| `share.example.com` | untrusted | URLを知っていれば誰でも見られるHTML・JS・CSS・画像 |

アップロードされたHTMLには任意のJavaScript（AI生成コードを含む）が入りうる。管理アプリと同一originにするとDOM・storage・Cookieへアクセスできてしまう。社内限定とURL共有を同一originにすると、社内ユーザが共有ページを開いたとき、そのJavaScriptがSigned Cookieを使って社内限定ページを読みうる。この2つの境界にブラウザのSame-Origin Policyをそのまま使う。

| URL | 公開範囲 | 認証 | Distribution | S3 prefix |
| --- | --- | --- | --- | --- |
| `https://pages.example.com/<slug>/` | internal（既定） | Signed Cookie 必須 | Internal Pages | `internal-pages/<slug>/<versionId>/` |
| `https://share.example.com/<slug>/` | shared | なし（URLを知っていれば誰でも） | Shared Pages | `shared-pages/<slug>/<versionId>/` |

CloudFrontのDistributionはapp用、社内限定ページ用、URL共有ページ用の3つ。公開範囲ごとにDistributionを分けることで、Signed Cookie、Response Headers Policy、origin path、403時の認証導線を別々の設定として持つ。ホスト名はUIとCLIが発行したURLを利用者がそのまま共有するため、利用者自身が選ぶ必要はない。

ホスト名は `app` / `pages` / `share` とする。`pages` は社内で閲覧する成果物の置き場、`share` はURLを渡す用途を表す。`public` は検索や一覧を含む一般公開、`private` は所有者だけが見られる状態にも読めるため使わない。ドメインモデルでは公開範囲を正確に表す `internal` / `shared` を使い、UIでは「社内限定」/「URL共有」と表示する。ホスト名とドメインモデルの語彙は役割が違うため、無理に一致させない。

## 公開範囲

metadataの `visibility` は `internal` と `shared` の2値。既定は `internal`。

既定を `internal` にするのは、「URLが漏れたら誰でも見られる」状態を意識せずに作れてしまうと、気軽にアップロードできなくなるため。認証が要るという前提があってはじめて、迷わず上げられる。`shared` は明示操作でのみ選べる。

visibilityは作成後に変更できない。変更したい場合は新しいページとしてアップロードする。originとS3のprefixがvisibilityそのものなので、変更はオブジェクトの移動とURLの変更を伴う。将来変更を許すなら、prefix間のcopy + 元の削除 + metadataとKVSの更新を1つの操作として実装する。

`shared` を取り消したときに公開URLが404になるのは意図した挙動である。同じURLがログイン要求に変わる形だと、社外の共有相手には「急にログインを求められた」としか見えない。共有を取り消したならURLごと消えるほうが明確になる。

## 公開範囲の境界

`pages.example.com` と `share.example.com` は別originなので、共有ページのJavaScriptから社内限定ページの応答を読めない。これがブラウザ上の公開範囲の境界である。CSPの `sandbox` によるopaque originには依存しない。

Same-Origin Policyはcross-originのリソース埋め込みをすべて禁止するものではない。社内限定Distributionの応答に `Cross-Origin-Resource-Policy: same-origin` を付け、共有ページから社内限定のscriptや画像を読み込む経路も閉じる。

バックエンド側では、各Distributionのorigin pathを `/internal-pages` と `/shared-pages` に固定する。CloudFront FunctionはS3のprefixを組み立てない。加えてbucket policyで各Distributionが読めるprefixを制限する。origin pathとbucket policyはブラウザのセキュリティ境界の代わりではなく、誤った実体を配信しないための独立した防御である。

共有ページでも `localStorage` / `sessionStorage` / `IndexedDB` を使える。ただしstorageはorigin単位なので、同じoriginにある共有ページ同士で共有される。社内限定ページ同士も同様である。ページごとのstorage分離が必要になったときは、その時点でワイルドカードサブドメインを検討する。

## 認証

### Web

Cognito User PoolにGoogleを外部IdPとして連携する。会社のWorkspaceドメインのアカウントのみ許可し、少なくとも `email_verified = true` とメールドメインを確認する。

導入は段階的に行う。当面はCognitoのローカルユーザー（管理者作成）で運用し、Google IdPとドメイン制限は後から追加する。Hosted UI + Authorization Code + PKCEというフローは変わらないため、クライアント側の変更は不要（[roadmap.md](roadmap.md) 参照）。

所有者の識別にはCognitoの `sub` を使う。メールアドレスは表示・監査用に保存するだけで、owner keyには使わない（変更されうるため）。

`shared` ページを作れるユーザーを制限しない。30人規模で権限を分けても運用の手間が増えるだけなので、作成をログに残すことで代替する。

### CLI

WebとCLIで認証方式を分けず、同じUser Poolを使う。App Clientを2つ（Web用・CLI用）作り、CLI用はclient secretなしのpublic clientとする。

CLIのログインはOAuth 2.0 Authorization Code + PKCE。CLIが一時的にlocalhostのHTTPサーバーを立ててcallbackを受ける。初回認証後はrefresh tokenを保存し、毎回のブラウザログインを不要にする。独自のPersonal API Tokenは作らない。

### API

API GatewayのJWT AuthorizerでCognito JWTを検証する。LambdaでJWT署名検証を実装しない。Lambdaは認証済みclaims（`sub` / `email` / `email_verified`）を受け取る前提で、更新系APIでは必ず `metadata.ownerSub == currentUser.sub` を確認し、違反は403にする。

クライアントが `Authorization: Bearer` で送るのはIDトークンとする。Cognitoのアクセストークンには `email` クレームが入らないため、上の前提を満たすにはIDトークンが要る。IDトークンの `aud` はApp Client IDなので、JWT Authorizerのaudience設定とそのまま噛み合う。ロールが1つしかない現状ではこれで足りる（[open-questions.md](open-questions.md) に将来の論点として残す）。

### 社内限定ページの閲覧

Internal Pages DistributionにCloudFront Signed Cookieを要求する。1ページが複数ファイルを参照するため、Signed URLではなくSigned Cookieを使う。Shared Pages Distributionには要求しない。

Signed Cookieは閲覧専用で、漏れても社内共有ページの閲覧以外の権限を持たない。`HttpOnly` / `Secure` / `SameSite=Lax` / `Path=/` とする。

Cookieの発行はappが行う。appからsibling domainへ直接Cookieを設定できないため、閲覧用Signed Cookieだけ親ドメイン `Domain=.example.com` で発行する。

- appの管理用session Cookieは `__Host-` プレフィックス付きにする。`__Host-` は `Domain` 指定付きでは設定できないため、pagesやshare上のuntrusted JSからのcookie tossing（親ドメインCookieの送りつけ）でapp sessionを上書きできない
- Cookieの有効期間はログインセッションと同程度（具体値は実装担当に委任）。切れたら下記の再認証フローが走るだけ

未ログインで閲覧URLを開いたときのフロー:

```text
pages.example.com/<slug>/ → 403
 → CloudFrontカスタムエラーページ
 → app: Cognitoログイン（ログイン済みならスキップ）
 → Signed Cookie発行（Domain=.example.com, Path=/）
 → 元のpages URLへリダイレクト
```

403時の認証導線はInternal Pages Distributionにだけ設定する。Shared Pages Distributionの404や403からログイン画面へ飛ぶ経路は作らない。

### KVSの参照結果でレスポンスを変えない

viewer requestのCloudFront FunctionはSigned Cookieの検証より**先**に実行される。Functionが直接返したレスポンスはキャッシュもオリジンも認証も通らずviewerへ届くため、未認証の第三者にもそのまま渡る。

このため、KVSにキーが無い場合も期限切れの場合も、Functionはレスポンスを返さず**存在しないsentinel URIへrewriteしてリクエストとして返す**。両方のPages Distributionに適用する。

```text
pages.example.com/<slug>/ → キーが無い / 期限切れ → sentinel URIへrewrite
                            → Signed Cookieの検証を通る
                               未認証 → 一律403（存在の有無を区別できない）
                               認証済 → S3由来の404

share.example.com/<slug>/ → キーが無い / 期限切れ → sentinel URIへrewrite
                           → 検証は無いのでそのままS3由来の404
```

これによりFunctionが自分でレスポンスを返すのは、slugに依存しない構文的な判定だけになる。URIの不正と末尾スラッシュ補完の301は全slugに対して一律なので、存在判別には使えない。

副次的に、Functionの出口が「rewriteしてrequestを返す」1本に揃う。レスポンスオブジェクトの組み立てが正常系から消えるため、KVSの結果で分岐する実装より単純になる。存在の秘匿はそのついでに成立している。

代償として期限切れを410で返せなくなる。404のカスタムエラーページに「このページは存在しないか、共有期限が切れています」と書くことで代替する。

sentinel URIは配信対象prefixの内側に置く（`__missing__/index.html` など）。slugは `[a-z0-9]` のみなので衝突しない。bucket policyのDenyに当たると403になってしまうため、prefixの外には置かない。

## slug と title

ページの識別子はslugひとつ。`[a-z0-9]` から16文字を暗号論的乱数で生成する。ユーザーは指定できず、作成後も変更できない。

slugは一意で、そのままS3の保存パスとURLになる。内部ID（pageId）とslugの二重管理はしない。

ユーザーが読める名前をslugにしない理由は、slugがcapabilityを兼ねるためである。`shared` ページはURLを知っていることがアクセス権そのものなので、slugは推測できてはならない。人が覚えられる名前は人が推測できる名前でもあり、この2つは同じ文字列に同居できない。名前は別に持たせる。

16文字は 36^16 通りで、CloudFront側にレート制限を置かなくても総当たりが届かない。

表示名は metadata の `title` に持つ。これはユーザーに見せるページ名というだけで、それ以上の意味を持たない。

- S3のkeyにもURLにも影響しない
- 重複してよく、いつでも変更できる（`PATCH`）
- URLに載らないため日本語や絵文字をそのまま使える
- 用途は My Pages の一覧での見分けと、Web上の見出し

既定値はアップロードされた `index.html` の `<title>` から拾うが、これはCLIとWebが手元で行う。untrustedなHTMLをLambdaでパースしない。取得できなければディレクトリ名かファイル名を使う。APIは受け取った文字列の長さと制御文字だけを検証する。`title` はuntrustedな文字列として扱い、表示時にエスケープする。

## バージョン

再アップロードは既存のファイルを上書きせず、**新しいバージョンディレクトリへ書く**。公開の切り替えはKVSのエイリアスを差し替えることで行う。

内部の識別子と利用者に見せる番号を分ける。

| | 形 | 置き場所 | 用途 |
| --- | --- | --- | --- |
| バージョンID | `[a-z0-9]` の暗号論的乱数 | S3のパス、KVSの値 | 実体の置き場所 |
| バージョン番号 | 1から始まる連番 | metadataのみ | 表示（`v3` など） |

バージョンIDを乱数にするのは、採番のために現在値を読む必要がなく、アップロード試行ごとに必ず異なるディレクトリになるためである。既存のslug生成と同じ仕組みを使い回せる。

一方で利用者には「v3」のような連番が分かりやすい。これはmetadataだけが持つ表示用の値とし、`complete` が成功したときにだけ加算する。失敗したアップロードは番号を消費しない。S3のパスにもURLにも現れないため、実体の置き場所とは無関係である。

metadataが持つのは3つの値だけ。

```text
version:          5            表示用の連番
activeVersionId:  "<id>"       配信中の実体
contentUpdatedAt: "..."        期限の起点
```

過去バージョンの一覧を持たない。履歴が要るのは「v4に戻す」を実装するときで、それはMVPに入れないと決めた。使わない履歴を書き込み経路で維持しない。

「アップロード中のバージョン」も持たない。versionIdはクライアントが宣言のレスポンスで受け取っているので、`complete` のリクエストに載せてもらえばよい。宣言と `complete` の間にサーバー側の状態を持たなくて済む。

実体は配信中のものと、直前まで配信していたものが残る。KVSは結果整合で伝播に数秒かかるため、切り替え直後に旧バージョンを消すと一部のエッジが存在しないパスを引いて404になる。削除のルールでこれを避ける（「古いバージョンの回収」参照）。

## KeyValueStore

CloudFront KeyValueStoreに「slug → 現行バージョン」のマッピングを持つ。CloudFront Functionがviewer requestで参照する。

キーはvisibilityの名前空間を前置する。

```text
internal/<slug>    社内限定
shared/<slug>      URL共有
```

値はJSON。

```json
{"v": "<versionId>", "e": 1790000000}
```

- `v` … 現行バージョンID
- `e` … 論理期限のepoch秒。無期限のときはフィールドごと省く

visibilityを値のフィールドに持たず、キーの名前空間で表す。各Functionは自分のDistributionに対応する名前空間を前置して引く。visibilityの不一致は「キーが無い」に自然に潰れる。

値のスキーマはJSONにする。上限1KBに対して実測30バイト程度なのでバイト数を削る動機がなく、フィールドを足しても古いFunctionが無視するだけで前方互換が取れる。KVSのコンソールから直接読んで意味が分かることも利点になる。将来フィールドを足すときは「無ければ安全側のデフォルト」をFunction側の規約にしておき、KVSの書き込みとFunctionのデプロイの順序を気にしなくて済むようにする。

書き込むのは4つの場面。作成の `complete`、再アップロードの `complete`、`retention` 変更、削除。`title` の変更ではKVSを書かない。

書き込みは `DescribeKeyValueStore` でETagを取り、`UpdateKeys` に `If-Match` で渡す。ETagはストア全体に対するものなので、異なるslugの同時更新でも412になりうる。412のたびにETagを取り直し、数回リトライする。それ以外のエラーはそのまま失敗として返す。ETagをLambdaのモジュールスコープにキャッシュしない（他インスタンスの書き込みで必ず陳腐化する）。

KVSは `RemovalPolicy.RETAIN` にする。スタック更新の事故で消えると全ページが一斉に見えなくなり、さらに期限切れページが復活する。

キーはランタイムデータなのでCDKで定義しない。CDKが作るのはストアそのものとFunctionへの関連付けだけ。

`packages/api/scripts/reconcile.ts` を用意する。`meta/` を正として、KVSの再構築（`e` の再計算を含む）、`users/` マーカーの過不足の修正、孤児バージョンの削除をまとめて行う。KVSが失われたときの唯一の復旧手段であり、保持日数の設定を変えたときに既存の `e` を一括更新する手段でもある。「あったら便利」ではなく、無いと復旧できないものとして最初に用意する。

両方のPages Distributionのすべてのbehaviorに、KVS関連付け済みのFunctionを必ず関連付ける。Functionの付いていないbehaviorが1つでもあると、その経路だけ期限判定が抜ける。Functionの関連付けは付け忘れても普通に動いてしまうため、`pages-delivery.ts` に制約をコメントで残す。

## S3構造

DynamoDBを使わず、metadata / indexもS3で管理する。

```text
internal-pages/
  <slug>/
    <versionId>/       # pages.example.com/<slug>/ として配信される
      index.html
      assets/...
shared-pages/
  <slug>/
    <versionId>/       # share.example.com/<slug>/ として配信される
meta/
  <slug>.json          # metadataの正本
users/
  <cognito-sub>/
    <slug>.json        # 所有関係のマーカー（slug と createdAt だけ）
```

slugの空間はvisibilityを跨いで共通とし、`meta/<slug>.json` の存在チェックで一意性を担保する。専用のindexは持たない。

metadataを配信対象のprefixの中に置かないのは、そこがCloudFrontから配信されるからである。中に置くと誰でもownerのメールアドレスを読めてしまい、さらにユーザーが `metadata.json` という名前のファイルをアップロードしたときに正本と衝突する。配信対象と管理データのprefixを分ければ、この2つの問題がまとめて消える。

`meta/<slug>.json` が管理上の正本で、KVSは配信用の派生インデックスである。KVSは `meta/` から再構築できるが、逆はできない。両者がずれたときは `meta/` を正として直す。

KVSに置くのはCloudFront Functionが判断に使う値だけとする。それ以外のmetadataをKVSへ移さない。理由は3つある。

- KVSのパブリックAPI操作は無料枠なしで $1/1,000リクエスト。一覧で50件引くだけで1回 $0.05 になり、閲覧配信本体より桁違いに高くなる。S3のGETは $0.0004/1,000
- KVSの楽観的排他はストア全体のETagに掛かるため、`title` の変更のような頻度の高い更新まで1つのETagを奪い合う。S3は `meta/<slug>.json` が別オブジェクトなので競合しない
- KVSは結果整合、S3はread-after-write強整合。管理UIで自分の変更が即座に反映されない状態は許容しにくい

`users/<sub>/<slug>.json` は My Pages 一覧用のインデックスではなく、**誰がどの slug を持つか**を示すマーカーである。可変な値は `meta/` にだけ置き、同じ情報を2箇所に持たない。

一覧は `users/<sub>/` で slug を列挙し、各 `meta/<slug>.json` を読んで組み立てる。マーカーに対応する meta が無い孤立エントリは無視する。読み取り操作で書き込みの副作用を起こさないため、掃除は reconcile スクリプトの手動実行に任せる。

S3にtransactionはないので、削除などの複数オブジェクト更新は、冪等・再実行可能にし、中途半端な状態を検出できるようにする。

Object TagはLifecycleなどの運用属性（`retention=temporary`）に限定する。

## アップロード

WebとCLIは同じAPIを使う。ファイル本体はLambdaを経由させず、presigned PUT URLでS3へ直接アップロードする。

```text
1. 宣言          POST /api/pages          （新規）
                 PUT  /api/pages/{slug}   （再アップロード）
                   ├ ファイル一覧を宣言し、その場で検証
                   ├ 新しい versionId を生成
                   └ <prefix>/<slug>/<versionId>/ 宛の presigned PUT URL を返す
                 サーバー側の状態は何も変わらない

2. アップロード  クライアントが全ファイルを PUT
                   ここで失敗しても公開中のページには一切影響しない

3. 完了          POST /api/pages/{slug}/complete { versionId, files }
                   ├ 宣言と同じ一覧を HeadObject で突き合わせる
                   ├ KVS を新しい versionId へ書き換え
                   ├ metadata を更新（version +1、activeVersionId、contentUpdatedAt）
                   └ 古いバージョンディレクトリを回収
```

宣言はサーバーの状態を変えない。versionIdはクライアントが受け取り、`complete` で送り返す。ファイル一覧も同じものを送り返してもらい、サーバーはそれを実体と突き合わせる。宣言と `complete` の間にサーバー側の状態を持たないため、pending状態のTTLも、宣言の取り消しも要らない。

一覧を送り返さない形にはできない。S3を列挙するだけでは「上がるはずだったファイルが全部あるか」を判定できないためである。クライアントが一部を伏せて申告することはできるが、それは自分のページを自分で壊すだけなので防がない。

宣言の時点で検証するのは次の内容。

- `index.html` がページ直下にあるか。宣言された一覧を見れば判定できる
- ファイル数、1ファイルのサイズ、ページ合計サイズ
- パスにpath traversalが含まれないか

各ファイルのサイズを宣言させ、presigned URLの署名対象ヘッダに `Content-Length` を含める。これによりクライアントは宣言したサイズちょうどしかPUTできず、上限をS3側で強制できる（presigned PUTにはPOST policyのような `content-length-range` が無いため、この方法で代替する）。

`complete` は冪等にする。`activeVersionId` が既にそのversionIdなら、何もせず現在の状態を返す。KVSの書き込みが成功してmetadataの更新が失敗した場合でも、再実行すれば収束する。

KVSとmetadataは同時に更新できない。KVSを先に書き、metadataの書き込みに失敗したらエラーを返す。この順序なら失敗時に配信される内容は新しいほうで正しく、ずれるのは表示用の番号と期限の起点だけになる。逆順にすると「新しいと表示されるのに古い内容が配信される」状態になり、そちらのほうが困る。

同じページへの同時アップロードは想定しない。ページを上書きできるのは所有者本人だけであり、自分で2箇所から同時に上げる状況はまず起きない。仮に起きても、それぞれが別のバージョンディレクトリへ書くので混ざることはなく、先に `complete` したほうが公開され、あとから `complete` したほうが上書きするだけである。壊れたページが公開されることはないため、排他制御は持たない。

`complete` が恒久的に失敗した場合はクライアントにエラーを返し、KVSは旧バージョンを指したままにする。このとき状態は「新バージョンのファイルがS3にあるが誰にも見えていない」になり、公開中のページは無傷である。これがこの設計が取れる最良の失敗モードなので、意識的にこの順序にする。

`complete` が200を返した時点ではまだ全エッジへ伝播していない（数秒）。UI側で「反映まで数秒かかる」と伝える。

200ファイルのHeadObjectは上限付きの並列で回す。

### 古いバージョンの回収

`complete` のあとで、**配信中でなく、かつ一定時間（1時間程度）更新されていない**バージョンディレクトリを削除する。削除は `DeleteObjects` の一括削除（1リクエスト1,000キーまで）で行う。

時間で足切りするのは、KVSの伝播が終わる前に旧現行を消すと一部のエッジが存在しないパスを引いて404になるため。世代を数えるより単純で、metadataに順序を持たなくて済む。中断されたアップロードのディレクトリも同じルールで回収される。

この方式では、一度再アップロードして放置され、その後二度と更新されない `permanent` なページの孤児が残る。`temporary` なページの孤児はLifecycleが拾う。残った分は reconcile スクリプトの手動実行で回収する。

孤児を確実に回収することと、Lifecycleを `retention` の1本だけに保つことは両立しない。ここでは後者を採り、孤児が少量残ることを受け入れる。

### presigned URLの有効期限

presigned PUT URLは `complete` の後でも署名の期限内なら同じkeyを上書きできる。バージョンディレクトリの内容が不変であるという前提はこれで破れうるため、有効期限を短くする（1時間程度）。上書きできるのは自分のページに対してだけなので、これ以上の対処は持たない。

## API

```text
POST   /api/pages                  新規作成（slugは乱数生成、指定不可）+ presigned URL発行
PUT    /api/pages/{slug}           再アップロードの宣言 + presigned URL発行
POST   /api/pages/{slug}/complete  アップロード完了（冪等）
GET    /api/pages                  自分のページ一覧
GET    /api/pages/{slug}           ページ取得
PATCH  /api/pages/{slug}           metadata更新（retention / title）
DELETE /api/pages/{slug}           削除（冪等）
```

`PUT` がコンテンツ、`PATCH` がmetadataという対応にする。`visibility` はどちらでも変更できない。

DELETEは `<prefix>/<slug>/` 配下の全バージョン、`meta/<slug>.json`、`users/<sub>/<slug>.json`、KVSのキーを消す。KVSのキーを消した時点で、CloudFront Functionがキャッシュを参照する前にsentinel URIへrewriteするようになるため、キャッシュに残っていても数秒で見えなくなる。

## 保存期間

デフォルト30日（temporary）。ユーザー操作で無期限（permanent）に変更できる。

期限の正本はmetadataの `retention` と `contentUpdatedAt` で、`expiresAt` は保存しない。

```text
expiresAt = retention === 'temporary' ? contentUpdatedAt + 30日 : null
```

派生値を保存すると更新経路が増えるたびに再計算を忘れる箇所ができる。特にこの値は「retentionを変更した時刻からではなく、最後にコンテンツを更新した時刻から数える」という直感に反するルールを持つため、保存すると壊れやすい。計算は `packages/shared` の純粋関数1つに閉じ、APIもKVSの書き込みもそこを通す。

保存しないほうがS3 Lifecycleとも整合する。Lifecycleはオブジェクトの年齢で判定するため、保持日数の設定を変えると既存オブジェクトにも遡って効く。`expiresAt` を保存していると、設定変更のたびに全metadataを書き換えるバッチが必要になる。派生にしておけば一斉に追随する。

`contentUpdatedAt` は**新しいバージョンの `complete` が成功した時刻**である。宣言の時刻でも、`retention` や `title` を変更した時刻でもない。名前を `updatedAt` にしないのは、title変更で期限が延びる実装を誘発しないため。

バージョンディレクトリを使うことで、この起点とS3 Lifecycleの基準が構造的に一致する。再アップロードは常に新しいオブジェクトを作るため、`<slug>/<versionId>/` 配下のオブジェクト作成日はそのバージョンの `contentUpdatedAt` と厳密に同じになる。

期限の表現は3層に分かれる。それぞれ役割が違い、互いに代替できない。

| 層 | 何を決める | 他で代替できない理由 |
| --- | --- | --- |
| `meta/` の `retention` + `contentUpdatedAt` | 正本 | 唯一の書き込み先。他はここからの投影 |
| KVSの `e` | エッジでの閲覧可否 | CloudFront FunctionはS3もmetadataも読めない |
| Lifecycleのタグ + 経過日数 | 物理削除 | Lifecycleはmetadataを読めない |

閲覧はKVSの `e` で止まる。viewer requestのFunctionはキャッシュ参照の前に必ず実行されるため、既にキャッシュ済みのページでも期限が来た瞬間から止まる。invalidationは要らない。

物理削除はS3 Lifecycleに任せる。`retention=temporary` のタグで絞る1本のルールだけを持ち、論理期限 + 7日の猶予で削除する。visibilityによる出し分けはしない。閲覧がエッジで止まる以上、物理削除のタイミングは閲覧可否に影響しないためである。猶予を置くのは、期限切れに気付いた所有者が `permanent` へ戻して救える窓を作るため。これは `shared` にも同じように必要になる。

`retention` の変更は、次の3つを一まとまりの操作として行う。順序もこのとおりにする。

1. ページ配下の全オブジェクトの `retention` タグを書き換える
2. metadataを更新する
3. KVSの `e` を更新する

1を落とすとデータが消える。`temporary` から `permanent` へ変えても既存オブジェクトに `retention=temporary` が残るため、metadataとKVSの上では無期限なのにLifecycleがファイルだけ物理削除する。逆向きでも、タグを付けなければLifecycleは動かない。S3 Lifecycleはタグを現在の状態で再評価するので、削除が実行される前にタグを外せば削除は止まる。

1ページ200ファイルが上限なので、全オブジェクトのタグ更新をLambdaで回して問題ない。

論理期限を過ぎたページに対しても retention の変更は許す（Lifecycleが既に走っていればファイルは戻らない）。

`retention` のタグは、配信対象のprefix配下についてはpresigned PUTの署名対象に `x-amz-tagging` を含めることで、アップロードそのものに付けさせる。署名対象に入れてあるため、クライアントが勝手にタグを外すこともできない。`meta/<slug>.json` と `users/<sub>/<slug>.json` はAPIが自分で書くので、書いたあとにタグを付ける。

期限切れの閲覧を止めているのは、各Pages DistributionのCloudFront Functionである。従来の「Lifecycleが消したから見えない」という物理的な保証を、論理的な保証に置き換えている。そのぶんKVSの `RemovalPolicy.RETAIN`、`reconcile.ts` の常備、全behaviorへのFunction関連付けの3点を担保する。

## URL解決

CloudFront Functionはviewer requestで動き、KVSを1回だけ引いてURIを書き換える。

```text
閲覧リクエスト pages.example.com/<slug>/
    ↓ CloudFront Function
    ↓   KVS: internal/<slug> → {"v":"<versionId>","e":...}
    ↓   /<slug>/<versionId>/index.html へrewrite
    ↓ origin path /internal-pages を CloudFront が前置
  S3 origin: internal-pages/<slug>/<versionId>/index.html
```

処理順は次のとおり。

1. URIを検証する。slugがちょうど16文字の許可文字か、空セグメント・`.`・`..`・エンコードされたslashが含まれないか。違反は404
2. `/<slug>` に完全一致するなら、末尾 `/` 付きへ301（KVSを引かない）
3. Distributionに対応する名前空間を付けてKVSを引く
4. キーが無い、または `e` が現在時刻を過ぎていれば、sentinel URIへrewrite
5. そうでなければ `/<slug>/<versionId>/<rest>` へrewrite
6. 末尾が `/` なら `index.html` を補完

レスポンスを直接返すのは1と2だけで、いずれもslugの存在に依存しない。3以降は必ずrewriteしてリクエストを返す。

2つ目のredirectは利便性のためだけではない。`/<slug>` のままHTMLを返すと、ページ内の相対パス（`./assets/style.css`）が `/assets/style.css` に解決されて壊れるため、正規URLへ寄せる必要がある。redirect先のLocationにはrewrite前のURLを使う。判定は完全一致に限定し、拡張子の有無を見るヒューリスティックは使わない。

バージョンIDはKVSの値からのみ組み立て、URIから受け取らない。

FunctionがS3のprefixを組み立てないのは、origin pathのほうが強い保証になるためである。各Distributionのorigin pathはvisibilityに対応する1本に固定するため、FunctionがURIをどうrewriteしても反対側のprefixには到達できない。

例外は一律404に倒す。キーが無いのかKVSが引けないのかを利用者向けには区別しない。ただしログでは区別する。すべて404にすると監視なしでは配信障害に気付けないため、KVSの例外回数を追えるようにしておく。

CloudFrontのOACには `s3:GetObject` に加えて `s3:ListBucket` を与える。KVSが防ぐのは未知のslugまでで、存在するページの中の存在しないファイル（`/<slug>/missing.css`）はS3まで到達する。`s3:ListBucket` が無いとS3はこれに403を返すため、404にするには必要である。403を認証失敗、404をファイル欠落として扱う設計を維持する。

Lambda@EdgeもS3 Website Hostingも使わない。

## キャッシュ

CloudFrontのinvalidationは使わない。Lambdaに `cloudfront:CreateInvalidation` の権限を与えない。

- 再アップロード … 書き換え後のURIがキャッシュキーになるため、新しいバージョンのパスは単にキャッシュに存在しない
- 削除 … KVSのキーを消すとFunctionがキャッシュを参照する前にsentinel URIへrewriteする
- 期限切れ … Functionがキャッシュを参照する前にsentinel URIへrewriteする

viewer requestのFunctionはキャッシュ参照の前に必ず実行される。バージョン更新時は新しいURI、削除・期限切れ時はsentinel URIにrewriteするため、過去のURIのキャッシュに到達しない。この性質に乗ることで、キャッシュの無効化という操作自体が不要になる。

バージョンディレクトリの内容は不変なので、長いTTLを設定してよい。ただし「presigned URLの有効期限」に書いた制約があるため、無限に近いキャッシュを前提にした運用はしない。

## 管理UI（web）

TanStack Start（React）を使う。SPAモード + prerenderにより成果物は静的ファイルのみとし、App DistributionのS3 originから配信する。server functionsとSSRは使わない（必要になったら配信方式ごと再検討する）。

App Distributionのルーティング:

```text
/api/*   → API Gateway
それ以外  → 管理UI用S3 origin（404はSPAシェルへrewrite）
```

アップロード画面では `title` を入力し、公開範囲を選ぶ。既定は `internal` で、`shared` を選ぶときは確認を挟む。My Pages には公開範囲をバッジで表示し、`title` と `retention` を編集できる。URLのコピーは公開範囲に応じてpages originかshare originの完全なURLを返す。バージョン番号（`v3`）と保存期限（「削除予定日」として表示する）も出す。

アップロードは宣言 → PUT → completeの3段階で、途中で失敗したらクライアントが状態を戻せるようにする。completeの直後は反映まで数秒かかることを表示する。

## CLI

TypeScript + Node.jsで書き、npmで配布する。実行は `npx share-html`。依存は単一JSにバンドルする。

CLIの対象は開発者とAIエージェントに割り切る。開発環境がないユーザーはWeb UIのdrag & dropを使う前提のため、単一バイナリ配布はしない。

公開範囲の指定は `--shared` の明示を必須とする。省略時は `internal`。取り違えの向きを常に安全側にするため。

CLIが立てるlocalhostサーバーのポートは `8976` に固定する。Cognitoはコールバックリダイレクト先をポートまで含めた完全一致で照合するため、空きポートを動的に選べない。使用中だった場合はフォールバックせず、ポートを空けるよう伝えて終了する。

OAuth / PKCEは既存ライブラリ（openid-clientなど）を使い、独自実装を最小限にする。token保存の方法は実装担当に委任（OS Credential Storeか、権限を絞ったユーザー専用ディレクトリへのファイル保存。tokenをログに出さない）。

## 配信

LambdaからHTMLやアセットを配信しない。Range Request・Cache-Control・ETagなどの静的配信をアプリで再実装しないため、両方のPages Distributionは CloudFront → OAC → Private S3 とする。

S3 bucketは完全privateにし、Public Access Blockを有効化する。S3 Website Hostingは使わない。バケットバージョニングも有効にしない（削除の意味がdelete markerとnoncurrent versionに分かれ、Lifecycleも2本立てになるため。「消したら消える」という性質を優先する）。

CloudFrontから読めるのを配信対象のprefixだけに制限するbucket policyを置く。Internal Pages Distributionは `internal-pages/`、Shared Pages Distributionは `shared-pages/` だけを読める。この不変条件をorigin pathとbucket policyの両方に書く。

Distributionごとのレスポンスヘッダは次のとおり。

| Distribution | ヘッダ |
| --- | --- |
| Internal Pages | `Cross-Origin-Resource-Policy: same-origin`、`X-Content-Type-Options: nosniff` |
| Shared Pages | `Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex, nofollow`、`X-Content-Type-Options: nosniff` |

`Referrer-Policy` は、共有ページから外部リンクを踏んだときにRefererでURLが漏れるのを防ぐ。URLがそのままアクセス権であるため、漏洩経路を減らす必要がある。`X-Robots-Tag` は検索エンジンへの掲載を防ぐ。

## 入力の扱い

- Content-Typeは拡張子から判定して保存する。クライアントの申告値を無条件に信用しない。判定には標準のMIME判定ライブラリを使い、対応表を自作しない。未知の拡張子は `application/octet-stream` にする（表示ではなくダウンロードになるだけで、実害がない）
- ディレクトリアップロードではpath traversalを防ぐ。`../`、絶対パス、ドライブレターを拒否し、S3 keyは必ず配信対象のprefix配下に限定する
- symlinkは無視または禁止

サイズ上限は次のとおり。用途がHTML資料と簡単なモックなので、候補レンジの下限寄りで始める。足りないという声が出てから上げるほうが、上げすぎて困るより安全である。

| 対象 | 上限 |
| --- | --- |
| 1ファイル | 50 MB |
| 1ページ合計 | 200 MB |
| ファイル数 | 200 |

上限はshared側に定数として置き、APIが宣言時に検証する。CLIとWebは同じ定数を参照して、送る前に手元で弾く（サーバー側の検証が正で、クライアント側は早く気付くためのもの）。

## ログ

CloudWatch Logsに最低限、page作成・再アップロード完了・削除・retention変更・title変更・upload失敗・authorization失敗・KVS書き込み失敗を記録する。作成と再アップロードのログには `visibility` とバージョン番号を含める。社外から見える状態を作った操作を後から辿れるようにするため。

JWT、refresh token、presigned URLはログに出さない。

CloudFront Functionのログでは、キーが存在しない場合とKVSの例外を区別して記録する。利用者への応答は一律404にするが、ログまで一律にすると配信障害に気付けない。

`meta/` を走査して公開範囲を一覧するスクリプトを `packages/api/scripts/` に置く。社外に開いているページの棚卸しに使う。

## テスト

テストランナーはVitestに統一する。web（TanStack Start = Vite）と同じランナーを使えるため、パッケージごとに別のランナーを覚えなくてよい。設定はパッケージごとの `vitest.config.ts` に置き、ルートの `pnpm test` が `pnpm -r test` で各パッケージへ委譲する。

CloudFront Functionはasyncになるため、`node:vm` でhandlerを直接実行するunitテストはKVSのスタブを渡す形にする。rewrite、301、404、sentinel、期限判定をそれぞれ確認する。

CDKは `Template.fromStack()` のsnapshotテストを正とする。個別リソースのアサーションは、意図を明示したい箇所（bucketがprivateであること、両方のPages DistributionにOACとFunctionが付いていること、社内限定側だけがSigned Cookieを要求すること、Distributionごとのorigin path・bucket policy・レスポンスヘッダ）にだけ足す。snapshotは差分レビューの起点であり、テンプレートが意図せず変わったことに気付くための仕掛けとして使う。

snapshotは `config.env` / `config.domains` が未設定の状態で合成する。これにより「設定が空でもsynthが通る」という制約がテストで守られる。
