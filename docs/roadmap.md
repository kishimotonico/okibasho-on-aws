# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。

方針は「縦に薄く」。CDKで全リソースを作り切ってからアプリではなく、統合リスクの高い部分（認証、Signed Cookie、presigned PUT）を最小構成で早く一周させる。

チェックボックスは「実装が終わった」印である。受け入れ条件はデプロイして初めて確認できるものが多いため、AWSアカウントが決まるまでは各フェーズに検証状況を注記し、未検証のまま先へ進む。

## 後で設定できるようにするもの

最初から用意しなくてよいものと、その代わりの進め方。

### 独自ドメイン

当面はAWSのデフォルトドメイン（`*.cloudfront.net` など）で進める。設定は `packages/infra/lib/config.ts` に集約してあり、`domains` が未設定ならデフォルトドメインで構築する。ドメインを用意したらconfigを埋めるだけで証明書・Route 53・カスタムドメインが有効になる形にする（分岐はドメイン関連リソースの1箇所に閉じ込める）。

注意: `cloudfront.net` はPublic Suffix Listに載っているため、親ドメインCookieが設定できない。したがってSigned Cookieによる閲覧認証（Phase 3）は独自ドメイン設定後にしか有効化できない。それまでpages側は閲覧認証なしで検証する。

### Google認証

GWS Adminが当面ないため、Cognitoのローカルユーザー（管理者作成のメール+パスワード）で始める。Hosted UI + Authorization Code + PKCEというフローは同じなので、後からGoogle IdPを追加してもCLI / Webのコードは変わらない。IdP追加とメールドメイン制限は後付けタスクとする。

## Phase 0: 前提作業（手動）

- [ ] AWSアカウントとリージョンの確定（決まったら `packages/infra/lib/config.ts` の `env` を設定）
- [ ] `cdk bootstrap` 実行

アカウント未確定でも `cdk synth` とsnapshotテストは通せるため、Phase 1以降の実装はデプロイ以外先行できる。ドメイン取得・Route 53、Google OAuthクライアント作成は後付けタスクへ。

## Phase 1: 配信の背骨（infra）

- [x] pages用S3 bucket（完全private、Public Access Block）
- [x] Pages Distribution + OAC
- [x] CloudFront Function（末尾 `/` への index.html 補完）
- [x] CDKのsnapshotテスト

受け入れ条件: 手でS3の `pages/test/index.html` に置いたHTMLが、デフォルトドメインの `/p/test/` で表示される。

検証状況: **未検証**（AWSアカウント未確定のためデプロイしていない）。ここまでで通したのは `cdk synth`、スタックのsnapshotテスト、CloudFront Functionのunitテスト（`node:vm` でhandlerを直接実行し、rewrite・301・404を確認）。CloudFrontとS3を実際につないだときの挙動は確認できていない。デプロイ後にまず見るべき点:

- OACでS3から実際にオブジェクトが取れるか
- 存在しないslugが403ではなく404で返るか（`s3:ListBucket` を足した狙いどおりか）
- CloudFront Functionが runtime 2.0 で構文エラーなく動くか

デプロイ時は `PagesBucketName` の出力を見て `pages/test/index.html` を置き、`PagesViewUrl` + `test/` を開けば確認できる。

## Phase 2: 認証と最初のE2E（infra + api + shared + cli）

- [x] Cognito User Pool + Hosted UI（ローカルユーザー、Web/CLIの2 App Client）
- [x] API Gateway HTTP API + JWT Authorizer
- [x] shared: API型・slug規則・Content-Type対応の実装
- [x] api: POST /api/pages（slug確定、metadata作成、presigned PUT発行）
- [x] cli: login（PKCE + localhostコールバック、token保存）
- [x] cli: upload（単一ファイル / ディレクトリ、presigned PUT、URL表示）

受け入れ条件: `share-html login` → `share-html ./dist/` でアップロードし、発行されたURLで閲覧できる（このフェーズでは閲覧認証なし）。

検証状況: **未検証**（デプロイしていないため一周できていない）。通したのは `cdk synth`、snapshotテスト、sharedとapiとcliのunitテスト、CLIのビルド成果物での `--help` と `--dry-run` の実行。CLIの `--dry-run` は、ディレクトリ走査・単一ファイルのindex.html読み替え・パス検証・Content-Type判定・送信前の検証までを、ネットワークに出ずに確認できる。APIのハンドラはS3操作をインターフェースに切り出してあるため、ロジックはフェイク実装でテストしている。

一方、AWSに繋がないと確認できないのは次の点。デプロイ後にここから見る:

- Cognito Hosted UIでのログインが実際に通り、CLIのlocalhostコールバックが受け取れるか（ポート8976〜8978のいずれか）
- JWT AuthorizerがIDトークンを受け入れるか（`aud` とApp Client IDの噛み合わせ）
- `PutObject` の `IfNoneMatch: '*'` がslug予約として期待どおり412を返すか
- presigned PUTの署名対象に `Content-Length` を含めた形で、実際にPUTが通るか（宣言と違うサイズが拒否されるか）
- Lambdaのバンドル（AWS SDK同梱、1.4MB）が実行環境で動くか

設定の受け渡しについて。CLIは接続先を環境変数（`SHARE_HTML_API_URL` / `SHARE_HTML_ISSUER` / `SHARE_HTML_CLIENT_ID`）か `~/.config/share-html/config.json` から読む。値はすべて `cdk deploy` のCfnOutputに出る。未設定のときはどの値がどの出力に対応するかを表示して終了する。

## Phase 3: 閲覧認証（infra + api）※要・独自ドメイン

- [ ] 独自ドメイン導入（Route 53 + ACM、app / pages のカスタムドメイン）
- [ ] Signed Cookie発行（親ドメイン、キーペア管理）
- [ ] appセッションの `__Host-` Cookie
- [ ] 403カスタムエラーページ → app → 元URLの再認証フロー

受け入れ条件: 未ログインでpages URLを開くとログインへ誘導され、ログイン後に元のページが表示される。

進行状況: **保留。Phase 4 を先にやる**。理由は2つある。

- 独自ドメインがまだ無い。`cloudfront.net` はPublic Suffix Listに載っていて親ドメインCookieを設定できないため、このフェーズは実装しても一切動かせない
- app側にセッションCookieを発行する受け口が無い。`__Host-` Cookieを置く先も、403から戻ってくる先も、Phase 4 で作る App Distribution とWeb UIの上にある

先に着手すると、ドメイン名もキーペアの置き場も動作確認の手段も無いまま、検証できないコードだけが増える。ドメインが決まり、Phase 4 でapp側が立ち上がってから戻ってくる。

## Phase 4: Web UI（web）

- [x] TanStack Start scaffold（SPAモード + prerender、S3配信）
- [x] App DistributionにUI用S3 originを追加（/api/* はAPI Gatewayのまま）
- [x] ログイン（Hosted UIリダイレクト）
- [x] アップロード画面（単一ファイル / ディレクトリ / drag & drop、名前指定、retention選択）
- [ ] My Pages（一覧、URLコピー）

受け入れ条件: ブラウザだけでログイン → drag & dropアップロード → URLコピーまでできる。

進行状況: My Pages 以外は実装済み。My Pages は一覧API（`GET /api/pages`）が Phase 5 にあるため、そちらを先にやってから戻る。

検証状況: **未検証**。通したのは typecheck、unitテスト、`vite build`（静的ファイルのみが出ることを確認）、dev serverでの `/`・`/upload`・`/auth/callback` の200応答。ログインとアップロードの実挙動はデプロイしないと確認できない。デプロイ後に見るべき点:

- Hosted UIからのリダイレクトが `https://<app distributionのドメイン>/auth/callback` に戻ってくるか
- CloudFrontの `/api/*` behaviorが `Authorization` ヘッダをAPI Gatewayまで運ぶか
- ブラウザからのpresigned PUTがCORSとContent-Lengthの署名で通るか（ブラウザは `Content-Length` を明示指定できず自動付与に頼っている）

Cognitoまわりで踏んだ実装上の注意が2つある。どちらも `packages/web/src/auth/user-manager.ts` にコメントを残した。

- discovery document（`/.well-known/openid-configuration`）があるのはissuer側で、Hosted UIのドメインには無い。一方でauthorize / tokenの実体はHosted UI側にある。どちらか一方をauthorityにすると片方が欠けるため、endpointを明示して渡している
- ログアウトは標準のRP-Initiated Logoutではなく `/logout?client_id=...&logout_uri=...` という独自形式

### ビルド成果物のデプロイ

App DistributionのUI用bucketへは、`cdk deploy` とは別に手でアップロードする。`cdk synth` が web のビルドに依存する形にしたくないため、CDKのBucketDeploymentは使っていない。

```bash
pnpm --filter @page-share/web build
aws s3 sync packages/web/dist/client s3://<AppBucketName> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'
```

`_shell.html` は毎回入れ替わるので、`Cache-Control` を短くして上げるか、デプロイのたびにinvalidationを打つ。ハッシュ付きのアセットはそのまま長期キャッシュでよい。

## Phase 5: 仕上げ（api + infra + web + cli）

- [ ] GET /api/pages（My Pages API）、GET /api/pages/{slug}
- [ ] PATCH（retention変更 + タグ更新）、DELETE（冪等）
- [ ] S3 Lifecycle（retentionタグ連動）と論理期限（expiresAtで404/410）
- [ ] ログ整備（page作成・削除・retention変更・失敗系）
- [ ] サイズ上限・入力検証の詰め（委任項目の決定を含む）

## 後付けタスク（時期未定）

- [ ] Google IdP追加 + メールドメイン制限（`email_verified` / ドメイン判定）
- [ ] CLIのnpm配布（レジストリ選定含む）
- [ ] CI（typecheck / test / synth）

## 並行の指針

- 基本は「CDKの縦切り1本 + 並行1本」まで。Phase 1〜2のCDKと並行できるのは shared の実装、cli のPKCE骨組み、web のscaffold
- 分担はパッケージ単位にする。パッケージが違えばworktree分離は不要
- `pnpm-lock.yaml` が唯一の衝突点なので、依存を追加するタスクを同時に走らせない
- タスクは「1タスク = 1コミットできる粒度 + 受け入れ条件」で切って渡す
