# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。方針は「縦に薄く」、統合リスクの高いところを最小構成で早く一周させる。

## 現状

CloudFront のデフォルトドメインで初回デプロイ済み。web / CLI から Cognito ローカルユーザーでログインし、Identity Pool の一時クレデンシャルで S3 に直接 PutObject / GetObject / DeleteObject / ListObjectsV2 する構成が動いている。`/p/<user>/<slug>/` の内部配信と `/s/<tag><share-id>/` の外部共有配信もどちらも実装済みで、期限切れページの削除は PageMaintenance Lambda が毎時、KVS 全件の突き合わせは日次で行う（S3 イベントによる該当ページだけの即時投影も別経路で動く）。

独自ドメインと Signed Cookie による閲覧認証も実装・デプロイ済み。証明書と鍵ペアも CDK が作る（手順は [deploy.md](deploy.md)）。まだ入っていないのは、Google IdP、CLI の npm 配布、CI である。管理 UI の配置は `cdk deploy` とは別に手でアップロードしており、CDK に寄せるかは未決。

## 残っている作業

独自ドメインと閲覧認証で、実機でまだ確かめていない点:

- Lambda OAC 越しの POST が通ること（`x-amz-content-sha256` が無いと 403 になるはず。`Authorization` は CloudFront が上書きするためボディで渡す設計にしている）
- viewer-request の CloudFront Function と Signed Cookie の検証のどちらが先か。Cookie 無しで `/` を開いたとき、302 で app へ行くか、403 ページ経由で app へ行くか
- Geo restriction の 403 で `/s/*` を開いたとき、403.html が固定文言を出して app へ飛ばさないこと

Google IdP とメールドメイン制限:

設計は [architecture.md](architecture.md) の「認証」節にある。1 PR で入れる。

- [x] `GOOGLE_CLIENT_ID` を `config.ts` と `.env.example` に足し、設定時だけ Google IdP を作って App Client に `GOOGLE` を足す（client secret は Secrets Manager から参照）
- [x] PreSignUp トリガーを常に置き、ドメイン・大文字・`+`・（Google のときの）`email_verified` を検証する
- [x] snapshot は Google 無し・Google ありの両方で合成する
- [x] [deploy.md](deploy.md) に GCP の手順、シークレットの登録、デバッグ用ユーザーの作り方を書く

受け入れ: Google ありでデプロイすると、Managed Login に Google の入口が出て、組織のアカウントでログインでき、同じメールのローカルユーザーが作ったページが一覧に出る。組織外のアカウントは弾かれる。`+` 付きや別ドメインのローカルユーザーは `admin-create-user` の時点で失敗する。CLI も Google でログインでき、refresh token で再ログインせずに使える。`GOOGLE_CLIENT_ID` 未設定なら今までどおりデプロイでき、ローカルユーザーだけで使える。

後で Google だけにする（時期は未定）:

- [ ] App Client から `COGNITO` を外し、`GOOGLE_CLIENT_ID` を必須にし、web と CLI の authorize に `identity_provider=Google` を付ける

CLI の npm 配布:

- [ ] `packages/cli/package.json` を公開設定にし、`npx okiba` で実行できるようにする

CI:

- [ ] GitHub Actions で typecheck / test / synth を回す
- [ ] GitHub Actions OIDC + 引受ロールで `cdk deploy` できるようにする（アクセスキーは置かない）

入力検証の詰め:

- [ ] slug 規則の確定を含め、残っている検証の穴を塞ぐ

## デプロイ後に確認したい点

- pages のアクセスログが S3 に届き、`/s/` のリクエストが記録されていること
- 存在しないパスで `errors/404.html` が返り、S3 のキーが見えないこと（デプロイ後の確認は未了）
- 不正な形式（33 文字でない、`/^[A-Za-z0-9_-]{33}$/` に合わない）の id が 404 になること
- viewer-request の CloudFront Function が `Authorization` ヘッダを読めること（cache policy に含めていなくても）。`Authorization` ヘッダを削除して転送しても OAC の署名が壊れないこと
- 401 でブラウザの認証ダイアログが出ること
- `Buffer` / `crypto.createHash` / `Number.isInteger` が CloudFront Functions runtime 2.0 で動き、コードサイズとコンピュート使用率が上限内に収まること
- `meta/` 配下の JSON の作成・削除・書き換えが数秒〜十数秒で KVS へ反映されること。S3 通知を止めても日次の reconcile で追いつくこと
- 共有を停止・削除した旧 id が 404 のままであること
- SigV4A 署名（`@aws-sdk/signature-v4a` の副作用 import）が Lambda 実行環境で通るか
- `NodejsFunction` の bundling（pnpm workspace 特有の PATH 調整を含む）が CI で動くか
- CloudWatch Logs Insights で PageMaintenance Lambda の `Init Duration` / `Duration` を集計する。共有を ON にしてから `/s/` が 404 以外を返すまでの時間を curl のループで測り、連続して 2〜3 ページを操作したときの値（スロットルの影響）も見る
- 存在しない KVS キーへの `UpdateKeys` の delete が実際にどう振る舞うか。`kvs-client.ts` は `ResourceNotFoundException` が起きたときに `GetKey` で存在を確かめる分岐を残しているため、これが実際に必要かどうかを確認する（S3 イベント経由の delete は先に `GetKey` で見るので、この分岐に入るのは reconcile 側だけのはず）
- 上記の計測でスロットル待ちが残るようなら、`reservedConcurrentExecutions: 1` を外す検討をする（外す場合は「Describe（ETag）→ metadata の Get → UpdateKeys(IfMatch)」の順に処理を組み直す）

## 見送った案

- `expiresAt` を KVS に入れて router で判定する案。正本は metadata のままなので二重管理にはならないが、社内 `/p/` と同じ許容範囲で足りるので、router を小さく保つほうを取った
- tag の衝突対策（書き込み前の占有チェック）。66bit なら 1 万ページでも偶然の衝突は 10⁻¹³ 程度
- DynamoDB への移行。一覧の N+1 と全件走査は消えるが構成要素が増える。ページ数が数百を超えて一覧が重くなったら再検討する

## 並行の指針

- 基本は「CDK の縦切り 1 本 + 並行 1 本」まで
- 分担はパッケージ単位にする。パッケージが違えば worktree 分離は不要
- `pnpm-lock.yaml` が唯一の衝突点なので、依存を追加するタスクを同時に走らせない
- タスクは「1 タスク = 1 コミットできる粒度 + 受け入れ条件」で切って渡す
