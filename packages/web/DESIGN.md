---
name: okibasho
description: 社内チャットに URL を貼る直前の下書き。明るいコンポーザーとリンク展開カード。
colors:
  ground: '#eef0f2'
  paper: '#ffffff'
  line: '#d3d6db'
  ink: '#1a1d21'
  muted: '#5b6169'
  emerald: '#1f7a4d'
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
  button-primary-hover:
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
    padding: '2rem 1rem'
---

# Design System: okibasho

## Overview

**Creative North Star: "The Composer Well"（明るいコンポーザー）**

管理画面は、社内チャットに URL を貼る直前の下書きである。蛍光灯のオフィスで開く明るいコンポーザー。地は薄いグレー、本文は白いウェル、成果物はリンクの展開カード。ダッシュボードでもマーケでも5列表でもない。

操作の主役はドロップゾーン（composer）。ファイルを置いてから保存期間を選び、アップロードする。成功したときだけウェル下に展開カード（unfurl）が生える。下の My Pages は密な行で、同じ URL のコピー・差し替え・保存期間・削除を繰り返す。

**Key Characteristics:**

- 明るい単一カラム（最大 45rem）。地 #EEF0F2、紙 #FFFFFF、罫 #D3D6DB、墨 #1A1D21
- 本文ウェルが画面の重心。墨の 1px 枠と軽い影で「書く場所」を示す
- エメラルド #1F7A4D はコピー成功だけ。ラベンダー・旧ブルー #0B5FFF は使わない
- 展開カードはアップロード成功時のみ。一覧は密な行
- 日本語の敬体。キッカー（eyebrow / 小見出しラベル）禁止
- フォーカスは墨の 2px リング。テキスト選択は罫色（`var(--line)`）

## Colors

蛍光灯のオフィス。暖色アクセントはなく、墨と罫で構造を示し、成功の瞬間だけエメラルドが光る。

### Primary

- **Copy Emerald** (#1F7A4D): アップロード成功後の「URL をコピー」ボタン、コピー成功フィードバック（`.copy-feedback`）、一覧の「コピーしました」テキスト（`.text-button--copied`）のみ。それ以外の UI 要素に使わない。

### Neutral

- **Office Ground** (#EEF0F2 / `--bg`): ページ地、composer のドラッグ中背景、ゴーストボタン背景、読み取り専用入力背景
- **Copy Paper** (#FFFFFF / `--raised`, `--well`): ヘッダー、composer 本文ウェル、入力・セグメント・行カード・展開カードの面
- **Rule Line** (#D3D6DB / `--line`): 罫線、入力枠、チップ枠、テキスト選択背景（`::selection`）
- **Office Ink** (#1A1D21 / `--text`): 本文・見出し・リンク・プライマリボタン背景・フォーカスリング・セグメント選択状態
- **Muted Label** (#5B6169 / `--muted`): 補助ラベル、ログアウト、テキストボタン、プレースホルダー、空状態・警告文
- **Alert Red** (#B42318 / `--danger`): エラーメッセージ、削除ボタン、期限切れメタ
- **Expired Wash** (#FBF3F2 / `--danger-soft`): 期限切れ行の背景

### Named Rules

**The Emerald-Only Rule.** エメラルドはコピー成功の瞬間だけ。リンク色・アクセント・選択ハイライト・フォーカスには使わない。選択色は `var(--line)`。

**The No Accent Blue Rule.** ラベンダー、旧ブルー #0B5FFF、およびそれに類する鮮やかな補色アクセントは使わない。インタラクティブ要素は墨と罫で足りる。

## Typography

**Display Font:** Hiragino Sans（Hiragino Kaku Gothic ProN, Yu Gothic UI, Noto Sans JP, sans-serif）
**Body Font:** 同上（単一スタック）
**Label/Mono Font:** ui-monospace（`code` 要素のみ）

**Character:** 日本語 UI フォントの実務的な組み合わせ。装飾はなく、ウェイトとサイズの差だけで階層を作る。英数字の slug は等幅で読む。

### Hierarchy

- **Display** (700, 1.25rem, 1.5): ページ見出し（h1）。404 など例外画面のみ
- **Headline** (600, 0.95rem, 1.5): セクション見出し（h2、例: My Pages）
- **Title** (600, 0.88rem, 1.5): 行の slug（page-row h3）、展開カード見出し
- **Body** (400–500, 1rem / 0.875rem, 1.5): 本文、composer 案内、メッセージ。コンテナ最大 45rem（約 65–72ch）
- **Label** (600, 0.85rem, 1.5): フィールドラベル、details summary
- **Action** (400–600, 0.8rem, 1.5): 一覧のテキストボタン、メタ行（0.75rem）

### Named Rules

**The Keigo Rule.** UI 文言は簡潔な日本語の敬体（「〜です」「〜してください」）。用語は slug・保存期間・30日・無期限・閲覧 URL・My Pages・再アップロードで統一する。

**The No Kicker Rule.** 画面上部やセクション直前に装飾用小見出し（kicker / eyebrow）を置かない。見出しは h1/h2 のみ。

## Layout

単一カラム、中央寄せ、最大幅 45rem（720px）。ヘッダーは全幅の細い帯（高さ 3rem）、メインは上下 1.75rem / 4rem の余白。

縦の流れ: ヘッダー → composer（本文ウェル）→ details（slug、初期は閉）→ ツールバー（保存期間セグメント + アップロード）→ 展開カード（成功時）→ My Pages セクション（上マージン 2.25rem）。

一覧行は 2 カラム grid（slug + アクション）。40rem 以下では 1 カラムに積み、ツールバーのアップロードボタンは全幅。

## Elevation & Depth

影は composer ウェルだけが持つ（`0 8px 20px rgba(26, 29, 33, 0.08)`）。それ以外は罫線と面色の差で層を示す。展開カードは罫のみ、入場時に短い translateY アニメーション。

### Shadow Vocabulary

- **Composer lift** (`0 8px 20px rgba(26, 29, 33, 0.08)`): 本文ウェル（`.composer`）のみ。画面の主役を浮かせる

### Named Rules

**The Flat-By-Default Rule.** カード・行・入力は平面。影は composer ウェルに限定し、ホバーで影を足さない。

## Shapes

角丸は 10px（composer）と 6px（ボタン・入力・セグメント・行・展開カード）の二段。ファイルチップは pill（999px）。composer は墨 1px の実線枠（罫色ではない）で「書く場所」を強調する。

入力は全幅、6px 角、罫 1px。セグメントは外枠 1px で内包し、選択肢は墨塗りの反転表示。

## Components

### Header

- **Shape:** 全幅、下罫 1px、高さ 3rem
- **Background:** 紙（`--raised`）
- **Logo:** 📦 okibasho、太字、リンク色は inherit（ホバーで色変化なし）
- **Logout:** テキストボタン、muted → ink on hover

### Composer（本文ウェル）

- **Shape:** 10px 角、墨 1px 枠、min-height 12.5rem（モバイル 10rem）
- **Background:** 紙（`--well`）。ドラッグ中は地（`--bg`）
- **Shadow:** composer lift
- **Content:** 中央寄せ。案内文（500）、ファイルチップ列、ゴースト選択ボタン2つ

### Toolbar

- **Retention segment:** 30日 / 無期限。再アップロード時は非表示
- **Upload button:** プライマリ（墨）、右端（`margin-left: auto`）。モバイルは全幅

### Slug details

- **Summary:** 「URL を指定する（任意）」— 初期は閉じる。再アップロードで開き、slug は readOnly
- **Hint:** 空欄なら自動生成。再アップロードでは「URL は変わりません」

### Buttons

- **Primary:** 墨背景・地色文字、6px 角、600、hover は brightness(1.08)
- **Ghost / Secondary:** 地背景・墨文字・罫 1px、hover は紙背景
- **Copy:** エメラルド背景・#f4f7f5 文字、hover #19653f
- **Danger:** 赤背景（一覧では text-button--danger）
- **Text button:** 枠なし、0.8rem、muted → ink。コピー成功時 emerald + 600

### Unfurl（展開カード）

- **When:** アップロード成功（`phase === 'success'`）のみ
- **Shape:** 8px 角、罫 1px、紙背景
- **Content:** slug 見出し、URL リンク、コピーフィードバック、エメラルドのコピーボタン
- **Motion:** unfurl-in 280ms cubic-bezier(0.16, 1, 0.3, 1)

### My Pages 行

- **Shape:** 8px 角、罫 1px、密な padding（0.55rem 0.75rem）
- **Grid:** slug + メタ | アクション列
- **Expired:** danger-soft 背景、メタは danger 色
- **Actions:** コピー / 再アップロード / 保存期間切替 / 削除（テキストボタン）

### Inputs

- **Style:** 全幅、罫 1px、6px 角、紙背景
- **Focus:** 墨 2px outline（グローバル `:focus-visible`）
- **Read-only:** 地背景（再アップロード slug）

## Do's and Don'ts

### Do:

- **Do** ドロップゾーン（composer）を画面の最大要素として扱う
- **Do** slug を `<details class="field--details">` の「URL を指定する（任意）」に置き、初期は閉じる
- **Do** 保存期間（30日/無期限）とアップロードを composer 直下のツールバーに置く
- **Do** コピー成功だけエメラルド（#1F7A4D）を使う
- **Do** フォーカスを墨 2px リング（`outline: 2px solid var(--text); outline-offset: 2px`）で示す
- **Do** テキスト選択を罫色（`background: var(--line)`）にする
- **Do** 一覧を密な行（page-row）で、テキストボタンで操作する
- **Do** 日本語敬体で、簡潔な文言にする

### Don't:

- **Don't** キッカー（eyebrow / 装飾ラベル）を使う
- **Don't** ラベンダー・旧ブルー #0B5FFF・鮮やかな補色アクセントを使う
- **Don't** エメラルドをリンク色・選択色・一般アクセントに使う
- **Don't** slug をツールバーに置く
- **Don't** 展開カードを成功以外（アップロード前・エラー時）に表示する
- **Don't** ダッシュボード風の多列レイアウト・マーケティング的なヒーローを作る
- **Don't** MVP 外の概念（チーム、履歴、公開設定など）を UI に予告する
