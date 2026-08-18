# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。

方針は「縦に薄く」。CDKで全リソースを作り切ってからアプリではなく、統合リスクの高い部分（認証、Signed Cookie、presigned PUT）を最小構成で早く一周させる。

## 後で設定できるようにするもの

最初から用意しなくてよいものと、その代わりの進め方。

### 独自ドメイン

当面はAWSのデフォルトドメイン（`*.cloudfront.net` など）で進める。CDKではドメイン名・証明書を設定値（context / props）でオプショナルにし、未設定ならデフォルトドメインで構築する。

注意: `cloudfront.net` はPublic Suffix Listに載っているため、親ドメインCookieが設定できない。したがってSigned Cookieによる閲覧認証（Phase 3）は独自ドメイン設定後にしか有効化できない。それまでpages側は閲覧認証なしで検証する。

### Google認証

GWS Adminが当面ないため、Cognitoのローカルユーザー（管理者作成のメール+パスワード）で始める。Hosted UI + Authorization Code + PKCEというフローは同じなので、後からGoogle IdPを追加してもCLI / Webのコードは変わらない。IdP追加とメールドメイン制限は後付けタスクとする。

## Phase 0: 前提作業（手動）

- [ ] AWSアカウントとリージョンの確定
- [ ] `cdk bootstrap` 実行

ドメイン取得・Route 53、Google OAuthクライアント作成は後付けタスクへ。

## Phase 1: 配信の背骨（infra）

- [ ] pages用S3 bucket（完全private、Public Access Block）
- [ ] Pages Distribution + OAC
- [ ] CloudFront Function（末尾 `/` への index.html 補完）
- [ ] CDKのsnapshotテスト

受け入れ条件: 手でS3の `pages/test/index.html` に置いたHTMLが、デフォルトドメインの `/p/test/` で表示される。

## Phase 2: 認証と最初のE2E（infra + api + shared + cli）

- [ ] Cognito User Pool + Hosted UI（ローカルユーザー、Web/CLIの2 App Client）
- [ ] API Gateway HTTP API + JWT Authorizer
- [ ] shared: API型・slug規則・Content-Type対応の実装
- [ ] api: POST /api/pages（slug確定、metadata作成、presigned PUT発行）
- [ ] cli: login（PKCE + localhostコールバック、token保存）
- [ ] cli: upload（単一ファイル / ディレクトリ、presigned PUT、URL表示）

受け入れ条件: `share-html login` → `share-html ./dist/` でアップロードし、発行されたURLで閲覧できる（このフェーズでは閲覧認証なし）。

## Phase 3: 閲覧認証（infra + api）※要・独自ドメイン

- [ ] 独自ドメイン導入（Route 53 + ACM、app / pages のカスタムドメイン）
- [ ] Signed Cookie発行（親ドメイン、キーペア管理）
- [ ] appセッションの `__Host-` Cookie
- [ ] 403カスタムエラーページ → app → 元URLの再認証フロー

受け入れ条件: 未ログインでpages URLを開くとログインへ誘導され、ログイン後に元のページが表示される。

## Phase 4: Web UI（web）

- [ ] TanStack Start scaffold（SPAモード + prerender、S3配信）
- [ ] App DistributionにUI用S3 originを追加（/api/* はAPI Gatewayのまま）
- [ ] ログイン（Hosted UIリダイレクト）
- [ ] アップロード画面（単一ファイル / ディレクトリ / drag & drop、名前指定、retention選択）
- [ ] My Pages（一覧、URLコピー）

受け入れ条件: ブラウザだけでログイン → drag & dropアップロード → URLコピーまでできる。

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
