---
name: okibasho
description: 社内チャットに URL を貼る直前の下書き。箱アイコンを中心にしたアップロードと、その下のページ一覧。
colors:
  ground: '#eef0f2'
  paper: '#ffffff'
  line: '#d3d6db'
  ink: '#1a1d21'
  muted: '#5b6169'
  emerald: '#1f7a4d'
  emerald-soft: '#e0ece6'
  danger: '#b42318'
  danger-soft: '#fbf3f2'
typography:
  display:
    fontFamily: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Noto Sans JP', sans-serif"
    fontSize: '1.25rem'
    fontWeight: 700
    lineHeight: 1.5
  headline:
    fontFamily: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Noto Sans JP', sans-serif"
    fontSize: '0.95rem'
    fontWeight: 600
    lineHeight: 1.5
  title:
    fontFamily: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Noto Sans JP', sans-serif"
    fontSize: '0.88rem'
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Noto Sans JP', sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Noto Sans JP', sans-serif"
    fontSize: '0.85rem'
    fontWeight: 600
    lineHeight: 1.5
rounded:
  surface: '10px'
  control: '6px'
  chip: '999px'
spacing:
  xs: '0.15rem'
  sm: '0.35rem'
  md: '0.75rem'
  lg: '1.25rem'
  xl: '2.25rem'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.ground}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
  button-ghost:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
  button-copy:
    backgroundColor: '{colors.emerald}'
    textColor: '#f4f7f5'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
  composer-well:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.surface}'
    padding: '1.5rem 1.25rem'
---

# Design System: okibasho

## Overview

**Creative North Star: "The Composer Well"（明るいコンポーザー）**

管理画面は、社内チャットに URL を貼る直前の下書きである。蛍光灯のオフィスで開く明るいコンポーザー。地は薄いグレー、本文は白いウェル。ダッシュボードでもマーケでも5列表でもない。

操作の主役はアップロードフォーム（composer）。中央の開いた箱がブランドマークであり、「ここにファイルを置く」アフォーダンスであり、状態のフィードバックでもある。選ぶ → 必要なら公開URLと保存期間を決める → アップロード、の順に視線が流れる。成功するとフォーム内に URL とコピー／開くが残り、下の「アップロード済みページ」の該当行が数秒ハイライトされる。

**Key Characteristics:**

- 明るい単一カラム（最大 45rem）。地 #EEF0F2、紙 #FFFFFF、罫 #D3D6DB、墨 #1A1D21
- 本文ウェルが画面の重心。罫 1px と composer だけの影で「置く場所」を示す
- エメラルド #1F7A4D は箱アイコン（紙・成功時の蓋と床の円）と成功フィードバック（アップロード成功・コピー成功）だけ
- 一覧はカードにしない。下線だけのフラットな行
- 日本語の敬体。キッカー（eyebrow / 小見出しラベル）禁止
- フォーカスは墨の 2px リング。テキスト選択は罫色（`var(--line)`）

## Colors

蛍光灯のオフィス。暖色アクセントはなく、墨と罫で構造を示し、箱と成功の瞬間だけエメラルドが光る。

### Primary

- **Copy Emerald** (#1F7A4D / `--emerald`): 箱アイコンの紙・成功時の蓋と床の円、成功結果の「URLをコピー」、コピー成功フィードバック。リンク・選択・フォーカス・通常の CTA には使わない。
- **Copy Emerald Soft** (`--emerald-soft`: `color-mix(in srgb, var(--emerald) 14%, var(--well))`): 紙の塗り、閉じた蓋、成功時の床の円の塗り、一覧ハイライトの地。実色はおおよそ #E0ECE6。

### Neutral

- **Office Ground** (#EEF0F2 / `--bg`): ページ地、ゴーストボタン背景、読み取り専用入力背景、公開URLの固定部分
- **Copy Paper** (#FFFFFF / `--raised`, `--well`): composer 本文ウェル、入力・セグメント・メニューの面
- **Rule Line** (#D3D6DB / `--line`): 罫線、入力枠、ドロップ領域の破線、テキスト選択背景（`::selection`）
- **Office Ink** (#1A1D21 / `--text`): 本文・見出し・リンク・プライマリボタン背景・フォーカスリング
- **Muted Label** (#5B6169 / `--muted`): 補助ラベル、プレースホルダー、空状態、セクション見出し、URL 副表示
- **Alert Red** (#B42318 / `--danger`): エラーメッセージ、削除、期限切れメタ、アイコン error のフラッシュ
- **Expired Wash** (#FBF3F2 / `--danger-soft`): メニューの danger hover 地。期限切れ行の背景には使わない

### Named Rules

**The Emerald-Only Rule.** エメラルドは箱アイコン（ブランドマーク）と成功フィードバック（アップロード成功・コピー成功）だけ。リンク色・選択状態・フォーカス・通常の CTA には使わない。選択色は `var(--line)`。

**The No Accent Blue Rule.** ラベンダー、旧ブルー #0B5FFF、およびそれに類する鮮やかな補色アクセントは使わない。インタラクティブ要素は墨と罫で足りる。

## Typography

**Display Font:** Hiragino Sans（Hiragino Kaku Gothic ProN, Yu Gothic UI, Noto Sans JP, sans-serif）
**Body Font:** 同上（単一スタック）
**Label/Mono Font:** ui-monospace（`code` 要素のみ）

**Character:** 日本語 UI フォントの実務的な組み合わせ。装飾はなく、ウェイトとサイズの差だけで階層を作る。英数字の slug は等幅で読む。

### Hierarchy

- **Display** (700, 1.25rem, 1.5): ページ見出し（h1）。404 など例外画面のみ
- **Headline** (600, 0.95rem, 1.5): セクション見出し（h2、「アップロード済みページ」）。muted
- **Title** (600, 0.88rem, 1.5): 行の slug（page-row h3）、成功結果の見出し
- **Body** (400–500, 1rem / 0.875rem, 1.5): 本文、composer 案内、メッセージ。コンテナ最大 45rem
- **Label** (600, 0.85rem, 1.5): フィールドラベル（公開URL、保存期間）
- **Action** (400–600, 0.8rem, 1.5): メタ行（0.75rem）、成功結果の URL

### Named Rules

**The Keigo Rule.** UI 文言は簡潔な日本語の敬体（「〜です」「〜してください」）。用語は slug・保存期間・30日・無期限・公開URL・アップロード済みページ・フォルダ・再アップロードで揃える。

**The No Kicker Rule.** 画面上部やセクション直前に装飾用小見出し（kicker / eyebrow）を置かない。見出しは h1/h2 のみ。

## Layout

単一カラム、中央寄せ、最大幅 45rem（720px）。ヘッダー帯はない。ログアウトは右上の小さなユーティリティメニュー。メインは上下 1.75rem / 4rem の余白。狭い画面ではメニューと重ならないよう上余白を足す。

縦の流れ: composer（箱 → ドロップ領域 → 公開URL → 保存期間 → アップロード → 成功結果）→ アップロード済みページ。

40rem 以下では公開URL入力を縦積み（入力欄は通常の高さ）、保存期間とアップロードは全幅、一覧行は情報と操作を縦に積む。

## Elevation & Depth

影は2種類だけ。カード・行・入力は平面。ホバーで影を足さない。

### Shadow Vocabulary

- **Composer lift** (`0 8px 20px rgba(26, 29, 33, 0.08)` / `--shadow`): 本文ウェル（`.composer`）のみ。画面の主役を浮かせる
- **Overlay lift** (`0 4px 12px rgba(26, 29, 33, 0.08)` / `--shadow-overlay`): メニューと tooltip などの浮遊レイヤー。composer より弱い

### Named Rules

**The Flat-By-Default Rule.** カード・行・入力は平面。影は composer ウェルと浮遊レイヤーに限定する。

## Shapes

角丸は 10px（composer・ドロップ領域）と 6px（ボタン・入力・セグメント・メニュー・ハイライト）の二段。ファイルチップは pill（999px）。composer は罫 1px。ドロップ領域は罫色の破線とごく薄い面で、設定部分と分ける。

入力は全幅、6px 角、罫 1px。公開URLは固定部分と slug 入力を一体の枠に入れる。セグメントの選択は薄い墨の塗り（強い黒の反転は使わない）。

## Components

### Utility menu

- **Placement:** 画面右上の固定。アップロード UI より目立たせない
- **Trigger:** `CircleUser` の icon button。hover では開かない
- **Menu:** いまはログアウトのみ。項目を足せる構造。Esc・外側クリック・矢印キー、閉じたらトリガーへフォーカス復帰
- **Tooltip:** hover と focus-visible の両方。操作自体は hover 前提にしない

### Composer（本文ウェル）

- **Shape:** 10px 角、罫 1px、composer lift
- **Brand:** 中央に箱アイコン（概ね 96px）と `okibasho` を一度だけ
- **Drop:** アイコン・案内・選択ボタンを破線の領域にまとめる。案内は「ファイルまたはフォルダをドロップ」（タッチは「選択」）。drag over はアイコンが主役で、領域の枠が少し濃くなる程度
- **CTA:** フォーム内の終点。未選択時は disabled だが消えない。成功後は選択を空にして再び disabled

### 公開URL

- **Label:** 公開URL。固定部分（`https://…/<user>/`）と slug 入力を一体表示
- **Empty:** 空欄なら自動生成。プレースホルダは例（`my-page`）
- **Reupload:** slug は readOnly。保存期間は出さない

### 保存期間

- **Label:** 保存期間。30日 / 無期限のセグメント。選択は薄い墨

### Success result

- **When:** アップロード成功。次のファイル選択まで残す。モーダル・トーストは使わない
- **Content:** 「アップロードしました」、URL、URLをコピー、開く
- **Copy:** エメラルドのコピーボタンと短い成功フィードバック

### アップロード済みページ

- **Heading:** 「アップロード済みページ」。フォームより弱いセクション
- **Row:** 下線だけ。主表示は slug、副表示は URL と有効期限
- **Direct:** 「ページを開く」「URLをコピー」（icon button + tooltip + aria-label）
- **Overflow:** 再アップロード / 無期限に変更（または 30日に戻す）/ 削除は kebab。削除は danger
- **Order:** 作成日時（`createdAt`）の新しい順。同時刻は slug 昇順
- **Highlight:** 新規は先頭に出て数秒。再アップロードは並びを変えずその行だけ。reduced-motion では色だけの静止ハイライト

### Box icon

- **Role:** ブランドマーク、ドロップのアフォーダンス、状態フィードバック（idle / hover / drag / uploading / success / error）
- **Motion:** チューナーの幾何を rAF 1本で描く。目標に収束し時間駆動がなければループを止める
- **Error:** idle 形状へ戻る + 短いシェイクと `--danger` のフラッシュ。reduced-motion では色だけ
- **Click spin:** idle/hover のみ。reduced-motion では無効。ファイル選択は開かない
- **Favicon:** idle の静的 SVG。CSS 変数は使わずライトパレットの実色を焼き込む

### Buttons

- **Primary:** 墨背景・地色文字、6px 角、600、hover は brightness(1.08)
- **Ghost / Secondary:** 地背景・墨文字・罫 1px、hover は紙背景
- **Copy:** エメラルド背景・#f4f7f5 文字、hover #19653f
- **Danger:** メニュー項目は danger 色
- **Icon button:** 枠なし、muted → ink。コピー成功時は emerald

### Inputs

- **Style:** 全幅、罫 1px、6px 角、紙背景
- **Focus:** 墨 2px outline（グローバル `:focus-visible`）
- **Read-only:** 地背景（再アップロード slug）

## Do's and Don'ts

### Do:

- **Do** ドロップゾーン（composer）を画面の最大要素として扱う
- **Do** 公開URLを固定部分と slug 入力の一体 UI にする
- **Do** 保存期間ラベルを明示し、アップロードをフォーム内の終点に置く
- **Do** エメラルドを箱アイコンと成功フィードバックにだけ使う
- **Do** フォーカスを墨 2px リングで示す
- **Do** 一覧をフラットな行にし、直接操作は開くとコピー、ほかは kebab にまとめる
- **Do** 日本語敬体で、フォルダ・公開URL・アップロード済みページの用語に揃える

### Don't:

- **Don't** キッカー（eyebrow / 装飾ラベル）を使う
- **Don't** ラベンダー・旧ブルー #0B5FFF・鮮やかな補色アクセントを使う
- **Don't** エメラルドをリンク色・選択色・一般アクセントに使う
- **Don't** slug を `<details>` に折りたたむ
- **Don't** 成功表示にモーダルやトーストを使う
- **Don't** 一覧をフォームと同じ強さのカードにする
- **Don't** ダッシュボード風の多列レイアウト・マーケティング的なヒーローを作る
- **Don't** MVP 外の概念（チーム、履歴、公開設定など）を UI に予告する
- **Don't** 不要な gradient / glass / 大量の影 / 強すぎる枠 / 過剰な animation を足す
