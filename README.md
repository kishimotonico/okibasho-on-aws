# internal-page-share

社内向けの HTML 共有サービス。生成した HTML やモックを、URL ひとつで社内メンバーへ共有する。

認可は IAM ポリシーに委譲する。ブラウザと CLI は Cognito Identity Pool 経由の一時クレデンシャルで S3 を直接操作し、API Gateway は持たない。

## リポジトリ構成

pnpm workspaces によるモノレポ。

| パッケージ       | 役割                                                   |
| ---------------- | ------------------------------------------------------ |
| `packages/infra` | AWS CDK。全 AWS リソースの定義                         |
| `packages/web`   | 管理 UI（静的 SPA。S3 をブラウザから直接操作する）     |
| `packages/cli`   | アップロード用 CLI（`npx share-html`。AWS CLI 不要）   |

CDK をリポジトリのルートに置かずひとつのパッケージとして扱っているのは、フロントエンドや CLI と TypeScript の設定・依存が混ざらないようにするため。

## セットアップ

```bash
pnpm install
```

## よく使うコマンド

```bash
pnpm typecheck                          # 全パッケージの型チェック
pnpm test                               # 全パッケージのテスト（Vitest）
pnpm format                             # Prettier で整形
pnpm --filter @page-share/infra synth   # CloudFormation テンプレートの生成
pnpm --filter @page-share/infra diff    # デプロイ済みスタックとの差分
pnpm --filter @page-share/infra deploy  # デプロイ
pnpm --filter @page-share/web dev        # 管理UIの開発サーバー
pnpm --filter @page-share/cli build      # CLIを単一JSにバンドル
```

## ドキュメント

- [docs/concept.md](docs/concept.md) — 何を作るか。目的・MVPスコープ・完成イメージ
- [docs/architecture.md](docs/architecture.md) — どう作るか。決定済みの設計
- [docs/open-questions.md](docs/open-questions.md) — 未確定の論点。決まったら architecture.md へ移す
- [docs/roadmap.md](docs/roadmap.md) — 実装の進め方。フェーズ分けと受け入れ条件
- [docs/decision-adpot-iam-direct.md](docs/decision-adpot-iam-direct.md) — 案3（IAM 活用）へ切り替えた経緯
