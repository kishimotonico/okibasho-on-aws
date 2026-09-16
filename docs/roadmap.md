# ロードマップ

実装の進め方。設計の正本は [architecture.md](architecture.md)、要件は [concept.md](concept.md)。方針は「縦に薄く」、統合リスクの高いところを最小構成で早く一周させる。

## 現状

CloudFront のデフォルトドメインで初回デプロイ済み。web / CLI から Cognito ローカルユーザーでログインし、Identity Pool の一時クレデンシャルで S3 に直接 PutObject / GetObject / DeleteObject / ListObjectsV2 する構成が動いている。`/p/<user>/<slug>/` の内部配信と `/s/<tag><share-id>/` の外部共有配信もどちらも実装済みで、KVS への投影と期限切れページの削除は PageMaintenance Lambda が 1 時間ごとのスケジュールで行う（S3 イベントによる該当ページだけの即時投影も別経路で動く）。

独自ドメインと Signed Cookie による閲覧認証はコード上は入っている（実デプロイは未確認）。まだ入っていないのは、Google IdP、CLI の npm 配布、CI である。

## 残っている作業

### 独自ドメインと閲覧認証

設計は [architecture.md](architecture.md) の「独自ドメイン」「内部ページの閲覧（Signed Cookie）」「CDK」節に決めてある。ドメインの付け替え（PR 1）と Signed Cookie 閲覧認証（PR 2）は実装済み。残るのは、手作業だった証明書と鍵ペアを CDK に取り込む PR 3 と、実デプロイでの確認。ドメイン無しでも synth・deploy できることは保つ。

PR 3: 証明書と鍵ペアの IaC 化（`packages/infra` のみ）

- [x] `config.ts`: `CERTIFICATE_ARN` を廃止し、`SERVICE_DOMAIN` / `HOSTED_ZONE_ID` / `HOSTED_ZONE_NAME` を 3 つそろえて設定する形にする。`.env.example` は更新済み
- [x] `certificate-stack.ts`（`OkibashoCertificate`、`env.region: 'us-east-1'`）。`Certificate` + `CertificateValidation.fromDns(hostedZone)`、SAN は pages と app。`certificate` を公開する
- [x] `bin/app.ts`: serviceDomain があるときだけ証明書スタックを作り、`OkibashoStack` に `certificate` を渡す。`okibasho.addStackDependency(certificateStack)`。`cdk.json` に `"@aws-cdk/core:defaultCrossStackReferences": "weak"` を足し、`crossRegionReferences` は使わない
- [x] `ServiceDomain`: 証明書を props で受け取る形にし、`Certificate.fromCertificateArn` を消す。Hosted Zone は必須になるので `addAliasRecords` の早期 return を消す。`PagesDistributionDomainName` / `AppDistributionDomainName` の Output も不要になるので消す
- [x] `SigningKeyPair` Construct（`pages-viewer-auth.ts` 内か隣のファイル）。`Provider` + `NodejsFunction`（`lambda/signing-key-pair/`）+ `CustomResource`。Lambda は Create で `crypto.generateKeyPairSync('rsa', 2048)`（公開鍵 spki / 秘密鍵 pkcs8、PEM）を作って SSM に 2 つ置き（`/<スタック名>/pages-signing/public-key` は String、`private-key` は SecureString）、`Data.PublicKeyPem` を返す。Update は SSM の公開鍵を読んで同じ値を返す。Delete で 2 つを消す（無くても成功扱い）。`generation` プロパティを props に持ち、変わったら再生成する。鍵の値は一切ログに出さない
- [x] `PagesViewerAuth`: `PublicKey.encodedKey` を `keyPair.publicKeyPem`（`getAttString`）にし、`StringParameter.valueForStringParameter` を消す。発行 Lambda には秘密鍵のパラメータ名を渡し、`grantRead` はそのまま
- [x] snapshot（ドメインあり）を証明書スタック込みで更新し、`Fn::GetStackOutput` で証明書 ARN を受けていること、`AWS::CertificateManager::Certificate` が us-east-1 のスタックにあること、カスタムリソースと Provider が存在することをアサートする。ドメイン無しの snapshot は変えない。鍵ペア Lambda は SSM 呼び出しを差し替えて Create / Update / Delete を単体テストする

受け入れ: `.env` に 3 つ書いて `cdk bootstrap`（デプロイ先と us-east-1）→ `cdk deploy --all` だけで証明書・DNS 検証・Alias レコード・鍵ペアまで揃い、手順書から AWS CLI の操作が消える。`cdk destroy --all` で証明書と SSM パラメータも消える。

PR 4: 鍵ペアを generation ごとの不変リソースにする（`packages/infra` のみ。Codex のセカンドオピニオンから採用）

- [ ] `SigningKeyPair` の SSM パラメータ名を `/<スタック名>/pages-signing/<generation>/{public-key,private-key}` にし、PhysicalResourceId をその generation のプレフィックスにする。`privateKeyParameterName` も generation 込みになる
- [ ] handler: Create は生成、Update は「generation（プレフィックス）が変わったら新しい PhysicalResourceId で Create と同じ処理、同じなら SSM の公開鍵を返す」に単純化し、既存パラメータの上書き（Put の `Overwrite`）と「変わったか比較して作り直す」分岐を消す。Delete はその PhysicalResourceId の 2 つを消す（無くても成功）。旧 generation の削除は CloudFormation が送る Delete に任せる
- [ ] Lambda の IAM は `/<スタック名>/pages-signing/*` 配下のまま（generation をまたぐため）
- [ ] 単体テストと snapshot を更新する

受け入れ: `generation` を進めてデプロイすると新しいパラメータが作られ、旧 generation は CloudFormation の Delete で消える。ロールバックすると旧 generation のパラメータがそのまま使われる。

デプロイ後に確認する点:

- Lambda OAC 越しの POST が通ること（`x-amz-content-sha256` が無いと 403 になるはず。`Authorization` は CloudFront が上書きするためボディで渡す設計にしている）
- viewer-request の CloudFront Function と Signed Cookie の検証のどちらが先か。Cookie 無しで `/` を開いたとき、302 で app へ行くか、403 ページ経由で app へ行くか
- Geo restriction の 403 で `/s/*` を開いたとき、403.html が固定文言を出して app へ飛ばさないこと

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

## 並行の指針

- 基本は「CDK の縦切り 1 本 + 並行 1 本」まで
- 分担はパッケージ単位にする。パッケージが違えば worktree 分離は不要
- `pnpm-lock.yaml` が唯一の衝突点なので、依存を追加するタスクを同時に走らせない
- タスクは「1 タスク = 1 コミットできる粒度 + 受け入れ条件」で切って渡す
