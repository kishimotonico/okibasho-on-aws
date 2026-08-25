# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。

方針は「縦に薄く」。CDKで全リソースを作り切ってからアプリではなく、統合リスクの高い部分（認証、KVSエイリアス、presigned PUT、Signed Cookie）を最小構成で早く一周させる。

チェックボックスは「実装が終わった」印である。受け入れ条件はデプロイして初めて確認できるものが多いため、AWSアカウントが決まるまでは各フェーズに検証状況を注記し、未検証のまま先へ進む。

## 現状

コードは公開範囲・バージョン・KVSエイリアス・origin分離を含む新しい設計に追随済み。独自ドメインと Signed Cookie による閲覧認証はまだ入れていない。デプロイは一度も行っておらず、AWSと繋いだ動作は全て未検証である。

ロードマップ上は「旧仕様のまま一周してからリファクタ」だったが、本番データが無いので新仕様へ先に寄せた。初回デプロイは CloudFront のデフォルトドメインで行い、ドメインと閲覧認証はリリース直前に入れる。

## Phase 0: 前提作業（手動）

- [ ] AWSアカウントとリージョンの確定（決まったら `packages/infra/lib/config.ts` の `env` を設定）
- [ ] `cdk bootstrap`（デプロイ先リージョンと、証明書用に us-east-1 の両方）
- [ ] 請求アラート / Budgets の設定

ドメイン取得とRoute 53、Google OAuthクライアント作成は後付けタスクへ。

### ローカルで一周させる仕組みは作らない

「アップロードして、発行されたURLを開いて表示される」という一周は、まだ一度もできていない。デプロイを待たずにこれを確認する方法は検討した。`packages/api` はS3操作を `PageStore` インターフェース越しにしてあるのでローカル実装を差し込めるし、閲覧側もCloudFront Functionの実物のコードを `node:vm` で読み込んで静的配信に噛ませられる。CLIは保存済みトークンの期限が切れていなければCognitoに問い合わせないので、期限を先にしたトークンファイルを置けばコードを変えずにローカルAPIへ向けられる。

それでも作らないことにした。この方法で確かめられるのはアプリ側の動線までで、いま未検証として残っている中身——Cognito Hosted UIとPKCEの往復、JWT Authorizerの `aud` / issuer の突き合わせ、CloudFrontが `Authorization` を運ぶか、OACとbucket policyのDenyが効くか、presigned PUTの署名検証、KVSの伝播、S3 Lifecycleの実削除——はどれもAWS側の挙動そのもので、ローカルの模擬では答えが出ない。一周の見た目を先に作っても、デプロイ後に確認すべき項目は1つも減らない。

## Phase 1: デプロイして一周させる

コード側は新仕様へ寄せ済みなので、ここは初回デプロイそのものの検証になる。ここで得たデータは捨ててよい。

- [ ] `cdk deploy`
- [ ] `share-html login` が通る（Hosted UI + PKCE、localhostコールバック）
- [ ] `share-html ./dist/` でアップロードでき、発行されたURLで閲覧できる
- [ ] Web UIでログイン → drag & drop → URLコピーまで通る
- [ ] My Pages の一覧・retention変更・title変更・再アップロード・削除が動く
- [ ] `--shared` で上げたページが Shared Distribution の `/<slug>/` で見える

ここで確認したいAWS側の挙動:

- OACでS3から実際にオブジェクトが取れるか
- 存在しないkeyが403ではなく404で返るか（`s3:ListBucket` を足した狙いどおりか）
- CloudFront Functionが runtime 2.0 で構文エラーなく動くか
- KVSの書き込みが Function から読めるか
- JWT AuthorizerがIDトークンを受け入れるか（`aud` とApp Client IDの噛み合わせ）
- CloudFrontの `/api/*` behaviorが `Authorization` ヘッダをAPI Gatewayまで運ぶか
- Hosted UIからのリダイレクトが `https://<app distributionのドメイン>/auth/callback` に戻ってくるか
- presigned PUTの署名対象に `Content-Length` と `x-amz-tagging` を含めた形で、実際にPUTが通るか
- ブラウザからのpresigned PUTがCORSで通るか（ブラウザは `Content-Length` を明示指定できず自動付与に頼っている）
- Lambdaのバンドルが実行環境で動くか
- S3 Lifecycleが `retention=temporary` のタグを拾って消すか（反映は数十時間遅れる）

## Phase 2: slug / title / バージョン（shared → api → infra → web → cli）

新仕様へのリファクタ。sharedから順に進めれば途中でも型チェックが通る。

- [x] shared: slugをユーザー指定不可の16文字乱数に。`slug_taken` などの関連エラーを削除
- [x] shared: `title`、`visibility`、`version`、`activeVersionId`、`contentUpdatedAt` を metadata に追加。`expiresAt` の保存をやめて純粋関数で計算する
- [x] api: 宣言（`POST` / `PUT`）と `complete` の2段階に分割。HeadObjectによる検証
- [x] api: 古いバージョンディレクトリの回収（complete 後、配信中でなく一定時間更新されていないもの）
- [x] infra: S3 prefixを `internal-pages/` `shared-pages/` の2本に。bucket policyの追随
- [x] web / cli: title入力、`--shared`、バージョン番号の表示

受け入れ条件: 同じURLに再アップロードして内容が差し替わり、途中で中断しても既存のページが壊れない。コード上は実装済み。AWS上の確認は Phase 1 のデプロイ後。

## Phase 3: KVSエイリアスとorigin分離（infra + api）

- [x] KeyValueStore を CDK で作成（`RemovalPolicy.RETAIN`）、Functionへ関連付け
- [x] CloudFront Function を KVS参照 + URI検証 + バージョン合成に書き換え（async化）
- [x] Pages Distributionを社内限定用とURL共有用に分け、それぞれのorigin pathとResponse Headers Policyを設定
- [x] 社内限定側に `Cross-Origin-Resource-Policy: same-origin`、URL共有側に `Referrer-Policy: no-referrer` と `X-Robots-Tag: noindex, nofollow` を設定
- [x] api: `visibility` に応じてpages originまたはshare originの完全な `viewUrl` を返す
- [x] api: `complete` / `PATCH` / `DELETE` からのKVS書き込み（CAS + リトライ）。`retention` 変更はタグ→metadata→KVSの順で一まとまりにする
- [x] `packages/api/scripts/reconcile.ts`（KVS再構築・マーカー修正・孤児削除）
- [x] invalidation 関連のコードとIAM権限を削除

受け入れ条件: 社内限定ページとURL共有ページがそれぞれのCloudFrontデフォルトドメインの `/<slug>/` で表示され、各Distributionが反対側のS3 prefixを読めない。共有ページでstorageを利用でき、共有ページから社内限定ページの応答を読めない。再アップロードがキャッシュ無効化なしで反映される。削除または期限切れのページが数秒で404になる（sentinelへrewriteされるため410ではない）。コード上は実装済み。AWS上の確認は Phase 1 のデプロイ後。

デプロイ後に見るべき点:

- KVSの書き込みが全エッジに伝播するまでの実測時間
- `UpdateKeys` の `If-Match` と412のリトライが期待どおり動くか
- Function内の `Date` が期限判定に使えるか
- rewrite後のURIがキャッシュキーになっているか（新バージョンがinvalidationなしで出るか）
- KVSのキーを消したときにキャッシュを無視して404が返るか

## Phase 4: 独自ドメイン

origin分離まではCloudFrontのデフォルトドメインで検証し、独自ドメインの作業は閲覧認証の直前に行う。Signed Cookieを親ドメインへ発行するPhase 5までには完了させる。

- [ ] 配信用サブドメインのRoute 53 hosted zoneを作成
- [ ] 親ドメインのDNSにRoute 53が発行したNSレコードを追加し、配信用サブドメインを委譲
- [ ] ACM証明書を **us-east-1** で発行し、DNS検証
- [ ] `config.ts` の `domains` を埋めてカスタムドメインを有効化

使用するhostnameは `app.<service-domain>`、`pages.<service-domain>`、`share.<service-domain>`。3つを同じ親ドメインの下に置くことが、Signed Cookieを親ドメインで発行する設計の前提になる。実際のドメイン名はこの文書では固定しない。

受け入れ条件: 3つのhostnameが対応するDistributionへ到達し、TLS証明書の警告なく表示できる。

## Phase 5: 閲覧認証（infra + api）※要・独自ドメイン

- [ ] Signed Cookie発行（親ドメイン、`Path=/`、キーペア管理）
- [ ] Internal Pages Distribution に Trusted Key Group
- [ ] appセッションの `__Host-` Cookie
- [ ] Internal Pages Distributionの403カスタムエラーページ → app → 元URLの再認証フロー
- [ ] KVSの結果によってレスポンスを変えない（sentinel URIへのrewrite）

受け入れ条件: 未ログインでpages originのURLを開くとログインへ誘導され、ログイン後に元のページが表示される。share originは認証なしで表示され、その404や403からログイン画面へは遷移しない。

デプロイ後に見るべき点:

- viewer request Function と Signed Cookie 検証の実行順序（sentinel rewrite で未認証の第三者に一律403が返るか）
- 親ドメインCookieが pages ホストへ届くか

## 後付けタスク（時期未定）

- [ ] Google IdP追加 + メールドメイン制限（`email_verified` / ドメイン判定）
- [ ] CLIのnpm配布（レジストリ選定含む）
- [ ] CI（typecheck / test / synth）
- [ ] 公開範囲の棚卸しスクリプト（`meta/` を走査）

## ビルド成果物のデプロイ

App DistributionのUI用bucketへは、`cdk deploy` とは別に手でアップロードする。`cdk synth` が web のビルドに依存する形にしたくないため、CDKのBucketDeploymentは使っていない。

```bash
pnpm --filter @page-share/web build
aws s3 sync packages/web/dist/client s3://<AppBucketName> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'
```

`_shell.html` は毎回入れ替わるので、`Cache-Control` を短くして上げるか、デプロイのたびにinvalidationを打つ。ハッシュ付きのアセットはそのまま長期キャッシュでよい。Pages Distributionでinvalidationを使わない方針は、こちらのapp配信には適用されない。

## 並行の指針

- 基本は「CDKの縦切り1本 + 並行1本」まで
- 分担はパッケージ単位にする。パッケージが違えばworktree分離は不要
- `pnpm-lock.yaml` が唯一の衝突点なので、依存を追加するタスクを同時に走らせない
- タスクは「1タスク = 1コミットできる粒度 + 受け入れ条件」で切って渡す
