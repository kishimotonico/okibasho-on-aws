# Design System: okibasho

## Overview

**Creative North Star: "The Composer Well"（明るいコンポーザー）**

管理画面は、チャットに URL を貼る直前の下書きである。蛍光灯のオフィスで開く明るいコンポーザー。地は薄いグレー、本文は白いウェル。ダッシュボードでもマーケでも5列表でもない。

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

縦の流れ: composer（箱と案内 → ファイルを選ぶ · フォルダを選ぶ → 公開URL → 保存期間）→ アップロード済みページ。成功中は箱の下に結果ブロックだけを表示し、案内・slug・保存期間・ファイル選択リンクは隠す（「次のファイルを置く」の専用ボタンは持たず、成功状態の箱自体がその操作になる）。

40rem 以下では公開URLのホスト部分を非表示にし、`/ユーザー名/` と slug 入力を1行に収める。保存期間・公開範囲のチップ列や結果ブロックの折り返しは各コンポーネントの節（UploadOptions、Success result）を参照。一覧行は常に情報・操作の2カラム（縦には積まない）。

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

- **Arrow:** Radix の `Arrow` は使わない。本体と同じ背景色を持つ回転させた正方形を本体の背後に敷き、本体からはみ出して見える2辺だけに border を付ける（本体側を向く2辺には border を付けない）ことで、四角と矢印の継ぎ目に二重線が出ないようにする。影も本体の box-shadow ではなく `filter: drop-shadow` を本体に掛け、本体＋矢印をまとめたシルエットに影を落とす
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
- **Focus:** 墨 2px の枠は編集できる slug 入力の内側だけに出す（`box-shadow: inset` で入力自身に付け、outline は使わない）。ホスト・`/ユーザー名/` の固定部分は囲わない。入力の角丸は、隣に固定部分や再アップロードの表示があるかどうかで一体枠の内側の角丸（5px）に自動で揃う
- **Invalid slug:** 「使えるのは小文字の英数字と - _ だけ」。不正な間は吹き出しを消さない
- **Empty:** 空欄で進めようとすると新しい slug を入れ直してから続行する（送信ボタンによる省略自動生成ではない）
- **Overwrite highlight:** 上書き確認中は slug 枠を danger 系で強調（`url-input--overwrite`：枠・背景・prefix を `--danger-soft` 寄り）。フォーカスの墨リングとは独立で、両方が同時に出ても崩れない
- **Reupload indicator:** slug が一覧の既存ページの slug と一致している間（一覧の「再アップロード」で入った場合も、手入力で一致した場合も）、一体枠の右端・入力の内側に muted な小さいラベル「再アップロード」（0.75rem。エメラルドや danger は使わない）と、新規アップロードに戻す × の icon button（aria-label・Tooltip とも「新規アップロードにする」）を出す。× を押すと slug を `generateRandomSlug()` に戻し、保存期間・公開範囲・パスワードも「次のファイルを置く」と同じ初期状態にまとめて戻してから、入力へフォーカスする（乱数 slug だけ変えて外部公開設定が別ページのものとして残ると誤って公開してしまうため）。busy（アップロード中）の間は出さない
- **Reupload（一覧からの遷移）:** 一覧の kebab「再アップロード」は成功状態からでもフォームへ戻し、slug を入れて入力へフォーカスし、フォームまでスクロールするだけ。保存期間は常に表示する。既存 slug への差し替えは吹き出し確認。slug を変えれば別ページとして扱う（そのときは上の Reupload indicator も自然に消える）

### UploadOptions（保存期間・公開範囲・パスワードのチップ列）

- **Role:** 公開URL（slug 入力）の直下に、保存期間・公開範囲・（外部かつ未ロック時のみ）パスワードのチップを横一列に並べる（`components/UploadOptions.tsx`）。チップは「もう設定済みの値」に見える閉じた表示で、押すとポップオーバーから選ぶ
- **保存期間チップ:** lucide `Clock` + 現在値（30日 / 無期限）+ `ChevronDown`。押すと radix-ui `DropdownMenu`（`RadioGroup` / `RadioItem`）のポップオーバーで選ぶ。デフォルトは 30日
- **公開範囲チップ:** 内部のみは `Users`、外部にも公開は `Globe` + 現在値 + `ChevronDown`。同じ `DropdownMenu` の `RadioGroup` で選ぶ。デフォルトは内部のみ
- **ポップオーバーの位置:** `align="start"` + 小さめの `sideOffset` で、チップの左端・直下にぴったり揃える（チップの中央や右にずれない）。選択中の項目は `DropdownMenu.ItemIndicator` の `Check` で示す
- **パスワードチップ:** 公開範囲が「外部にも公開」かつ未ロックのときだけ出す。共通部品 `components/PasswordToggle.tsx`（後述）を使う。オンにしたときだけ `generateSharePassword` で自動生成したパスワードを付ける（ユーザー名は `guest` 固定）。あとで一覧の共有ダイアログから確認・付け外しできる
- **外部共有中のページへの差し替え:** 対象 slug が既に外部共有中なら、公開範囲チップは選択肢を出さず `Globe` + 「外部共有中」の disabled チップに固定し、Tooltip で「設定はそのまま」を補う。パスワードチップは出さない。差し替えても既存の共有URL・パスワードを維持する
- **リセット:** 箱をクリックしてフォームを初期状態に戻すと内部のみ・パスワードなしに戻る。一覧の「再アップロード」（seed）では保存期間と同様にリセットしない
- **375px 幅:** セグメントのように全幅化せず `flex-wrap` で折り返すだけなので、縦の伸びが小さい

### PasswordToggle（パスワードのオン/オフ）

- **Role:** パスワード保護のオン/オフを、文字とアイコンの両方で示す共通トグル（`components/PasswordToggle.tsx`）。UploadOptions のパスワードチップと ShareDialog の両方から使う（フォームとダイアログでアイコン・見た目を共通化する）
- **オフ:** lucide `LockOpen` + 「パスワードなし」。罫線だけの控えめなチップ、muted 文字
- **オン:** lucide `Lock` + 「パスワードあり」。セグメントの選択と同じ薄い墨の塗り（`color-mix(in srgb, var(--text) 8%, var(--well))`）+ 墨文字 + 600。エメラルドは使わない
- **A11y:** `aria-pressed` のトグルボタン

### Success result

- **When:** アップロード成功。箱をクリック（または Enter/Space）して開くまで残す。モーダル・トーストは使わない。連続アップロードはしない（成功中はドロップ・ファイル選択・ドラッグ演出を受け付けない）
- **Placement:** 箱の直下（案内文・slug 入力・保存期間・ファイル選択リンクはすべて隠す）
- **Content（1行レイアウト）:** `UrlField`（URL とコピーが一体の表示部品。詳細は後述、伸縮）・「外部共有…」（`button--ghost`。globe アイコン付き）・Trash（一覧と同じ `ConfirmAlertDialog`）を高さ（2.25rem 前後）・角丸 6px・罫線をそろえて1行にまとめ、ひとまとまりに見せる（`upload-result__row`。Trash にも罫 1px の枠を付けて外部共有ボタンと揃える）。40rem 以下では URL 枠が1行目、外部共有・削除が2行目右寄せに回る。ボタン「次のファイルを置く」は持たない（廃止。下記参照）
- **箱の吹き出し:** アップロード成功時、箱から `success` 種別の吹き出し（emerald 系。「公開しました」＋小さなコピーアイコン）を出す。クリックで今アップロードした公開URLをコピーする（挙動は Box bubble 参照）
- **次のファイルを置く（箱そのものが導線）:** 専用の `button--ghost`（`upload-result__another`）は廃止した。成功状態の箱自体が「次のファイルを置く」の操作になる。箱にマウスを乗せると外側のフラップ2枚が少し開きかけ（`closedOuter` を 1 から 0.82 へ寄せる）、`Tooltip` で「次のファイルを置く」を出す。箱は `role="button"` / `aria-label="次のファイルを置く"` / `tabIndex=0` / `cursor: pointer` を持ち、クリックまたは Enter/Space で箱がヨー回転（`spinMs` 900ms）しながら蓋が開く（成功アニメーションの逆再生: `closed` が 1→0、紙が戻って現れ、床の円の塗りと `--emerald` の線が元に戻る）。終わったらフォーム を初期状態（乱数 slug・30日・内部のみ・パスワード無し・`flow.reset()`）に戻す。reduced-motion では回転・演出なしで即時にフォームへ戻る。uploading 中の箱クリックは無効、開くアニメーション中の二度押しは無視する。詳細は下記 Box icon 参照
- **外部共有…:** クリックすると、今アップロードしたページの `ShareDialog` を開く。開閉は route（`routes/index.tsx`）が一元管理し、一覧の kebab から開いた場合と同じ経路・同じ一覧反映（書き込んだ内容で該当行を差し替え）を使う。すでに外部共有中のページを再アップロードしたときも同じボタンで今の設定を開ける
- **外部公開を今回新しく選んだとき:** 結果ブロックの表示に加えて、`ShareDialog` を自動で開く（アップロード結果の metadata に share を含めて一覧へ差し込んでから開くので、開いた瞬間から一覧と一致し、発行済みの表示で始まる。パスワードを付けていれば共有URL・ユーザー名・パスワードが、付けていなければ共有URLだけがすでに見える）。閉じるのは通常どおり右上の×だけ
- **Delete:** AlertDialog で確認してから削除。消したページの slug がフォームに残っていれば乱数に戻す。そのページの成功結果が出ていれば初期状態（フォーム表示）に戻す。一覧から消したときも同じ
- **Reupload:** 一覧の kebab「再アップロード」は成功状態からでもフォームへ戻す

### Box bubble（箱の吹き出し）

- **Role:** バリデーションエラー、アップロード失敗、新規アップロード時の既存 slug 上書き確認、アップロード成功の案内を箱の下に表示する。ページ上部のインラインや `window.confirm` は使わない
- **Placement:** 箱アイコンの直下に `position: absolute` で重ねて表示する（通常フローには置かない）。ブランド名や案内文にかぶってよい。三角形のしっぽは中央
- **Kinds:** `error`（danger 地・シェイクと同時）、`confirm`（上書き確認。紙地）、`success`（アップロード成功。emerald-soft 地。DESIGN のエメラルドは箱アイコンと成功フィードバックにだけ使う原則に合致させた種別）
- **Overwrite:** 新規アップロードで既存 slug にぶつかったときだけ。「差し替える」「やめる」。保存期間は変わらない旨を短く示す
- **success のコピー操作:** 「公開しました」の右に小さな lucide `Copy` アイコン（1.1rem 前後、`currentColor`）を添える。吹き出し自体のクリック（または Enter/Space。`tabIndex=0`）で、今アップロードした公開URLをクリップボードへコピーする。成功したら一瞬 `Check` アイコン＋「コピーしました」に切り替えてからフェードで閉じる（700ms 前後。文言では説明せず形で示す）。失敗したら「URL のコピーに失敗しました」を表示したまま通常の自動消去（6秒）に任せる（`UrlField` / `CopyButton` と同じ失敗表現に寄せる）。説明テキスト（「クリックでコピー」等）は本文に足さず、`aria-label` で支援技術に伝える
- **Dismiss:** × ボタンは持たない。`error` / コピーを持たない `success` は吹き出し自体のクリック（`cursor: pointer`）で閉じる。コピーを持つ `success` はクリックでコピーしてから閉じる（上記）。`confirm` は「差し替える」「やめる」でのみ閉じる。`error` / `success` は 6 秒で自動消去（`persist` と confirm とホバー中は消さない）。確認待ち中は2回目のドロップを無視する
- **Motion:** 開閉は `opacity` のフェードのみ（高さのアニメーションはしない）。absolute 重ねのため開閉で下の要素は動かない。reduced-motion では即時
- **本文の余白:** 本文（ボタン行がある `confirm` も含む）に対して上下左右が均等になるようパディングを揃える

### ShareDialog（外部共有）

- **Role:** 外部の人に渡す別URL（`/s/<tag><share-id>/`）の発行・作り直し・停止。一覧の kebab、または成功結果ブロックの「外部共有…」から開く（開閉は route が一元管理）。内部URL（`/p/`）はそのまま使えることを最初の説明文で伝える
- **Shape:** Radix Dialog を AlertDialog と同じトークンで装飾（`ui-dialog`）。パディングはゆったり（`1.3rem 1.4rem 1.4rem`）。確認が要る操作（作り直す・停止）は入れ子で AlertDialog（`ui-alert`）を重ねる。z-index は `ui-dialog` を `ui-alert` より低くし、確認ダイアログが必ず最前面に来るようにする
- **Close:** ヘッダー右上に lucide `X` の icon button（aria-label・Tooltip とも「閉じる」）。フッターにテキストの「閉じる」は置かない。Esc・外側クリックでも閉じる（Radix の既定）
- **未発行:** 説明文は「外部向けの別URLを発行します。内部URLはそのまま使えます。」の二文に短縮。主ボタンは「共有URLを発行」。入力欄は持たない。この時点ではパスワードは付けない（秘匿URLだけで発行する）
- **発行済み:** タイトル直下に `UrlField`（URL とコピーを一体にした表示部品。詳細は後述）。保存期限があればその直下に小さな meta 行（lucide `Clock` 12px + 「2026/10/15 21:00 まで」。無期限のときは出さない）。「保存期限（日付）を過ぎると共有も終わります」のような長い文は出さない
- **パスワードのオン/オフ:** `components/PasswordToggle.tsx`（UploadOptions と共通部品）を使う。オフのままなら秘匿URLだけでも保護になる旨のヒント文は出さない（チップの「パスワードなし」表示自体が状態を伝える）
- **オンのときの表示:** `--bg` 地・角丸 8px の `password-panel` ブロックの中に、オンにした瞬間にシステムが自動生成したパスワードとユーザー名（`guest` 固定）を常に平文（等幅フォント）で読み取り表示する。ユーザー名・パスワードそれぞれに個別コピーの icon button を添える。オフに戻すとパスワードを外して保存し、表示も消える。「最初の1回だけ表示」の完了画面は持たない
- **フッター:** 「作り直す」「共有を停止」（`text-link` / `text-link--danger`）と、パスワードを付けているときだけ右に「まとめてコピー」（`CopyButton` labeled variant。`URL: .. / ユーザー名: .. / パスワード: ..` の3行テキスト）を置く。付けていないときは URL 単体のコピーで足りるため出さない。直前の要素との間隔を他の要素間より広く取り、フッターだと一目で分かるようにする
- **作り直す:** 新しい share-id を発行する操作。パスワードを付けている場合は、それも同時に作り直す（付けていなければ付けないまま）。確認ダイアログを経て実行し、成功すると新しい URL（・パスワード）がそのまま表示に反映される
- **反映遅延:** 外部共有 URL は発行してから開けるようになるまで数秒のラグがあり、すぐ開くと 404 になる。発行・作り直しの直後（アップロード直後の自動オープンで発行済みのときも含む）は URL の直下に muted な1行「開けるようになるまで数秒かかることがあります。」を、停止の直後は同じ位置に「無効になるまで数秒かかることがあります。」を出す（エメラルドの帯にはしない）。アップロード直後の自動オープンで発行直後だと分かるよう、route から `justIssued` prop を渡す
- **要素間の余白:** URL 枠・保存期限のメタ行・パスワードのトグル・パスワードのブロック・エラーや注意書きは、区切り線を使わず余白だけで一定のリズムに揃える
- **一覧への反映:** 保存が終わったら、書き込んだ内容（API の戻り値）で一覧の該当行を直接差し替える（一覧全体は取り直さない）。ShareDialog はその一覧から自分の対象ページを引き直す（保存直後でも共有URL・パスワードの表示が一覧と食い違わない）
- **パスワードの扱い:** パスワードは任意で、秘匿URL（share-id）だけでも共有として成立する上での追加の保護という位置付け。metadata は所有者本人しか読めない IAM 境界の内側にあるため、付けたパスワードはハッシュ化・salt を行わず平文で保存する。ダイアログはその平文をいつでも読み取り表示・コピーでき、閉じても再表示できなくなることはない

### UrlField（URL とコピーの統合表示）

- **Role:** URL とコピーをひとつの枠に統合した共通表示部品（`components/UrlField.tsx`）。ShareDialog の共有URLと、成功結果ブロック（UploadResult）の1行レイアウトで使う
- **Shape:** `.url-input` と同じ系統の一つの枠（罫・角丸・高さ・背景）。枠内に URL を新しいタブで開くリンクとして表示し、右端に枠と一体化したコピーの icon button（`CopyButton` の `icon` variant をそのまま使う）を置く
- **Truncation:** URL は1行。長い場合は先頭側を省略し、slug / share-id 側（末尾）が見えるようにする
- **Keyboard:** リンクとコピーボタンはそれぞれ独立にフォーカスでき、focus-visible の見た目は他の入力・ボタンと揃える

### AlertDialog（一覧の確認）

- **When:** アップロード済みページの削除と「30日に戻す」、成功結果の削除。Radix AlertDialog を DESIGN トークンで装飾
- **Not used:** 「無期限に変更」はダイアログなしで即実行

### アップロード済みページ

- **Heading:** 「アップロード済みページ」。フォームより弱いセクション
- **Row:** 下線だけ。主表示は slug、副表示は URL と有効期限。行の上下 padding（0.7rem）は対称。副表示（URL・有効期限）は margin-top: 0.15rem / margin-bottom: 0 で、上より下の余白が大きく見えないようにする
- **Expiration:** 日本時間の絶対日時を主表示。例: `2026/8/20 21:00 まで（あと2日）`。無期限は「無期限」。期限切れは `期限切れ（yyyy/M/d）`
- **Direct:** 「ページを開く」「URLをコピー」（icon button + tooltip + aria-label）
- **Share:** 外部共有中のページは slug の直後に小さな icon button（muted、既存の icon button より一回り小さく、slug の横で主張しない大きさ）を置く。押すとその行の ShareDialog を開く。パスワードを付けているページは lucide `GlobeLock`（Tooltip・aria-label は「外部共有中」）、付けていないページは `Globe`（「外部共有中（パスワードなし）」）で出し分ける。行の高さは共有の有無・パスワードの有無で変えない
- **Overflow:** 再アップロード / 無期限に変更（または 30日に戻す）/ 外部共有… / 削除は kebab。削除は danger
- **Order:** 作成日時（`createdAt`）の新しい順。同時刻は slug 昇順
- **Highlight:** 新規は先頭に出て数秒。再アップロードは並びを変えずその行だけ。reduced-motion では色だけの静止ハイライト

### Box icon

- **Role:** ブランドマーク、ドロップのアフォーダンス、状態フィードバック（idle / hover / drag / uploading / success / error）。成功後は「次のファイルを置く」の操作でもある
- **Motion:** 幾何を rAF 1本で描く。目標に収束し時間駆動がなければループを止める
- **Error:** idle 形状へ戻る + 短いシェイクと `--danger` のフラッシュ。reduced-motion では色だけ
- **Click（idle / hover）:** クリックで回転し、ファイル選択ダイアログを開く。uploading 中は開かない。reduced-motion では回転を省略
- **成功時の蓋の色:** 閉じた蓋のフラップは常に `--well`（白）のまま。アップロード完了は床の円の緑（線 `--emerald` ＋ `rFill` の `--emerald-soft` 塗り）だけで伝える
- **success 状態のホバー:** 箱にマウスを乗せると、一番外側のフラップ2枚だけが少し開きかける。内側2枚まで開くと4枚が貫通して見えるため動かさない。ホバーを外すと元に戻る。reduced-motion では動かさない
- **success 状態のクリック:** 「次のファイルを置く」の操作。クリックまたは Enter/Space で、箱がヨー回転しながら success の完了形を逆再生し、終わったらフォームを初期状態に戻す。reduced-motion では演出なしで即時に戻す。uploading 中と、開くアニメーション中の二度押しは無効
- **アクセシビリティ:** success 状態の箱は `role="button"` / `aria-label="次のファイルを置く"` / `tabIndex=0` を持ち、既存の `Tooltip` コンポーネントで同じラベルを hover / focus-visible に出す。idle / hover / drag / uploading / error では非対話の装飾（`aria-hidden`）のまま
- **イースターエッグ（未予告）:** 何もないページ地をダブルクリックすると箱が `spin()` で1回転する（ファイル選択は開かない。uploading 中や reduced-motion では既存の `spin()` のガードでそのまま何も起きない）
- **Favicon:** idle の静的 SVG。CSS 変数は使わずライトパレットの実色を焼き込む

### LoadingShell（JS読み込み〜ハイドレーション〜認証確認のあいだ）

- **Role:** 箱は出さず、床の円（`UploadBoxIcon` と同じ位置・大きさ）の上を墨色の短い弧が回るだけの静的な画面。state・effect を持たず、prerender した `_shell.html` に焼き込む。composer・一覧の大きさと位置は本物と揃え、中身だけ一覧スケルトンと同じ視覚言語の薄いバーに置き換える。出すのは `AuthGate` の一箇所だけ（認証確認・未ログイン・`/` と `/callback` の loader 待ちを1つの状態にまとめ、同じインスタンスを出し続けることで弧が巻き戻らない）
- **ウェル:** composer は地色へ沈め、文字は muted に寄せる。本物の `Composer` がマウントした瞬間だけ、ウェル色が通常へ戻り（0.28s）、箱が床の円からせり上がる（440ms、back-ease）1回きりの CSS アニメーションを流す
- **reduced-motion:** 弧は回さず、箱は短くフェードインするだけ

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

UI 部品は radix-ui（DropdownMenu / Tooltip / AlertDialog）を DESIGN のトークンで包んで使う。アイコンは lucide-react。slug 生成と検証、メタデータ型、S3 に対するページ操作（PageStore）は `@okibasho/core` を web から参照する。箱アイコン（`UploadBoxIcon.tsx` / `upload-box-icon.ts`）は自前の幾何なので、ライブラリで置き換えない。幾何の決定値と状態ごとの目標値はコード（`BOX_ICON_PARAMS` / `target`）が正。一覧の取得・キャッシュは `@tanstack/react-query` に委ね、エラー表示の再試行は `react-error-boundary` の `ErrorBoundary` を使う。

### ファイル構成

```
routes/index.tsx        一覧の prefetch を loader で始める（await しない）。route の state
                         （composerSeed / retiredSlug / highlight / actionError / shareSlug）を持つ。
                         一覧はクエリキャッシュ（useQuery）を唯一の情報源にし、削除・保存期間変更は
                         先にキャッシュを書き換える楽観更新、アップロード・共有変更は成功後に
                         書き込んだ内容で該当行を差し替える。ShareDialog もここで開閉する
                         （一覧・成功結果・アップロード直後の自動オープンのどれでも同じ経路）
routes/__root.tsx        QueryClientProvider（lib/query-client.ts の唯一の QueryClient）を持つ
routes/callback.tsx      Cognito のログインコールバック
components/Composer.tsx フォームの骨組み。useUploadFlow と useWindowFileDrag をつなぐ。
                         公開範囲（内部のみ / 外部にも公開）と、パスワードを付けるかどうかの
                         state を持つ。外部なら id を自動生成し、パスワードを付ける場合だけ
                         あわせて自動生成する（既定はオフ）
  SlugField.tsx          公開URL。全選択・Esc・ツールチップの開閉を内包
  UploadOptions.tsx      保存期間・公開範囲・（外部かつ未ロック時のみ）パスワードのチップ列。
                         保存期間・公開範囲はチップ+DropdownMenu の RadioGroup、パスワードは
                         PasswordToggle
  PasswordToggle.tsx     パスワードのオン/オフ共通トグル（UploadOptions と ShareDialog で共通）
  PickLinks.tsx          ファイルを選ぶ · フォルダを選ぶ（隠し input を内包）
  UploadResult.tsx       UrlField・「外部共有…」・削除（確認ダイアログ）を1行にまとめる。
                         「次のファイルを置く」は箱自体の操作になったためボタンは持たない
  UploadBoxIcon.tsx      箱アイコン。success 状態では「次のファイルを置く」の
                         role="button" にもなる（onOpened で開くアニメーション完了を通知）
  DragOverlay.tsx        ウィンドウ全体のドラッグ強調
components/PagesSection.tsx 「アップロード済みページ」セクション。見出しはすぐ出し、中身（PagesList）だけを
                            Suspense（useSuspenseQuery）で待つ。fallback は下線だけのスケルトン。
                            取得失敗はこのセクション内の ErrorBoundary + QueryErrorResetBoundary で
                            受け、「再読み込み」でクエリを取り直す
components/PagesList.tsx 一覧。表示専用（確認ダイアログ・コピー失敗の表示だけ持つ。ShareDialog の開閉は route へ委譲）
  PageRow.tsx             一覧の1行。表示とコールバック。共有中は控えめな icon button（パスワード有り GlobeLock / 無し Globe）を出し、押すと ShareDialog を開く
components/ShareDialog.tsx 外部共有の発行・作り直し・停止、パスワードの付け外し（Radix Dialog）。
                            パスワードのオン/オフは PasswordToggle。確認は AlertDialog に委譲。
                            パスワードを付けているときだけユーザー名・パスワードを読み取り表示する
                            （「最初の1回だけ表示」の完了画面は持たない）
components/UrlField.tsx     URL とコピーを一体にした表示部品（ShareDialog / UploadResult で使う）
components/CopyButton.tsx   URLコピーの共通部品（UploadResult / PageRow / ShareDialog / UrlField で使う）
components/BoxBubble.tsx    箱の直下の吹き出し（error / confirm / success）。
                            success は onCopy を渡すとクリックで公開URLをコピーする
components/{AlertDialog,Menu,Tooltip}.tsx  radix-ui のラッパー
components/UtilityMenu.tsx  右上のログアウトメニューと、読み込み中に同じ場所を空けるプレースホルダー。
                            どちらを出すかは AuthGate が決める
hooks/useUploadFlow.ts     アップロードの状態機械（useReducer）
hooks/useWindowFileDrag.ts ウィンドウ全体のドラッグ監視。isDragging だけ返す
hooks/useCopyToClipboard.ts クリップボードへのコピーと一時表示状態（2秒で idle に戻る）
hooks/usePagesApi.ts       React に依存しない createPagesApi（session / config から PagesApi を作る。
                            list / find / upload / remove / setRetention / updateShare）と、
                            それを auth context / env から組み立てる薄いラッパー usePagesApi
lib/listed-page.ts         metadata を一覧の行（ListedPage。公開URL・保存期間・共有 URL の tag 付き）にする変換と一覧取得
lib/pages-queries.ts       一覧の queryOptions（queryKey は ['pages', email]）。
                            loader（prefetchQuery）とコンポーネント（useQuery / useSuspenseQuery）で共有する
lib/query-client.ts        アプリで唯一の QueryClient
lib/query-persistence.ts   一覧クエリの localStorage への保存と復元（loader は復元を待ってから prefetch する）。
                            ログアウト時にメモリ・localStorage の両方を消す
lib/s3-client.ts           idToken ごとの S3Client のキャッシュと PageStore の生成
lib/messages.ts            画面に出す日本語の集約
lib/to-user-message.ts     エラーを画面向けの日本語にする
```

### 状態の置き場所

- **一覧データ**: TanStack Query のキャッシュ（`lib/query-client.ts` の QueryClient、queryKey `['pages', email]`）を唯一の情報源にする。`routes/index.tsx` の loader は一覧を await せず `prefetchQuery` を始めるだけ。Composer は suspend しない `useQuery` で読み、まだ無ければ `undefined` として扱う。「アップロード済みページ」の中身だけ `useSuspenseQuery`（`components/PagesSection.tsx`）で待つ。削除・保存期間変更は `queryClient.setQueryData` で先にキャッシュを書き換える楽観更新で、失敗したら一覧を取り直す（スナップショットへ戻すと並行した別の操作の成功分まで巻き戻るため）。アップロード・共有変更は成功後に、書き込んだ内容（API 呼び出しの戻り値）でキャッシュの該当行を差し替える（一覧全体は取り直さない）
- **route から下ろす合図**: `composerSeed`（再アップロード）・`retiredSlug`（消えたページ）・`highlight`（成功行）は `{ slug, nonce }` の値を props で Composer / PagesList へ渡す。`forwardRef` や `useImperativeHandle` は使わない
- **ShareDialog の開閉**: `shareSlug`（開いている対象の slug、または `null`）を `routes/index.tsx` が持つ。一覧の kebab「外部共有…」も成功結果の「外部共有…」も同じ `onShare(slug)` を呼ぶだけで、ShareDialog 自体の描画・`pages` からの対象ページの引き直し・保存後の一覧反映（書き込んだ内容で該当行を差し替え）は route 側の一箇所にまとめる。Composer で今回新しく外部公開したときは、`onUploaded` の第2引数に `true` を渡すだけで同じ経路が開く（共有URL・パスワードの有無は ShareDialog が常に一覧の `page.share` から表示するので、値を運ぶ必要が無い）
- **アップロードの状態**: `useUploadFlow` が `idle / checking / confirming / uploading / success / error` の判別共用体を `useReducer` で持つ。箱の吹き出し（`bubbleOf`）と箱アイコンの phase（`iconPhaseOf`）はこの状態から導出する
- **コピーの表示**: `useCopyToClipboard` が `idle / copied / failed` を持ち、2秒で idle に戻す。`CopyButton` がこれを使い、一覧側の共通エラー表示へは `onError` / `onCopied` で伝える

## 確認と検証

- 開発サーバー: `pnpm --filter @okibasho/web dev`（http://localhost:3000。Cognito の callback に登録済み）
- 静的チェック: `pnpm --filter @okibasho/web typecheck` / `pnpm --filter @okibasho/web test` / `pnpm format:check` / `pnpm --filter @okibasho/web build`
- 実機確認はブラウザ自動操作（agent-browser など）で行い、幅 1280 と 375（`innerWidth` を実際に 375 にする）の両方を撮る
- 箱アイコン単体は `/dev/upload-box-icon` のハーネスで確認できる（dev サーバーのみ、build には含まれない）
- UploadOptions のチップ列・PasswordToggle・ShareDialog・SlugField・PagesList/PageRow（一覧）は `/dev/options` のハーネスで props だけで描画して確認できる（Composer 本体は Cognito ログインが必要で開けないため。dev サーバーのみ）
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
- **Do** 成功中はフォームを隠して結果ブロックだけを見せ、成功状態の箱を「次のファイルを置く」の操作にして明示的に戻す

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
