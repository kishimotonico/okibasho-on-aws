---
name: okibasho
description: 社内チャットに URL を貼る直前の下書き。箱アイコンを中心にしたドロップ即公開と、その下のページ一覧。
colors:
  ground: '#e4e7eb'
  paper: '#ffffff'
  line: '#c6cbd2'
  ink: '#1a1d21'
  muted: '#555a62'
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
    textColor: '#ffffff'
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

操作の主役は composer（白いウェル全体）。中央の開いた箱がブランドマークであり、「ここにドロップして公開」のアフォーダンスであり、状態のフィードバックでもある。ファイルまたはフォルダをドロップ、または箱をクリックして選ぶと、その時点の slug と保存期間で即アップロードが始まる。送信 CTA はない。成功すると箱の直下に公開 URL とコピー・開く・このページを消すが残り、下の「アップロード済みページ」の該当行が数秒ハイライトされる。

**Key Characteristics:**

- 明るい単一カラム（最大 45rem）。地 #E4E7EB、紙 #FFFFFF、罫 #C6CBD2、墨 #1A1D21
- 白い composer ウェルが画面の重心。罫 1px と composer だけの影で「置く場所」を示す。内側の点線枠はない
- エメラルド #1F7A4D は箱アイコン（紙・成功時の蓋と床の円）と成功フィードバック（コピー成功・コピーボタン）だけ
- 一覧はカードにしない。下線だけのフラットな行
- 日本語の敬体。キッカー（eyebrow / 小見出しラベル）禁止
- フォーカスは墨の 2px リング。テキスト選択は罫色（`var(--line)`）

## Colors

蛍光灯のオフィス。暖色アクセントはなく、墨と罫で構造を示し、箱と成功の瞬間だけエメラルドが光る。

### Primary

- **Copy Emerald** (#1F7A4D / `--emerald`): 箱アイコンの紙・成功時の蓋と床の円、成功結果の「URLをコピー」、コピー成功フィードバック。リンク・選択・フォーカス・通常の CTA には使わない。
- **Copy Emerald Soft** (`--emerald-soft`: `color-mix(in srgb, var(--emerald) 14%, var(--well))`): 紙の塗り、閉じた蓋、成功時の床の円の塗り、一覧ハイライトの地。実色はおおよそ #E0ECE6。

### Neutral

- **Office Ground** (#E4E7EB / `--bg`): ページ地、ゴーストボタン背景、読み取り専用入力背景、公開URLの固定部分
- **Copy Paper** (#FFFFFF / `--raised`, `--well`): composer 本文ウェル、入力・セグメント・メニューの面
- **Rule Line** (#C6CBD2 / `--line`): 罫線、入力枠、テキスト選択背景（`::selection`）
- **Office Ink** (#1A1D21 / `--text`): 本文・見出し・リンク・プライマリボタン背景・フォーカスリング
- **Muted Label** (#555A62 / `--muted`): 補助ラベル、プレースホルダー、空状態、セクション見出し、URL 副表示
- **Alert Red** (#B42318 / `--danger`): エラーメッセージ、削除、期限切れメタ、アイコン error のフラッシュ
- **Expired Wash** (#FBF3F2 / `--danger-soft`): メニューの danger hover 地。期限切れ行の背景には使わない

### Named Rules

**The Emerald-Only Rule.** エメラルドは箱アイコン（ブランドマーク）と成功フィードバック（コピー成功・コピーボタン）だけ。リンク色・選択状態・フォーカス・通常の CTA には使わない。選択色は `var(--line)`。

**The No Accent Blue Rule.** ラベンダー、旧ブルー #0B5FFF、およびそれに類する鮮やかな補色アクセントは使わない。インタラクティブ要素は墨と罫で足りる。

## Typography

**Display Font:** Hiragino Sans（Hiragino Kaku Gothic ProN, Yu Gothic UI, Noto Sans JP, sans-serif）
**Body Font:** 同上（単一スタック）
**Label/Mono Font:** ui-monospace（`code` 要素のみ）

**Character:** 日本語 UI フォントの実務的な組み合わせ。装飾はなく、ウェイトとサイズの差だけで階層を作る。英数字の slug は等幅で読む。

### Hierarchy

- **Display** (700, 1.25rem, 1.5): ページ見出し（h1）。404 など例外画面のみ
- **Headline** (600, 0.95rem, 1.5): セクション見出し（h2、「アップロード済みページ」）
- **Title** (600, 0.88–0.95rem, 1.5): 行の slug（page-row h3）、成功結果の URL
- **Body** (400–500, 1rem / 0.875rem, 1.5): 本文、composer 案内、メッセージ。コンテナ最大 45rem
- **Label** (600, 0.85–0.875rem, 1.5): フィールドラベル（公開URL、保存期間。visually-hidden 可）
- **Action** (400–600, 0.75–0.8rem, 1.5): メタ行、テキストリンク（フォルダを選ぶ）

### Named Rules

**The Keigo Rule.** UI 文言は簡潔な日本語の敬体（「〜です」「〜してください」）。用語は slug・保存期間・30日・無期限・公開URL・アップロード済みページ・フォルダ・再アップロードで揃える。

**The No Kicker Rule.** 画面上部やセクション直前に装飾用小見出し（kicker / eyebrow）を置かない。見出しは h1/h2 のみ。

## Layout

単一カラム、中央寄せ、最大幅 45rem（720px）。ヘッダー帯はない。ログアウトは右上の小さなユーティリティメニュー。メインは上下 1.75rem / 4rem の余白。狭い画面ではメニューと重ならないよう上余白を足す。

縦の流れ: composer（箱と成功／案内 → 公開URL → 保存期間 → フォルダを選ぶ）→ アップロード済みページ。

40rem 以下では公開URLのホスト部分を非表示にし、`/ユーザー名/` と slug 入力を1行に収める。保存期間セグメントは全幅。一覧行は情報と操作を縦に積む。

## Elevation & Depth

影は2種類だけ。カード・行・入力は平面。ホバーで影を足さない。

### Shadow Vocabulary

- **Composer lift** (`0 10px 26px rgba(26, 29, 33, 0.12)` / `--shadow`): 本文ウェル（`.composer`）のみ。画面の主役を浮かせる
- **Overlay lift** (`0 4px 12px rgba(26, 29, 33, 0.1)` / `--shadow-overlay`): メニュー、tooltip、吹き出し、AlertDialog などの浮遊レイヤー。composer より弱い

### Named Rules

**The Flat-By-Default Rule.** カード・行・入力は平面。影は composer ウェルと浮遊レイヤーに限定する。

## Shapes

角丸は 10px（composer）と 6px（ボタン・入力・セグメント・メニュー・ハイライト）の二段。composer は罫 1px。ドロップ領域は白いウェル全体で、内側の点線枠は使わない。

入力は全幅、6px 角、罫 1px。公開URLは固定部分（ホスト・ユーザー名）と slug 入力を一体の枠に入れる。セグメントの選択は薄い墨の塗り（強い黒の反転は使わない）。

## Components

### Utility menu

- **Placement:** 画面右上の固定。アップロード UI より目立たせない
- **Trigger:** `CircleUser` の icon button。hover では開かない
- **Menu:** いまはログアウトのみ。項目を足せる構造。Esc・外側クリック・矢印キー、閉じたらトリガーへフォーカス復帰
- **Tooltip:** hover と focus-visible の両方。操作自体は hover 前提にしない

### Composer（本文ウェル）

- **Shape:** 10px 角、罫 1px、composer lift
- **Drop:** 白いウェル全体がドロップ領域。案内は「ここにドロップして公開」。drag over はウェルの地色がわずかに変わり、箱アイコンが主役になる
- **Brand:** 中央に箱アイコン（概ね 96px）と `okibasho` を一度だけ
- **Immediate upload:** ドロップまたはファイル選択で即アップロード。送信 CTA はない
- **Folder:** ウェル下部のテキストリンク「フォルダを選ぶ」（`webkitdirectory`）。ファイル選択は箱クリックのみ

### 公開URL

- **Label:** 公開URL（visually-hidden 可）
- **Structure:** ホスト + `/ユーザー名/` + slug 入力を一体表示。狭い画面（40rem 以下）ではホストを非表示にし、`/ユーザー名/` と slug を1行にする
- **Initial slug:** 初期表示から `generateRandomSlug`（小文字英数字 10 文字）を入れる。必要ならその場で編集する
- **Empty:** 空欄で進めようとすると新しい slug を入れ直してから続行する（送信ボタンによる省略自動生成ではない）
- **Full URL:** 完全な URL は入力の `title` と成功結果のリンクテキストで示す
- **Overwrite highlight:** 上書き確認中は slug 枠を強調（`url-input--overwrite`）
- **Reupload:** slug は readOnly。保存期間は出さない

### 保存期間

- **Label:** 保存期間（visually-hidden 可）
- **Control:** ウェル内の 30日 / 無期限セグメント。デフォルトは 30日。選択は薄い墨

### Success result

- **When:** アップロード成功。次のドロップまで残す。モーダル・トーストは使わない
- **Placement:** 箱の直下（案内文の位置）
- **Content:** 公開 URL（リンク）、URLをコピー、開く、このページを消す
- **Delete:** 確認ダイアログなし。削除後は slug を再生成して次の公開に備える
- **Copy:** エメラルドのコピーボタンと短い成功フィードバック（「コピーしました」）

### Box bubble（箱の吹き出し）

- **Role:** バリデーションエラー、アップロード失敗、新規アップロード時の既存 slug 上書き確認を箱の下に表示する。ページ上部のインラインや `window.confirm` は使わない
- **Placement:** 箱アイコンの直下中央。三角形のしっぽも中央
- **Kinds:** `error`（danger 地・シェイクと同時）、`confirm`（上書き確認。紙地）
- **Overwrite:** 新規アップロードで既存 slug にぶつかったときだけ。「差し替える」「やめる」。保存期間は変わらない旨を短く示す。再アップロードは確認なし
- **Dismiss:** ×、やめる、次の操作（ドロップ・入力変更など）で消える。確認待ち中は2回目のドロップを無視する
- **Motion:** reduced-motion でも内容が読める（アニメーション省略可）

### AlertDialog（一覧の確認）

- **When:** アップロード済みページの削除と「30日に戻す」だけ。Radix AlertDialog を DESIGN トークンで装飾
- **Not used:** 「無期限に変更」はダイアログなしで即実行
- **30日に戻す:** 作成から 30 日以上経過している場合は、即座に期限切れになる警告文をダイアログ内に出す

### アップロード済みページ

- **Heading:** 「アップロード済みページ」。フォームより弱いセクション
- **Row:** 下線だけ。主表示は slug、副表示は URL と有効期限
- **Expiration:** 日本時間の絶対日時を主表示。例: `2026/8/20 21:00 まで（あと2日）`。無期限は「無期限」。期限切れは `期限切れ（yyyy/M/d）`
- **Direct:** 「ページを開く」「URLをコピー」（icon button + tooltip + aria-label）
- **Overflow:** 再アップロード / 無期限に変更（または 30日に戻す）/ 削除は kebab。削除は danger
- **Order:** 作成日時（`createdAt`）の新しい順。同時刻は slug 昇順
- **Highlight:** 新規は先頭に出て数秒。再アップロードは並びを変えずその行だけ。reduced-motion では色だけの静止ハイライト

### Box icon

- **Role:** ブランドマーク、ドロップのアフォーダンス、状態フィードバック（idle / hover / drag / uploading / success / error）
- **Motion:** チューナーの幾何を rAF 1本で描く。目標に収束し時間駆動がなければループを止める
- **Error:** idle 形状へ戻る + 短いシェイクと `--danger` のフラッシュ。reduced-motion では色だけ
- **Click:** idle / hover ではクリックで回転し、ファイル選択ダイアログを開く。uploading 中は開かない。reduced-motion では回転を省略
- **Favicon:** idle の静的 SVG。CSS 変数は使わずライトパレットの実色を焼き込む

### Buttons

- **Primary:** 墨背景・地色文字、6px 角、600、hover は brightness(1.08)
- **Ghost / Secondary:** 地背景・墨文字・罫 1px、hover は紙背景
- **Copy:** エメラルド背景・白文字、hover はやや濃いエメラルド
- **Danger:** メニュー項目と AlertDialog の確認、テキストリンク「このページを消す」
- **Icon button:** 枠なし、muted → ink。コピー成功時は emerald

### Inputs

- **Style:** 全幅、罫 1px、6px 角、紙背景
- **Focus:** 墨 2px outline（グローバル `:focus-visible`）
- **Read-only:** 地背景（再アップロード slug）

## Do's and Don'ts

### Do:

- **Do** 白い composer ウェル全体をドロップ領域として扱う
- **Do** ドロップまたはファイル選択で即アップロードする（送信 CTA は置かない）
- **Do** slug を初期表示から入れ、公開URLを固定部分と slug 入力の一体 UI にする
- **Do** エラーと上書き確認を箱の吹き出しで伝える
- **Do** 一覧の削除と「30日に戻す」を AlertDialog にする
- **Do** エメラルドを箱アイコンと成功フィードバックにだけ使う
- **Do** フォーカスを墨 2px リングで示す
- **Do** 一覧をフラットな行にし、直接操作は開くとコピー、ほかは kebab にまとめる
- **Do** 日本語敬体で、フォルダ・公開URL・アップロード済みページの用語に揃える

### Don't:

- **Don't** キッカー（eyebrow / 装飾ラベル）を使う
- **Don't** アップロード送信 CTA や「選択済みファイル」表示を置く
- **Don't** ドロップ領域の内側に点線枠を足す
- **Don't** `window.confirm` を使う
- **Don't** 一覧の期限を「あと30日」だけで示す（絶対日時を主にする）
- **Don't** ラベンダー・旧ブルー #0B5FFF・鮮やかな補色アクセントを使う
- **Don't** エメラルドをリンク色・選択色・一般アクセントに使う
- **Don't** slug を `<details>` に折りたたむ
- **Don't** 成功表示にモーダルやトーストを使う
- **Don't** 一覧をフォームと同じ強さのカードにする
- **Don't** ダッシュボード風の多列レイアウト・マーケティング的なヒーローを作る
- **Don't** MVP 外の概念（チーム、履歴、公開設定など）を UI に予告する
- **Don't** 不要な gradient / glass / 大量の影 / 強すぎる枠 / 過剰な animation を足す
