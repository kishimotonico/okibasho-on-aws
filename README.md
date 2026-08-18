# internal-page-share

社内向けの HTML 共有サービス。生成した HTML やモックを、URL ひとつで社内メンバーへ共有する。

## リポジトリ構成

pnpm workspaces によるモノレポ。

| パッケージ        | 役割                                     |
| ----------------- | ---------------------------------------- |
| `packages/infra`  | AWS CDK。全 AWS リソースの定義           |
| `packages/api`    | Lambda のハンドラ                        |
| `packages/web`    | 管理アプリのフロントエンド（技術選定中） |
| `packages/cli`    | アップロード用のコマンド（技術選定中）   |
| `packages/shared` | 上記から共通で参照する型・定数           |

CDK をリポジトリのルートに置かずひとつのパッケージとして扱っているのは、フロントエンドや CLI と
TypeScript の設定・依存が混ざらないようにするため。

## セットアップ

```bash
pnpm install
```

## よく使うコマンド

```bash
pnpm typecheck                          # 全パッケージの型チェック
pnpm format                             # Prettier で整形
pnpm --filter @page-share/infra synth   # CloudFormation テンプレートの生成
pnpm --filter @page-share/infra diff    # デプロイ済みスタックとの差分
pnpm --filter @page-share/infra deploy  # デプロイ
```

## ドキュメント

- [docs/concept.md](docs/concept.md) — 何を作るか。目的・MVPスコープ・完成イメージ
- [docs/architecture.md](docs/architecture.md) — どう作るか。決定済みの設計
- [docs/open-questions.md](docs/open-questions.md) — 未確定の論点。決まったら architecture.md へ移す
- [docs/roadmap.md](docs/roadmap.md) — 実装の進め方。フェーズ分けと受け入れ条件
