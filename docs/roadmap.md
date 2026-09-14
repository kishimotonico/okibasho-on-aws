# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。変更の経緯は [decision-adpot-iam-direct.md](decision-adpot-iam-direct.md)。

方針は「縦に薄く」。統合リスクの高いところを最小構成で早く一周させる。API Gateway・presigned PUT は使わない。最初の一周は「IAM で自分の prefix だけに書ける → CloudFront で見える」である。CloudFront KeyValueStore は当初は使わない方針だったが、外部共有（Phase 6）で採用した。

チェックボックスは「実装が終わった」印である。受け入れ条件はデプロイして初めて確認できるものが多いため、AWS アカウントが決まるまでは各フェーズに検証状況を注記し、未検証のまま先へ進む。

## 現状

旧設計（API Gateway + JWT Authorizer + presigned PUT + KVS）のコードが残っている。設計は案 3（IAM 活用）へ切り替えたので、`packages/api` と `packages/shared` は削除し、infra / web / cli は新設計に書き換える。デプロイは一度も行っておらず、AWS と繋いだ動作は全て未検証である。

初回デプロイは CloudFront のデフォルトドメインで行い、独自ドメインと Signed Cookie による閲覧認証はその後に入れる。

## Phase 0: 前提（手動）

- [ ] AWS アカウントとリージョンの確定（決まったら `packages/infra/.env` の `CDK_DEPLOY_ACCOUNT` / `CDK_DEPLOY_REGION` を設定）
- [ ] `cdk bootstrap`（デプロイ先リージョンと、証明書用に us-east-1 の両方）
- [ ] 請求アラート / Budgets の設定
- [ ] **独自ドメインの取得と Route 53 hosted zone の用意**（早めにやると Phase 3 の制約が消える）

### ローカルで一周させる仕組みは作らない

「アップロードして、発行された URL を開いて表示される」という一周で確かめたい中身は、Cognito と Identity Pool のクレデンシャル、IAM の prefix 制限、OAC と bucket policy、CloudFront Function の runtime 2.0、S3 CORS といった AWS 側の挙動そのものである。ローカルの模擬では答えが出ない。一周の見た目を先に作っても、デプロイ後に確認すべき項目は減らない。

## Phase 1: 配信の背骨

- [ ] `packages/api` と `packages/shared` を削除し、workspace / tsconfig の参照を整理する
- [ ] pages バケット（private / Public Access Block / CORS）
- [ ] pages Distribution + OAC + Response Headers Policy + Geo restriction
- [ ] CloudFront Function（`/p/<user>/` の展開 + index.html 補完、runtime `cloudfront-js-2.0`）
- [ ] CDK snapshot テスト（env / domains 未設定でも synth が通ること）
- [ ] 存在しないページの 404 で S3 のエラー XML を返さない（本文の `<Key>` に `pages/<email>/...` がそのまま出て、メールアドレスとキー構成が見える。デプロイ後の確認で発覚）。外部共有（Phase 6）で追加したカスタムエラーレスポンス（404 → `errors/404.html`）で対応した。デプロイ後の確認は未了

受け入れ: 手で置いた `pages/test@example.jp/demo/index.html` が `/p/test/demo/` で表示される。

ここで確認したい AWS 側の挙動:

- OAC で S3 から実際にオブジェクトが取れるか
- 存在しない key が 403 ではなく 404 で返るか
- CloudFront Function が runtime 2.0 で構文エラーなく動くか
- `/p/test/demo/` が `pages/test@example.jp/demo/index.html` に展開されるか
- `@` を含む user が 404 になるか

## Phase 2: 認証と最初の E2E

- [ ] Cognito User Pool + Managed Login + App Client x2（当面ローカルユーザー）
- [ ] Cognito Identity Pool + authenticated role + IAM ポリシー + プリンシパルタグ（`sts:TagSession` を含む）
- [ ] unauthenticated access を無効にする
- [ ] CLI: `login`（PKCE + localhost コールバック + token 保存）
- [ ] CLI: アップロード（単一ファイル / ディレクトリ、metadata 書き込み、URL 表示）
- [ ] CLI: `list` / `rm`

受け入れ: `okiba login` → `okiba ./dist/` でアップロードし、発行された URL で閲覧できる（このフェーズでは閲覧認証なし）。**別ユーザーの prefix に書こうとすると AccessDenied になることをテストで確認する。**

ここで確認したい AWS 側の挙動:

- Managed Login からのリダイレクトが callback に戻ってくるか
- Identity Pool が id_token から一時クレデンシャルを出せるか
- プリンシパルタグ `email` が PutObject の Resource ARN に展開されるか
- prefix なしの `ListObjectsV2` が AccessDenied になるか
- S3 CORS がブラウザからの PUT に必要になるのは Phase 4。CLI では再現しない

## Phase 3: 閲覧認証 ※独自ドメインが前提

- [ ] Route 53 + ACM、app / pages のカスタムドメイン
- [ ] CloudFront 公開鍵 + Key Group、秘密鍵を SSM SecureString へ
- [ ] `/auth/pages-cookie` Lambda（`aws-jwt-verify` で検証 → 親ドメイン Cookie 発行）
- [ ] 403 カスタムエラーページ → app → 元 URL の再認証フロー
- [ ] app セッション Cookie を使う場合は `__Host-` プレフィックス

使用する hostname は `app.<service-domain>`、`pages.<service-domain>`。2 つを同じ親ドメインの下に置くことが、Signed Cookie を親ドメインで発行する設計の前提になる。実際のドメイン名はこの文書では固定しない。

受け入れ: 未ログインで pages URL を開くとログインへ誘導され、ログイン後に元のページが表示される。

デプロイ後に見るべき点:

- 親ドメイン Cookie が pages ホストへ届くか
- `cloudfront.net` のままでは親ドメイン Cookie が設定できないこと（独自ドメイン必須）

この期間は URL を知っていれば誰でも閲覧できるため、実際の業務資料はアップロードしない（検証用データのみ）。

## Phase 4: 管理 UI

- [ ] 静的 SPA を app バケットへ、app Distribution に origin 追加
- [ ] SPA ルート直下の認証ゲート（未ログインなら即 Managed Login へリダイレクト） → Identity Pool → 一時クレデンシャル取得
- [ ] `/` 画面（上にアップロード：単一 / ディレクトリ / drag & drop、slug 指定、保存期間。下に自分のページ一覧：URL コピー・保存期間変更・削除・再アップロード）
- [ ] pages バケットの CORS（app origin + 開発用 localhost）

受け入れ: ブラウザだけでログイン → drag & drop アップロード → URL コピーまでできる。

## Phase 5: 仕上げ

- [x] EventBridge Rule + cleanup（期限切れ削除・孤児回収）。別Lambdaは作らず、PageMaintenance Lambda（旧share projector）の1時間ごとのスケジュール処理に統合した（[plan-performance-tuning.md](plan-performance-tuning.md) フェーズ4）
- [ ] Google IdP 追加 + メールドメイン制限（PreSignUp トリガー）
- [ ] CLI の npm 配布
- [ ] CI（typecheck / test / synth）、GitHub Actions OIDC
- [ ] 入力検証の詰め（slug 規則の確定を含む）

受け入れ: 期限切れページが最大 1 時間以内に消え、Workspace ドメイン外のアカウントはサインアップできない。

## Phase 6: 外部共有

- [ ] CloudFront KeyValueStore + PageMaintenance Lambda（S3 イベントでページ単位の即時投影 + 1 時間ごとの定期処理で全件 reconcile）
- [ ] pages Distribution に `/s/*` ビヘイビア（share-router.js）と `/errors/*` ビヘイビア（カスタムエラーレスポンス、BucketDeployment）を追加
- [ ] `packages/core/src/page/share.ts`（share の組み立て・ハッシュ・id 生成・CIDR 検証）
- [ ] 管理 UI の ShareDialog（共有 URL の発行・パスワード・IP 制限・再発行・停止）

受け入れ: 管理 UI で外部共有 URL を発行し、ログインなしで開ける。共有を停止すると URL が使えなくなる。

デプロイ後に確認したい点:

- 存在しないパスで `errors/404.html` が返り、S3 のキーが見えないこと
- 不正な形式（33 文字でない、`/^[A-Za-z0-9_-]{33}$/` に合わない）の id が 404 になること
- viewer-request の CloudFront Function が `Authorization` ヘッダを読めること（cache policy に含めていなくても）
- `Authorization` ヘッダを削除して転送しても OAC の署名が壊れないこと
- 401 でブラウザの認証ダイアログが出ること
- `Buffer` / `crypto.createHash` / `Number.isInteger` が CloudFront Functions runtime 2.0 で動き、コードサイズとコンピュート使用率が上限内に収まること
- `meta/` 配下の JSON の作成・削除・書き換えが数秒〜十数秒で KVS へ反映されること。S3 通知を止めても 1 時間以内の定期処理で追いつくこと
- 共有を停止・削除した旧 id が 404 のままであること
- SigV4A 署名（`@aws-sdk/signature-v4a` の副作用 import）が Lambda 実行環境で通るか
- `NodejsFunction` の bundling（pnpm workspace 特有の PATH 調整を含む）が CI で動くか
- パフォーマンスチューニング計画（[plan-performance-tuning.md](plan-performance-tuning.md)）フェーズ0の計測をやり直す。CloudWatch Logs Insights で PageMaintenance Lambda（改名前は share projector）の `Init Duration` / `Duration` を集計する。共有を ON にしてから `/s/` が 404 以外を返すまでの時間を curl のループで測り、連続して 2〜3 ページを操作したときの値（スロットルの影響）も見る
- 存在しない KVS キーへの `UpdateKeys` の delete が実際にどう振る舞うか。`kvs-client.ts` は `ResourceNotFoundException` が起きたときだけ `GetKey` で存在を確かめる実装にしているため、これが実際に必要な分岐かどうかを確認する
- 上記の計測でスロットル待ちが残るようなら、`reservedConcurrentExecutions: 1` を外す検討をする（外す場合は plan-performance-tuning.md フェーズ2に書いた「Describe（ETag）→ metadata の Get → UpdateKeys(IfMatch)」の順に処理を組み直す）

## ビルド成果物のデプロイ

App Distribution の UI 用 bucket へは、`cdk deploy` とは別に手でアップロードする。`cdk synth` が web のビルドに依存する形にしたくないため、CDK の BucketDeployment は使わない。

```bash
pnpm --filter @okibasho/web build
aws s3 sync packages/web/dist/client s3://<AppBucketName> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'
```

`_shell.html` は毎回入れ替わるので、`Cache-Control` を短くして上げるか、デプロイのたびに invalidation を打つ。ハッシュ付きのアセットはそのまま長期キャッシュでよい。

## 並行の指針

- 基本は「CDK の縦切り 1 本 + 並行 1 本」まで
- 分担はパッケージ単位にする。パッケージが違えば worktree 分離は不要
- `pnpm-lock.yaml` が唯一の衝突点なので、依存を追加するタスクを同時に走らせない
- タスクは「1 タスク = 1 コミットできる粒度 + 受け入れ条件」で切って渡す
