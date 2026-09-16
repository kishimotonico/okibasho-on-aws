# okibasho

ちょっとした HTML・アーティファクトを共有するための AWS スタック。生成した HTML やモックを、URL ひとつでチームメンバーへ共有する。

認可は IAM ポリシーに委譲する。ブラウザと CLI は Cognito Identity Pool 経由の一時クレデンシャルで S3 を直接操作し、API Gateway は持たない。

## リポジトリ構成

pnpm workspaces によるモノレポ。

| パッケージ       | 役割                                               |
| ---------------- | -------------------------------------------------- |
| `packages/infra` | AWS CDK。全 AWS リソースの定義                     |
| `packages/web`   | 管理 UI（静的 SPA。S3 をブラウザから直接操作する） |
| `packages/cli`   | アップロード用 CLI（`npx okiba`。AWS CLI 不要）    |
| `packages/core`  | web と CLI が共有するページの規則と S3 操作        |

CDK をリポジトリのルートに置かずひとつのパッケージとして扱っているのは、フロントエンドや CLI と TypeScript の設定・依存が混ざらないようにするため。

## セットアップ

```bash
pnpm install
cp packages/infra/.env.example packages/infra/.env   # デプロイ設定。EMAIL_DOMAIN は必須
```

## 独自ドメイン

任意。設定しなければ CloudFront のデフォルトドメインで動くが、内部ページ（`/p/*`）はログインなしで見られる。サービスドメインを 1 つ決めると（例: `okibasho.example.com`）、pages がその apex、管理 UI が `app.okibasho.example.com` になり、内部ページに Signed Cookie の閲覧認証が付く。設計は [docs/architecture.md](docs/architecture.md) の「独自ドメイン」と「内部ページの閲覧（Signed Cookie）」にある。

1. ACM 証明書を us-east-1 で作る（CloudFront の制約）。SAN は apex と `app.` の 2 つ。DNS 検証の CNAME は Hosted Zone に手で置く

   ```bash
   aws acm request-certificate --region us-east-1 \
     --domain-name okibasho.example.com \
     --subject-alternative-names app.okibasho.example.com \
     --validation-method DNS
   aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
     | jq '.Certificate.DomainValidationOptions[].ResourceRecord'   # この CNAME を Hosted Zone に追加
   ```

2. Signed Cookie の鍵ペアを作り、SSM Parameter Store に置く。パラメータ名は固定（CDK と Lambda がこの名前を読む）

   ```bash
   openssl genrsa -out pages-signing.pem 2048
   openssl rsa -in pages-signing.pem -pubout -out pages-signing.pub
   aws ssm put-parameter --name /okibasho/pages-signing/public-key  --type String       --value file://pages-signing.pub
   aws ssm put-parameter --name /okibasho/pages-signing/private-key --type SecureString --value file://pages-signing.pem
   rm pages-signing.pem pages-signing.pub
   ```

3. `packages/infra/.env` に `SERVICE_DOMAIN` と `CERTIFICATE_ARN` を書く。Route 53 の Hosted Zone にレコードを作らせるなら `HOSTED_ZONE_ID` と `HOSTED_ZONE_NAME` も書く（他サービスと共用のゾーンでよい）。書かなければ `cdk deploy` の出力にある Distribution ドメインを外部 DNS に CNAME / ALIAS で登録する

4. `cdk deploy` したあと、`PagesBaseUrl` と `AppUrl` の出力が独自ドメインになっていることを確認し、web の `VITE_PAGES_BASE_URL` と CLI の `pagesBaseUrl` を更新する

鍵を作り直すときは 2 のパラメータを上書きしてから `cdk deploy` する。公開鍵が変わるので CloudFront の `PublicKey` が置き換わり、古い Cookie は 403 になって再ログインが走るだけで済む。

## よく使うコマンド

```bash
pnpm typecheck                          # 全パッケージの型チェック
pnpm test                               # 全パッケージのテスト（Vitest）
pnpm format                             # Prettier で整形
pnpm --filter @okibasho/infra synth   # CloudFormation テンプレートの生成
pnpm --filter @okibasho/infra diff    # デプロイ済みスタックとの差分
pnpm --filter @okibasho/infra deploy  # デプロイ
pnpm --filter @okibasho/web dev        # 管理UIの開発サーバー
pnpm --filter @okibasho/cli build      # CLIを単一JSにバンドル
```

## ドキュメント

- [docs/concept.md](docs/concept.md) — 何を作るか。目的・MVPスコープ・完成イメージ
- [docs/architecture.md](docs/architecture.md) — どう作るか。決定済みの設計
- [docs/roadmap.md](docs/roadmap.md) — 実装の進め方。フェーズ分けと受け入れ条件
- [docs/decision-adpot-iam-direct.md](docs/decision-adpot-iam-direct.md) — 案3（IAM 活用）へ切り替えた経緯
