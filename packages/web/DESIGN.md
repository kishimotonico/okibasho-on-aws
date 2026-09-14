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

操作の主役は composer（白いウェル全体）。中央の開いた箱がブランドマークであり、「ここにドロップして公開」のアフォーダンスであり、状態のフィードバックでもある。ファイルまたはフォルダをドロップ、箱をクリック、または案内直下のテキストリンクで選ぶと、その時点の slug と保存期間で即アップロードが始まる。送信 CTA はない。ウィンドウにファイルを持ち込んだときは画面全体を墨系の薄いオーバーレイで沈め、composer をその上に残す。composer が画面外のときだけオーバーレイ中央に「上のフォームにドロップ」を出す。成功すると箱の直下に公開 URL（リンク）とコピー・削除が残り、下の「アップロード済みページ」の該当行が数秒ハイライトされる。

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
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`（`code` 要素のみ。`ui-monospace` 未対応環境向けの標準的なフォールバック）

**Character:** 日本語 UI フォントの実務的な組み合わせ。装飾はなく、ウェイトとサイズの差だけで階層を作る。英数字の slug は等幅で読む。

### Hierarchy

- **Display** (700, 1.25rem, 1.5): ページ見出し（h1）。404 など例外画面のみ
- **Headline** (600, 0.95rem, 1.5): セクション見出し（h2、「アップロード済みページ」）
- **Title** (600, 0.88–0.95rem, 1.5): 行の slug（page-row h3）、成功結果の URL
- **Body** (400–500, 1rem / 0.875rem, 1.5): 本文、composer 案内、メッセージ。コンテナ最大 45rem
- **Label** (600, 0.85–0.875rem, 1.5): フィールドラベル（公開URL、保存期間。visually-hidden 可）
- **Action** (400–600, 0.75–0.875rem, 1.5): メタ行、テキストリンク（ファイルを選ぶ · フォルダを選ぶ）

### Named Rules

**The Keigo Rule.** UI 文言は簡潔な日本語の敬体（「〜です」「〜してください」）。用語は slug・保存期間・30日・無期限・公開URL・アップロード済みページ・フォルダ・再アップロードで揃える。

**The No Kicker Rule.** 画面上部やセクション直前に装飾用小見出し（kicker / eyebrow）を置かない。見出しは h1/h2 のみ。

## Layout

単一カラム、中央寄せ、最大幅 45rem（720px）。ヘッダー帯はない。ログアウトは右上の小さなユーティリティメニュー。メインは上下 1.75rem / 4rem の余白。狭い画面ではメニューと重ならないよう上余白を足す。

縦の流れ: composer（箱と案内 → ファイルを選ぶ · フォルダを選ぶ → 公開URL → 保存期間）→ アップロード済みページ。成功中は箱の下に結果ブロックと「次のファイルを置く」だけを表示し、案内・slug・保存期間・ファイル選択リンクは隠す。

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

- **Placement:** 画面右上の固定。アップロード UI より目立たせない。40rem 以下では固定をやめてページ最上部に通常配置（スクロールで流れる）にし、composer との重なりを避ける
- **Trigger:** `CircleUser` の icon button。hover では開かない
- **Menu:** いまはログアウトのみ。項目を足せる構造。Esc・外側クリック・矢印キー、閉じたらトリガーへフォーカス復帰
- **Tooltip:** hover と focus-visible の両方。操作自体は hover 前提にしない

### Tooltip（浮遊要素）

- **Arrow:** Radix の `Arrow` は使わない。本体と同じ背景色・border を持つ回転させた正方形を本体の背後に敷き、本体側の辺を本体の塗りで隠すことで、四角と矢印の継ぎ目の線が見えないようにする
- **Utility menu のトリガー等:** hover と focus-visible の両方で開く
- **slug 入力（クリックして名前を付け直せる）:** Radix の内部制御には任せず、`pointerenter` / `pointerleave` のみで開閉する自前管理。フォーカス（マウス・キーボードとも）では開かない。アップロード開始・成功・箱の吹き出し表示など状態が変わったときも閉じる。位置は入力の中央上

### Composer（本文ウェル）

- **Shape:** 10px 角、罫 1px、composer lift
- **Drop:** 白いウェル全体がドロップ領域。ウィンドウにファイルを持ち込んだときは画面全体を墨系の薄いオーバーレイ（`pointer-events: none`、例: `color-mix(in srgb, var(--text) 35%, transparent)`）で一覧を沈め、composer を z-index でその上に残す。composer は白い紙地のまま、エメラルド 2px 相当の box-shadow リングで強調する（ドロップ受付の合図としてエメラルドを例外的に使う）。画面全体の案内文は出さない。composer が画面外のときだけオーバーレイ中央に小さく「上のフォームにドロップ」（0.875rem、紙に近い色）。箱アイコンは dragging。slug 入力からのテキストドラッグには反応しない。ウィンドウ外へ出したとき（`dragleave` の `relatedTarget` が null）、Esc で中断したとき、`dragend` / `drop` / `window` の `blur`、または数秒 `dragover` が来なければ強調を外す
- **Brand:** 中央に箱アイコン（概ね 96px）と `okibasho` を一度だけ
- **Immediate upload:** ドロップまたはファイル選択で即アップロード。送信 CTA はない
- **Pick links:** 案内文の直下にテキストリンク「ファイルを選ぶ · フォルダを選ぶ」。初期・ドラッグの状態で表示する。`button.text-link` は appearance:none のテキストリンク（下線・muted）。箱クリックでもファイル選択できる。成功状態では表示しない（Success result 参照）

### 公開URL

- **Label:** 公開URL（visually-hidden 可）
- **Structure:** ホスト + `/ユーザー名/` + slug 入力を一体表示。狭い画面（40rem 以下）ではホストを非表示にし、`/ユーザー名/` と slug を1行にする
- **Initial slug:** 初期表示から `generateRandomSlug`（小文字英数字 10 文字）を入れる。必要ならその場で編集する
- **Edit:** 一体の枠。フォーカスで全選択（フォーカス直後 1 回だけ `mouseup` を打ち消し、クリックで選択が解除されないようにする）。Esc でフォーカス時の値へ戻す。入力中バリデーション。Tooltip「クリックして名前を付け直せる」（紙地・矢印、入力の中央上）
- **Invalid slug:** 「使えるのは小文字の英数字と - _ だけ」。不正な間は吹き出しを消さない
- **Empty:** 空欄で進めようとすると新しい slug を入れ直してから続行する（送信ボタンによる省略自動生成ではない）
- **Overwrite highlight:** 上書き確認中は slug 枠を danger 系で強調（`url-input--overwrite`：枠・背景・prefix を `--danger-soft` 寄り）
- **Reupload:** 一覧の kebab「再アップロード」は成功状態からでもフォームへ戻し、slug を入れて入力へフォーカスし、フォームまでスクロールするだけ。保存期間は常に表示する。既存 slug への差し替えは吹き出し確認。slug を変えれば別ページとして扱う

### 保存期間

- **Label:** 保存期間（visually-hidden 可）
- **Control:** ウェル内の 30日 / 無期限セグメント。デフォルトは 30日。選択は薄い墨

### Success result

- **When:** アップロード成功。「次のファイルを置く」を押すまで残す。モーダル・トーストは使わない。連続アップロードはしない（成功中はドロップ・ファイル選択・ドラッグ演出を受け付けない）
- **Placement:** 箱の直下（案内文・slug 入力・保存期間・ファイル選択リンクはすべて隠す）
- **Content:** `UrlField`（URL とコピーが一体の表示部品。詳細は後述）、その下の操作列に「社外共有…」（`text-link`。削除アイコンと並べる、控えめな副次操作）と Trash（一覧と同じ `ConfirmAlertDialog`）
- **箱の吹き出し:** アップロード成功時、箱から `success` 種別の吹き出し（emerald 系。「公開しました」）を出す。挙動は Box bubble の `info` と同じ（6 秒自動消去・クリックで閉じる）
- **次のファイルを置く:** 結果の下に第二階層の見た目のボタン（`button--ghost`。エメラルドではない）。押すとフォームを初期状態（乱数 slug・30日・案内文・選択リンク）に戻し、箱も idle に戻す
- **社外共有…:** クリックすると、今アップロードしたページの `ShareDialog` を開く。開閉は route（`routes/index.tsx`）が一元管理し、一覧の kebab から開いた場合と同じ経路・同じ一覧更新（`router.invalidate`）を使う。すでに社外共有中のページを再アップロードしたときも同じボタンで今の設定を開ける
- **Delete:** AlertDialog で確認してから削除。消したページの slug がフォームに残っていれば乱数に戻す。そのページの成功結果が出ていれば初期状態（フォーム表示）に戻す。一覧から消したときも同じ
- **Reupload:** 一覧の kebab「再アップロード」は成功状態からでもフォームへ戻す

### Box bubble（箱の吹き出し）

- **Role:** バリデーションエラー、アップロード失敗、新規アップロード時の既存 slug 上書き確認、アップロード成功の案内を箱の下に表示する。ページ上部のインラインや `window.confirm` は使わない
- **Placement:** 箱アイコンの直下に `position: absolute` で重ねて表示する（通常フローには置かない）。ブランド名や案内文にかぶってよい。三角形のしっぽは中央
- **Kinds:** `error`（danger 地・シェイクと同時）、`confirm`（上書き確認。紙地）、`success`（アップロード成功。emerald-soft 地。DESIGN のエメラルドは箱アイコンと成功フィードバックにだけ使う原則に合致させた種別）
- **Overwrite:** 新規アップロードで既存 slug にぶつかったときだけ。「差し替える」「やめる」。保存期間は変わらない旨を短く示す
- **Dismiss:** × ボタンは持たない。`error` / `success` は吹き出し自体のクリック（`cursor: pointer`）で閉じる。`confirm` は「差し替える」「やめる」でのみ閉じる。`error` / `success` は 6 秒で自動消去（`persist` と confirm とホバー中は消さない）。確認待ち中は2回目のドロップを無視する
- **Motion:** 開閉は `opacity` のフェードのみ（高さのアニメーションはしない）。absolute 重ねのため開閉で下の要素は動かない。reduced-motion では即時
- **本文の余白:** 本文（ボタン行がある `confirm` も含む）に対して上下左右が均等になるようパディングを揃える

### ShareDialog（社外共有）

- **Role:** 社外の人に渡す別URL（`/s/<share-id>/`）の発行・設定変更・再発行・停止。一覧の kebab、または成功結果ブロックの「社外共有…」から開く（開閉は route が一元管理）。社内URL（`/p/`）はそのまま使えることを最初の説明文で伝える
- **Shape:** Radix Dialog を AlertDialog と同じトークンで装飾（`ui-dialog`）。確認が要る操作（再発行・停止）は入れ子で AlertDialog（`ui-alert`）を重ねる。z-index は `ui-dialog` を `ui-alert` より低くし、確認ダイアログが必ず最前面に来るようにする
- **Close:** ヘッダー右上に lucide `X` の icon button（aria-label・Tooltip とも「閉じる」）。フッターにテキストの「閉じる」は置かない。Esc・外側クリックでも閉じる（Radix の既定）
- **未発行:** 保護方法のチェックボックス「パスワード（Basic認証）」「IPアドレス制限」。どちらも外すと「URLを知っている人なら誰でも見られます」を field-hint で明示。主ボタンは「共有URLを発行」
- **発行済み:** タイトル直下に `UrlField`（URL とコピーを一体にした表示部品。詳細は後述）。保存期間があればその下に「保存期限（日付）を過ぎると共有も終わります」を field-hint で出す。「現在の保護方法」の要約はチェックボックスと重複するため出さない。同じ設定フォームを下に表示する
- **発行済み Basic の読み取り表示:** Basic が設定済みのまま「変更」を押していない間は、ユーザー名と伏せ字パスワード（`••••••••`。実際の文字数を反映しない固定表示）を横に並べて読み取り表示し、その横に控えめな text-link「変更」を置く。自然文の説明は付けない。「変更」を押すと編集用の入力欄（後述のパスワード自動生成と同じ見た目）に切り替わり、ユーザー名は現在値、パスワードは新しく生成した値から編集を始める。入力欄の下に text-link「取り消す」を出し、押すと編集を破棄して読み取り表示に戻る（保存されるのは「変更」を押して編集した場合だけ）
- **パスワードの自動生成:** 新しく Basic をオンにしたとき（未共有で発行する、または共有中で Basic が無かったところにオンにする）、または発行済みの Basic を「変更」したときは、`generateSharePassword`（`@cli/page`）で生成した約80bitのパスワードを欄に最初から入れ、伏せ字にせず平文（等幅フォント）で表示する。欄の右に「再生成」（`RefreshCw` の icon button + Tooltip）を置く（コピーは完了画面で行えるため、編集中の欄にはコピーボタンを置かない）。ユーザーは自由に書き換えられる（書き換えても既存の検証をかける）
- **完了画面:** 未発行から発行した場合、または発行済みの設定を保存して今回パスワードを新しく設定した場合は、発行・保存の成功後にダイアログの中身を完了画面へ丸ごと差し替える。× での閉じ方はそのまま。タイトルは未発行からの発行なら「共有URLを発行しました」、発行済みの保存なら「設定を保存しました」。パスワードを変えなかった保存（保護なしの変更、CIDR だけの変更）は完了画面へ切り替えず、これまでどおりフォームにとどまり field-hint で反映遅延を案内する
  - **中身:** `UrlField`、保存期限があれば field-hint、パスワードを新しく設定した場合だけユーザー名・パスワード（パスワードは等幅・読み取り専用表示、個別コピーの icon button 付き）と「パスワードはこの画面を閉じると再表示できません」、常に「反映まで5分ほどかかることがあります」
  - **Footer:** パスワードを新しく設定した場合だけ、右に「まとめてコピー」（`CopyButton` labeled variant。`URL: .. / ユーザー名: .. / パスワード: ..` の3行テキスト）を出す。IP制限だけ・保護なしで発行した場合はフッター自体を出さない（URL は `UrlField` でコピーできる）。どちらの場合も「完了」のような閉じるボタンは置かず、閉じるのは常にヘッダー右上の × だけにする
  - **戻る導線はなし:** 完了画面から設定フォームへ戻る操作は持たない。設定を変えたいときは一覧やアップロード結果から開き直す
- **反映遅延:** 保存・再発行・停止のあとはフッター直上に field-hint で「反映まで5分ほど」系の案内を出す（パスワードを変えない保存はフォームのまま、それ以外は完了画面の中で案内する）
- **一覧への反映:** 保存が終わってから一覧を再取得し、ShareDialog はその一覧から自分の対象ページを引き直す（保存直後でも共有URLの表示が一覧と食い違わない）
- **平文の扱い:** 生成・入力したパスワードの平文は state だけに持ち、`.metadata.json` には salt 付き SHA-256 のハッシュしか保存しない。ダイアログを閉じる（`open` が false になる）と平文パスワードと完了画面の内容を state から消し、次に開いたときに残っていないようにする

### UrlField（URL とコピーの統合表示）

- **Role:** URL とコピーをひとつの枠に統合した共通表示部品（`components/UrlField.tsx`）。ShareDialog の共有URLで使う
- **Shape:** `.url-input` と同じ系統の一つの枠（罫・角丸・高さ・背景）。枠内に URL を新しいタブで開くリンクとして表示し、右端に枠と一体化したコピーの icon button（`CopyButton` の `icon` variant をそのまま使う）を置く
- **Truncation:** URL は1行。長い場合は先頭側を省略し、slug / share-id 側（末尾）が見えるようにする
- **Keyboard:** リンクとコピーボタンはそれぞれ独立にフォーカスでき、focus-visible の見た目は他の入力・ボタンと揃える

### AlertDialog（一覧の確認）

- **When:** アップロード済みページの削除と「30日に戻す」、成功結果の削除。Radix AlertDialog を DESIGN トークンで装飾
- **Not used:** 「無期限に変更」はダイアログなしで即実行
- **30日に戻す:** 作成から 30 日以上経過している場合は、即座に期限切れになる警告文をダイアログ内に出す

### アップロード済みページ

- **Heading:** 「アップロード済みページ」。フォームより弱いセクション
- **Row:** 下線だけ。主表示は slug、副表示は URL と有効期限
- **Expiration:** 日本時間の絶対日時を主表示。例: `2026/8/20 21:00 まで（あと2日）`。無期限は「無期限」。期限切れは `期限切れ（yyyy/M/d）`
- **Direct:** 「ページを開く」「URLをコピー」（icon button + tooltip + aria-label）
- **Share:** 社外共有中のページは slug の直後に小さな icon button（muted、既存の icon button より一回り小さく、slug の横で主張しない大きさ）を置く。押すとその行の ShareDialog を開く。保護なし（パスワードも IP 制限も無い）は lucide `Globe`、パスワードか IP 制限があれば `GlobeLock` にして一覧だけで保護の有無を見分けられるようにする（色は変えず形だけで区別する）。Tooltip・aria-label は保護の有無で出し分ける（「社外共有中・誰でも閲覧可」「社外共有中・パスワード / IP 制限あり」）。行の高さは共有の有無で変えない
- **Overflow:** 再アップロード / 無期限に変更（または 30日に戻す）/ 社外共有… / 削除は kebab。削除は danger
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
- **Copy:** エメラルド背景・白文字、hover はやや濃いエメラルド。lucide の `Copy` アイコン付き。コピー後は `Check` アイコン＋「コピーしました」に切り替わり、バウンス＋明るさのアニメーションのあと 2 秒で元に戻る（reduced-motion ではアニメーションなし）
- **Danger:** メニュー項目と AlertDialog の確認
- **Icon button:** 枠なし、muted → ink。コピー成功時は emerald

### Inputs

- **Style:** 全幅、罫 1px、6px 角、紙背景
- **Focus:** 墨 2px outline（グローバル `:focus-visible`）
- **Read-only:** 地背景（入力の read-only 属性がある場合）

## 依存と構成

UI 部品は radix-ui（DropdownMenu / Tooltip / AlertDialog）を DESIGN のトークンで包んで使う。アイコンは lucide-react。slug 生成と検証、メタデータ型は `@cli/page` を web から参照する。箱アイコン（`UploadBoxIcon.tsx` / `upload-box-icon.ts`）はチューナーの幾何をそのまま移植したものなので、ライブラリで置き換えない。

### ファイル構成

```
routes/index.tsx        一覧を loader で取得。route の state（composerSeed / retiredSlug /
                         highlight / actionError / shareSlug）と useOptimistic を持つ。
                         ShareDialog もここで開閉する（一覧・成功結果のどちらから開いても同じ経路）
routes/callback.tsx      Cognito のログインコールバック
components/Composer.tsx フォームの骨組み。useUploadFlow と useWindowFileDrag をつなぐ
  SlugField.tsx          公開URL。全選択・Esc・ツールチップの開閉を内包
  RetentionToggle.tsx    30日 / 無期限
  PickLinks.tsx          ファイルを選ぶ · フォルダを選ぶ（隠し input を内包）
  UploadResult.tsx       UrlField・「社外共有…」・削除（確認ダイアログ）・次のファイルを置く
  DragOverlay.tsx        ウィンドウ全体のドラッグ強調
components/PagesList.tsx 一覧。表示専用（確認ダイアログ・コピー失敗の表示だけ持つ。ShareDialog の開閉は route へ委譲）
  PageRow.tsx             一覧の1行。表示とコールバック。共有中は控えめな icon button（Globe / GlobeLock）を出し、押すと ShareDialog を開く
components/ShareDialog.tsx 社外共有の発行・設定変更・再発行・停止（Radix Dialog）。確認は AlertDialog に委譲。
                            発行・保存が成功すると完了画面に切り替わる
components/UrlField.tsx     URL とコピーを一体にした表示部品（ShareDialog / UploadResult で使う）
components/CopyButton.tsx   URLコピーの共通部品（UploadResult / PageRow / ShareDialog / UrlField で使う）
components/BoxBubble.tsx    箱の直下の吹き出し（error / confirm / success）
components/{AlertDialog,Menu,Tooltip}.tsx  radix-ui のラッパー
components/UtilityMenu.tsx  右上のログアウトメニュー
hooks/useUploadFlow.ts     アップロードの状態機械（useReducer）
hooks/useWindowFileDrag.ts ウィンドウ全体のドラッグ監視。isDragging だけ返す
hooks/useCopyToClipboard.ts クリップボードへのコピーと一時表示状態（2秒で idle に戻る）
hooks/usePagesApi.ts       認証・接続先・S3クライアント生成・エラー文言化を閉じた API
api/pages.ts               S3 を叩く純粋な非同期関数（upload / remove / setRetention など）
lib/messages.ts            画面に出す日本語の集約
lib/to-user-message.ts     エラーを画面向けの日本語にする
```

### 状態の置き場所

- **一覧データ**: `routes/index.tsx` の loader で取得し、`useOptimistic` で削除・保存期間変更を先に画面へ反映する。通信後に `router.invalidate()` で本物と入れ替える
- **route から下ろす合図**: `composerSeed`（再アップロード）・`retiredSlug`（消えたページ）・`highlight`（成功行）は `{ slug, nonce }` の値を props で Composer / PagesList へ渡す。`forwardRef` や `useImperativeHandle` は使わない
- **ShareDialog の開閉**: `shareSlug`（開いている対象の slug、または `null`）を `routes/index.tsx` が持つ。一覧の kebab「社外共有…」も成功結果の「社外共有…」も同じ `onShare(slug)` を呼ぶだけで、ShareDialog 自体の描画・`pages` からの対象ページの引き直し・保存後の `router.invalidate()` は route 側の一箇所にまとめる
- **アップロードの状態**: `useUploadFlow` が `idle / checking / confirming / uploading / success / error` の判別共用体を `useReducer` で持つ。箱の吹き出し（`bubbleOf`）と箱アイコンの phase（`iconPhaseOf`）はこの状態から導出する
- **コピーの表示**: `useCopyToClipboard` が `idle / copied / failed` を持ち、2秒で idle に戻す。`CopyButton` がこれを使い、一覧側の共通エラー表示へは `onError` / `onCopied` で伝える

## 確認と検証

- 開発サーバー: `pnpm --filter @okibasho/web dev`（http://localhost:3000。Cognito の callback に登録済み）
- 静的チェック: `pnpm --filter @okibasho/web typecheck` / `pnpm --filter @okibasho/web test` / `pnpm format:check` / `pnpm --filter @okibasho/web build`
- 実機確認はブラウザ自動操作（agent-browser など）で行い、幅 1280 と 375（`innerWidth` を実際に 375 にする）の両方を撮る
- 箱アイコン単体は `/dev/upload-box-icon` のハーネスで確認できる（dev サーバーのみ、build には含まれない）
- 本番未公開のため防衛的なテストは書かない。テストは仕様変更で意味を失ったものを消しつつ、見た目と操作の確認は実機で行う

## Do's and Don'ts

### Do:

- **Do** 白い composer ウェル全体をドロップ領域として扱う
- **Do** ウィンドウにファイルを持ち込んだときは墨系オーバーレイで周りを沈め、composer をその上に残す
- **Do** 「ファイルを選ぶ · フォルダを選ぶ」を案内文の直下に置く
- **Do** ドロップまたはファイル選択で即アップロードする（送信 CTA は置かない）
- **Do** slug を初期表示から入れ、公開URLを固定部分と slug 入力の一体 UI にする
- **Do** エラーと上書き確認を箱の吹き出しで伝える
- **Do** 一覧の削除と「30日に戻す」、成功結果の削除を AlertDialog にする
- **Do** エメラルドを箱アイコンと成功フィードバックにだけ使う
- **Do** フォーカスを墨 2px リングで示す
- **Do** 一覧をフラットな行にし、直接操作は開くとコピー、ほかは kebab にまとめる
- **Do** 日本語敬体で、フォルダ・公開URL・アップロード済みページの用語に揃える
- **Do** 成功中はフォームを隠して結果ブロックだけを見せ、「次のファイルを置く」で明示的に戻す

### Don't:

- **Don't** キッカー（eyebrow / 装飾ラベル）を使う
- **Don't** アップロード送信 CTA や「選択済みファイル」表示を置く
- **Don't** 成功中に連続アップロード（ドロップ・ファイル選択・ドラッグ演出）を受け付ける
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
