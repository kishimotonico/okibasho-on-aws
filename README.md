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
