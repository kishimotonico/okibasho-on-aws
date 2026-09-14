# パフォーマンスチューニング計画

外部共有の反映の遅さと、S3 への無駄なアクセスを減らすための計画。外部共有（feat/external-share）の作業が終わってから着手する。

方針は「今のアーキテクチャ（API サーバーなし、S3 が正本、KVS は投影）を維持し、構成はより小さくする」。セキュリティは現状と同等を保てればよく、強化する方向の変更はしない。

## 背景と原因

外部共有の反映が遅いのは、share projector の作りによる。

- S3 イベントで起動しても、毎回「pages/ の全オブジェクト List（Delimiter なし、画像や CSS まで列挙）+ 全 `.metadata.json` の Get + KVS 全件の `ListKeys`」の全件 reconcile をしている
- 同時実行 1 のため、実行中に届いたイベントはスロットルされ、Lambda の非同期再試行のバックオフ（1 秒〜最大 5 分）で待たされる。5 分を超えると捨てられ、15 分の安全網待ちになる
- 起動が低頻度でメモリ 256MB のため、ほぼ毎回コールドスタートになっているはず

全件 reconcile が必要なのは、KVS のキーがクライアントの選んだ share-id だからである。キーの取り合いを防ぐために墓標と hijack 判定が要り、prefix から旧 id を逆引きできないので部分更新ができない。

web / CLI にも無駄がある。

- web は保存期間変更・共有変更・削除・アップロードのたびに `router.invalidate()` で一覧全体（List 1 回 + Get N 回）を取り直す（`packages/web/src/routes/index.tsx:149,176,187`）
- CLI の `list` は `.metadata.json` を直列に Get し（`packages/cli/src/upload-client.ts:222`）、アップロードの Put も直列（同 `:151`）

## 決めたこと

- `.metadata.json` をページの prefix の外へ出し、`meta/<email>/<slug>.json` にする
- KVS のキーを「prefix から導出する tag」にし、share-id は値の中で照合する。URL は `/s/<tag><share-id>/`
- 墓標と hijack 判定は廃止する。tag の衝突（66bit）は考慮しない
- S3 イベントでは該当ページだけを処理する。全件 reconcile は定期実行だけに残す
- 期限（`expiresAt`）は KVS に入れない。期限切れの外部共有は、定期実行（cleanup 統合後は cleanup による metadata 削除）で止まる。社内 `/p/` が cleanup まで最大 1 時間見えるのと同じ許容範囲とする
- 本番未公開なので、検証環境の既存データと KVS は移行せず作り直す

## 進め方

フェーズごとにコミットを分ける。フェーズ 1 と 2 はキー構成を変えるので、この順に進める。

### フェーズ 0: 計測

変更前の数字を取っておき、フェーズごとに同じ方法で測り直す。

- projector: CloudWatch Logs Insights で REPORT 行の `Init Duration` と `Duration` を集計する
- 反映時間: 共有を ON にしてから `/s/<id>/` が 404 以外を返すまでを、curl のループで測る。連続して 2〜3 ページを操作したときの値も取る（スロットルの影響を見るため）
- web: DevTools の Network で一覧表示と各操作後のリクエスト数と所要時間を見る

### フェーズ 1: metadata を `meta/` へ移す

S3 構造は次のようになる。

```text
pages/<email>/<slug>/...        ページ成果物（配信対象）
meta/<email>/<slug>.json        そのページの正本
```

変更点:

- `packages/cli/src/page/s3-keys.ts`: `metadataObjectKey` を `meta/<email>/<slug>.json` に変える。web も `@cli/page` 経由で同じ関数を使う
- authenticated role（`packages/infra/lib/constructs/auth.ts:189,199`）: `meta/${aws:PrincipalTag/email}/*` を ListBucket の `s3:prefix` 条件と Get / Put / Delete の対象に足す
- 一覧（web `listPages`、CLI `listPages`）: `meta/<email>/` を List し、キー名から slug を得て、各 JSON を Get する。`pages/` の CommonPrefixes は見なくなる
- 削除（web `deletePage`、CLI `removePage`）: ページ成果物を消してから metadata を消す。途中で失敗しても一覧に残るので、再度削除できる
- アップロードの孤児削除（web `deleteOrphanObjects`、CLI `uploadPage`）: 「metadata は消さない」という除外が要らなくなる
- 次の防御は不要になるので消す
  - `pages-router.js:55` と `share-router.js:56` の `.metadata.json` → 404
  - bucket policy の `.metadata.json` Deny（`pages-storage.ts:111-121`）。CloudFront が読めるのはもともと `pages/*` と `errors/*` だけ
  - `validateUploadPath` の `.metadata.json` 拒否（`.` で始まるセグメントの拒否は残す）
- metadata の `owner` / `slug` はキーと重複するので、書かないようにする。web は表示にキー由来の値を使う（`packages/web/src/api/pages.ts:166-167`）
- 関連するテストと CDK snapshot を更新する

### フェーズ 2: 共有 URL の tag 化と projector の作り直し

tag の仕様:

- `tag = base64url(SHA-256(UTF-8("pages/<email>/<slug>/")))` の先頭 11 文字（66bit）
- 入力はページ成果物の prefix そのもの。末尾 `/` あり、tag を計算するときだけ小文字化・正規化・エンコードをすることはしない
- 固定のテストベクターを 1〜2 件、設計書に載せ、web / CLI / projector のテストで同じ値を確認する

KVS と URL:

- KVS キー = tag（1 ページ 1 キー）、値 = `{p, id, b?, c?}`
- URL = `/s/<tag 11 文字><share-id 22 文字>/`
- 再発行は同じキーの値の上書き、停止・削除・期限切れはキーの削除になる

変更点:

- 共有ロジック: `packages/cli/src/page/` に tag 計算（WebCrypto の `crypto.subtle`。Node とブラウザの両方で動く）と URL 組み立てを置く。`share.ts:243` の `/s/${id}/` と `ShareDialog.tsx` の `buildShareUrl` を、email と slug も受け取る形に変える
- `share-router.js`: `^[A-Za-z0-9_-]{33}$` を確認 → 先頭 11 文字で KVS get → 値の `id` と後半 22 文字が一致しなければ 404。IP 制限・Basic 認証・rewrite は今のまま
- projector のイベント処理: レコードのキーを form URL デコード（`+` → 空白のあと `decodeURIComponent`）して prefix を導き、重複を除く。各ページの metadata を Get し、共有が有効なら put、無効なら delete する。既存値は読まない
- projector の定期処理: `meta/` を List して全 JSON を Get（並列 8）、KVS 全件と突き合わせて、差分を put、desired の無いキーを delete する。`plan.ts` はこの差分計算だけに縮む
- 墓標・hijack 警告・辞書順の先勝ちのコードとテストを消す
- projector の IAM: `s3:GetObject` を `meta/*`、ListBucket を `s3:prefix: meta/*` に変える
- S3 通知のフィルタ: prefix `meta/`、suffix `.json`
- メモリを 1024MB に上げる
- 同時実行 1 は残す。フェーズ 0 の計測でスロットル待ちが残っていれば、処理順を「Describe（ETag）→ metadata の Get → UpdateKeys(IfMatch)」にしたうえで外す（古い読み取りによる上書きは 409 で弾かれてやり直しになる）

実装前に確認すること:

- `UpdateKeys` で存在しないキーを delete したときの挙動。エラーになるなら、そのときだけ `GetKey` で存在を確かめる

### フェーズ 3: web / CLI の無駄を減らす

- web: 操作後の `router.invalidate()` をやめ、書き込んだ内容で一覧の該当 1 件を差し替える（楽観更新は既にある）。一覧の手動再読み込みボタン（`routes/index.tsx:67`）は残す
- CLI: `list` の metadata の Get を並列にする。アップロードの Put を web と同じ 4 並列にする

新規アップロードで孤児削除の List を省く案は見送る。以前に失敗したアップロードの残骸が同じ slug にあると、それが消えずに配信され続けるためである。節約できるのは List 1 回だけ。

### フェーズ 4: 定期処理を cleanup と統合する

cleanup Lambda（`docs/roadmap.md:94`、未実装）を作るときに、projector の定期処理と 1 本にまとめる。

- 1 つの Lambda で、S3 イベント → 該当ページの投影、1 時間ごとのスケジュール → 期限切れページの削除・孤児の回収・KVS の全件突き合わせ、と分岐する
- 期限切れページを消すと metadata の削除イベントが飛ぶので、KVS のキーも数秒で消える
- スケジュールは 1 時間ごとの 1 本になり、全件走査も 1 時間に 1 回で済む。S3 イベントを取りこぼしたときの回復は最大 1 時間になる
- IAM は S3 の削除権限と KVS 書き込みが 1 ロールに乗る。PowerUser を信頼境界の内側に置く前提なので受け入れる

cleanup の実装までは、projector の定期処理を 15 分ごとのまま残す。

## 見送ったもの

- `expiresAt` を KVS に入れて router で判定する案。正本は metadata のままなので二重管理にはならないが、社内 `/p/` と同じ許容範囲で足りるので、router を小さく保つほうを取った
- tag の衝突対策（書き込み前の占有チェック）。66bit なら 1 万ページでも偶然の衝突は 10⁻¹³ 程度
- DynamoDB への移行。一覧の N+1 と全件走査は消えるが構成要素が増える。ページ数が数百を超えて一覧が重くなったら再検討する

## 設計書の更新

実装に合わせて次を更新する。

- `docs/architecture.md`: S3 構造、authenticated role のポリシー、アップロード手順、URL 解決、外部共有（KVS エントリと投影の規則、エッジでの判定順）、保存期間、テスト方針。PowerUser を信頼境界の内側に置く前提も書く
- `packages/web/PRODUCT.md` / `packages/web/DESIGN.md`: `.metadata.json` と `/s/<share-id>/` の記述
- Construct とスタックのコメント（`share-projection.ts`、`pages-delivery.ts`、`okibasho-stack.ts`）
