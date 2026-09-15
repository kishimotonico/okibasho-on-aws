# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。方針は「縦に薄く」、統合リスクの高いところを最小構成で早く一周させる。

## 現状

CloudFront のデフォルトドメインで初回デプロイ済み。web / CLI から Cognito ローカルユーザーでログインし、Identity Pool の一時クレデンシャルで S3 に直接 PutObject / GetObject / DeleteObject / ListObjectsV2 する構成が動いている。`/p/<user>/<slug>/` の内部配信と `/s/<tag><share-id>/` の外部共有配信もどちらも実装済みで、KVS への投影と期限切れページの削除は PageMaintenance Lambda が 1 時間ごとのスケジュールで行う（S3 イベントによる該当ページだけの即時投影も別経路で動く）。

まだ入っていないのは、独自ドメインと Signed Cookie による閲覧認証、Google IdP、CLI の npm 配布、CI である。

## 残っている作業

独自ドメインと閲覧認証（前提: ドメイン取得、us-east-1 での `cdk bootstrap`）:

- [ ] Route 53 hosted zone + ACM 証明書、app / pages のカスタムドメイン
- [ ] CloudFront 公開鍵 + Key Group、秘密鍵を SSM SecureString へ
- [ ] `/auth/pages-cookie` Lambda（`aws-jwt-verify` で検証 → 親ドメイン Cookie 発行）
- [ ] 403 カスタムエラーページ → app → 元 URL の再認証フロー
- [ ] app セッション Cookie を使う場合は `__Host-` プレフィックス

受け入れ: 未ログインで pages URL を開くとログインへ誘導され、ログイン後に元のページが表示される。

Google IdP とメールドメイン制限:

- [ ] Cognito に Google IdP を追加する
- [ ] PreSignUp トリガーでメールドメインを検証し、Workspace ドメイン外のアカウントはサインアップできないようにする

CLI の npm 配布:

- [ ] `packages/cli/package.json` を公開設定にし、`npx okiba` で実行できるようにする

CI:

- [ ] GitHub Actions で typecheck / test / synth を回す
- [ ] GitHub Actions OIDC + 引受ロールで `cdk deploy` できるようにする（アクセスキーは置かない）

入力検証の詰め:

- [ ] slug 規則の確定を含め、残っている検証の穴を塞ぐ

## デプロイ後に確認したい点

- 存在しないパスで `errors/404.html` が返り、S3 のキーが見えないこと（デプロイ後の確認は未了）
- 不正な形式（33 文字でない、`/^[A-Za-z0-9_-]{33}$/` に合わない）の id が 404 になること
- viewer-request の CloudFront Function が `Authorization` ヘッダを読めること（cache policy に含めていなくても）。`Authorization` ヘッダを削除して転送しても OAC の署名が壊れないこと
- 401 でブラウザの認証ダイアログが出ること
- `Buffer` / `crypto.createHash` / `Number.isInteger` が CloudFront Functions runtime 2.0 で動き、コードサイズとコンピュート使用率が上限内に収まること
- `meta/` 配下の JSON の作成・削除・書き換えが数秒〜十数秒で KVS へ反映されること。S3 通知を止めても 1 時間以内の定期処理で追いつくこと
- 共有を停止・削除した旧 id が 404 のままであること
- SigV4A 署名（`@aws-sdk/signature-v4a` の副作用 import）が Lambda 実行環境で通るか
- `NodejsFunction` の bundling（pnpm workspace 特有の PATH 調整を含む）が CI で動くか
- CloudWatch Logs Insights で PageMaintenance Lambda の `Init Duration` / `Duration` を集計する。共有を ON にしてから `/s/` が 404 以外を返すまでの時間を curl のループで測り、連続して 2〜3 ページを操作したときの値（スロットルの影響）も見る
- 存在しない KVS キーへの `UpdateKeys` の delete が実際にどう振る舞うか。`kvs-client.ts` は `ResourceNotFoundException` が起きたときだけ `GetKey` で存在を確かめる実装にしているため、これが実際に必要な分岐かどうかを確認する
- 上記の計測でスロットル待ちが残るようなら、`reservedConcurrentExecutions: 1` を外す検討をする（外す場合は「Describe（ETag）→ metadata の Get → UpdateKeys(IfMatch)」の順に処理を組み直す）

## 見送った案

- `expiresAt` を KVS に入れて router で判定する案。正本は metadata のままなので二重管理にはならないが、社内 `/p/` と同じ許容範囲で足りるので、router を小さく保つほうを取った
- tag の衝突対策（書き込み前の占有チェック）。66bit なら 1 万ページでも偶然の衝突は 10⁻¹³ 程度
- DynamoDB への移行。一覧の N+1 と全件走査は消えるが構成要素が増える。ページ数が数百を超えて一覧が重くなったら再検討する

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
