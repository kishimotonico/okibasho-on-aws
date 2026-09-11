---
version: 1
slug: 'packages-web'
primary_target: 'packages/web'
related_targets: []
---

# Surface: packages/web admin home

Mode: Operate
Audience: 約30人の社員。非開発職は置いてコピー。開発者は一覧・差し替え・削除もする。
Job: ログイン済みの `/` で HTML を置き、URL をコピーする。下の一覧で同じ URL を管理する。
Scope: `/` first viewport（アップロード＋My Pages）。`/callback` と 404 は同じ世界を継ぐ。Cognito 画面は自作しない。
Untouched: S3 キー構成、sessionStorage 認証、port 3000、SSR を足さないこと。
Anti-goals: ランディング化、機能の予告、slug/保存期間がドロップより先。
Approved comp: .impeccable/mocks/comp-a-composer-well.png
Revisions from approval: 地は明るく、ラベンダーは使わない、一覧は密な行。

## Direction contract

**THESIS:** 管理画面は、社内チャットに URL を貼る直前の下書きである。ドロップは本文ウェル、成果物はリンクの展開カード。ダッシュボードでもマーケでも5列表でもない。

**OWN-WORLD:** 蛍光灯のオフィスで開く、明るいコンポーザー。地 #EEF0F2、紙 #FFFFFF、罫 #D3D6DB、墨 #1A1D21。エメラルド #1F7A4D はコピー成功だけ。ラベンダーも旧ブルー #0B5FFF も使わない。フォーカスは墨のリング。展開カードは成功時だけ。一覧は密な行。日本語の敬体。キッカー禁止。

**STORY:** もうログインしている。HTML を置く。URL をコピーする。下の行から同じ展開をやり直せる。

**FIRST VIEWPORT:** 細いヘッダー（📦 okibasho | ログアウト）。いちばん大きいのがドロップの本文ウェル。slug は「URL を指定する（任意）」の details に折りたたみ（初期は閉じる。空欄なら自動生成）。直下のツールバーに 30日/無期限、アップロード。成功するとウェル下に展開カード。My Pages は slug + 状態 + コピー/再アップロード/保存期間/削除の行。

**FORM:** メッセージコンポーザーとリンク展開。Operate。Restrained。署名の動作: ドロップ → 展開が生える → コピー。

**SEED:** 397d7359 · kind pick（貼る下書き）· composition composer-well
