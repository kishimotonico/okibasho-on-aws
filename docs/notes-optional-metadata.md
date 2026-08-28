# メモ: S3 直置きと `.metadata.json`（未決定）

2026-08-28 の議論の引き継ぎ。実装しない。別エージェントが現行コードと `architecture.md` を突き合わせ、計画をレビューしてから実装する。

正本はまだ [architecture.md](architecture.md) と [concept.md](concept.md)。本書と食い違う箇所は未決であり、architecture を勝手に上書きしない。決まったら architecture へ移し、本書は捨てる。

## 動機

GitHub Actions からのアップロードは MVP 外で、第一級機能にもしない（[concept.md](concept.md) の「MVPでやらないこと」と将来候補）。ただし CLI / Web を経由しなくても、適切な S3 キーに置けばページとして残るくらい単純であってほしい。GHA はその副産物として動けばよい。

## 現行の事実

配信に API は無い。公開 URL `https://pages…/<user>/<slug>/` は CloudFront Function が `pages/<email>/<slug>/…` へ書き換え、OAC 経由で S3 を読む。Phase 1 の受け入れも「手で置いた HTML が見える」。

通常ユーザーが書ける範囲は Cognito Identity Pool の authenticated role だけ。Resource は `pages/${aws:PrincipalTag/email}/*`。GHA は Cognito ユーザーではないので、今のままではそのパスに届かない。置けるのは広い IAM を使うか、専用ロールを足した場合だけ。現行 CLI は PKCE + ブラウザ前提で、GHA には向かない。refresh token は 30 日で切れる。

CLI / Web が守っているページ契約:

1. `pages/<email>/<slug>/` 配下へ PutObject
2. ページ直下に `index.html` が必須（単一 HTML は `index.html` として置く）
3. Content-Type は拡張子から付ける
4. 同じ prefix にあって今回含まれないキーを消す（`.metadata.json` は消さない）
5. 最後に `.metadata.json` を書く

`.metadata.json` の形:

```json
{
  "slug": "q3-report",
  "owner": "tanaka@example.jp",
  "createdAt": "2026-08-26T04:00:00Z",
  "expiresAt": "2026-09-25T04:00:00Z"
}
```

`expiresAt` が `null` なら無期限。公開 URL からは見えない（CloudFront Function が `/.metadata.json` を 404）。

cleanup Lambda は未実装（Phase 5）。設計上は 1 時間ごとに全キーを List し、`pages/<email>/<slug>/` 単位で束ね、`.metadata.json` が無ければ孤児として prefix ごと削除、あれば `expiresAt` が過去なら削除する。pages は CloudFront → S3 の直配信なので、閲覧時に期限を見る場所は無い。`expiresAt` が期限の正本。

My Pages と `share-html list` は CommonPrefixes で slug を拾ったあと、各 `.metadata.json` を Get する。metadata が無い（または壊れている）slug は一覧から落とす。

再アップロードで CLI は `createdAt` を残し `expiresAt` を作り直す。Web は既存 metadata をほぼそのまま残す（期限の再計算は保存期間の変更操作だけ）。ここは現行でも CLI と Web で違う。

## 議論で固まったこと

次は発言者の意向として扱ってよい。architecture への反映はレビュー後。

- GHA を本線にしない。OIDC アップロードロールや機械ユーザーを今は足さない。
- それでも S3 直置きが自然に通る単純さは欲しい。
- `.metadata.json` 自体は残す。ページ単位の寿命（デフォルト 30 日 / 無期限）をオブジェクト属性だけで表せない、というのが残す理由。
- **無いなら無期限**にする。無い prefix を孤児として消さない。
- 実装は指示があるまでしない。

`owner` は今の仕様では不要。認可は IAM の prefix 制限。`slug` もキーから取れる。JSON に実質必要なのは `createdAt` と `expiresAt`。フィールドを今すぐ削るかは実装判断でよい。

## 検討して退けたもの（または本線にしないもの）

**現行 CLI を GHA から呼ぶ。** 非対話ログインが無い。人間の refresh token を CI に置くことになる。

**オブジェクトタグに `expiresAt` を書いて Lifecycle で消す。** Lifecycle はオブジェクトごとの絶対日を読まない。「作成から N 日」とタグの肯定一致だけ。タグは分類用。日付の正本にはならない。

**タグ `retention=temporary` + Lifecycle 30 日で cleanup を捨てる。** 期限切れ削除だけ見ると S3 の定石に近い。ただし消える単位がページからオブジェクトに変わる。再アップロードで触ったファイルだけ時計がリセットされ、ページが欠けうる。フィルタは肯定一致のみで、「タグなし」や「permanent 以外」は書けない。無期限はタグを付けない側。評価は日次。IAM に `s3:PutObjectTagging` が要る。直置きを JSON なしで残したい要求とは噛むが、カレンダー寿命と prefix 一括削除は失う。今は採用しない。

**`.metadata.json` を全廃する。** 直置きは最も単純になる。代わりにデフォルト 30 日と無期限トグルと、初回 `createdAt` の固定を捨てるか、Lifecycle に粗く寄せることになる。寿命機能を残す前提では sidecar を残す。

**名前付き HTML を推測して正規 URL のエントリにする。** HTML が複数あると選べない。相対パスも壊れる。やらない。

## 草案: ページとは何か

ここから先は提案。ユーザーは「名前付き HTML しかない成果物」と「orphan の定義」を詰める必要があると言った。次の切り方をレビューして採否を決める。

**ページ**は `pages/<email>/<slug>/` という prefix。オブジェクトが 1 つでもあれば prefix は存在する。存在の正本は `.metadata.json` ではない。

**正規の共有 URL** は常に `/<user>/<slug>/`。これが中身を返す条件は、prefix 直下に `index.html` があること。CloudFront Function は末尾 `/` を `index.html` に足す以外、エントリを推測しない。

**名前付き HTML だけ**（例: `…/q3-report/report.html`）は欠落でも orphan でもない。同じページのファイルで、`/<user>/<slug>/report.html` なら届く。正規 URL `…/q3-report/` は 404。CLI / Web は正規 URL を出すクライアントなので、今どおり `index.html` を要求する（単一ファイルはリネーム）。直置きする人は、正規 URL が欲しければ自分で `index.html` にする。名前のまま置くならフルパスを共有する。

**`.metadata.json`** は寿命の任意の注釈。無ければ無期限。`expiresAt` が過去なら cleanup が prefix ごと消す。CLI / Web は今どおり最後に書く（デフォルト 30 日、`--permanent` / 無期限トグルで `null`）。直置きは JSON なしで残る。あとから期限を付けたければ JSON を足す。Web から 30 日に変える操作は、そのとき metadata を作れば足りる。

**現行の orphan** は「オブジェクトはあるが `.metadata.json` が無い prefix」。想定発生源は (1) ファイル PUT のあと metadata を書く前に落ちたアップロード (2) 削除の途中失敗。metadata 無しを無期限にすると、意図した直置きと失敗作をファイルの並びでは区別できない。草案では orphan 回収を捨て、中断アップロードは本人が My Pages / `share-html rm` で消す。30 人規模では、失敗作を Lambda が推測して消すより小さい、という判断。

orphan ではないもの:

- 再アップロードで残った古い CSS / JS（差分削除の話。metadata の有無とは独立）
- 名前付き HTML だけの直置き
- metadata を意図して置かない直置き

**My Pages / `share-html list`** は CommonPrefixes をそのまま出す。metadata も `index.html` も無くてよい。正規 URL は常に `/<user>/<slug>/`（`index.html` が無ければ開くと 404）。作成日は metadata の `createdAt`、無ければ空。オブジェクトの LastModified をページの誕生日にしない（再アップロードで動き、ファイルごとに違う）。

**不完全アップロード**は自動では正しく判定できないので推測しない。metadata を最後に書く今の順を変えない。中断すると無期限の欠けた prefix が残りうる。それを許容する。

## cleanup のコスト

「毎時 metadata を全部読むのは高いか」への答え: この規模では問題にならない。社員約 30 人。多めに 1,500 ページとしても、東京の S3 Standard で Get 108 万回/月は約 $0.4。metadata は数百バイト。Lambda 時間も誤差。

都度読むのは、期限の正本をオブジェクトの中に置いている以上、消す側の仕事そのもの。HEAD も同じ単価。1 時間間隔はコストのためではなく、期限切れから消えるまでのズレを最大 1 時間にするための製品側の数字。デフォルト 30 日に対して日次でも足りるが、元が数十セントなので間隔を延ばす理由にはしにくい。

効く変更は読み方の工夫より、orphan 回収をやめて metadata があるページだけを対象にすること。suffix が `/.metadata.json` のキーだけ Get し、`expiresAt` が過去ならその prefix を消す。JSON が無いページは見ない。全成果物の List + グループ化は要らなくなる。

ページが 10 万を超えたら Inventory やキー名埋め込みを考える。今はやらない。

cleanup のロールだけ prefix 制限が無い、というレビュー観点は残る。

## 実装する場合に触りそうなところ（計画用。着手しない）

コードはまだ cleanup が無い。変わるのは主に文書と、一覧が metadata 無し slug を落とすクライアント、将来の cleanup 仕様。

- [architecture.md](architecture.md): 「`.metadata.json` がこのページの正本」「無ければ孤児として削除」
- [roadmap.md](roadmap.md) Phase 5: 孤児回収と「最大 1 時間以内に消える」の受け入れ
- [decision-adpot-iam-direct.md](decision-adpot-iam-direct.md): 経緯の参照用。正本ではない
- CLI `listPages` / Web `listPages`: metadata 無しを skip している
- CLI / Web の upload 契約自体（index.html 必須、最後に metadata、差分削除）は草案でも維持
- `packages/infra` に cleanup Construct はまだ無い

## レビューで決めてほしいこと

1. 草案の「ページ = prefix」「metadata 任意・無ければ無期限」「orphan 回収を捨てる」を採るか。
2. My Pages に `index.html` も metadata も無い prefix を出すか。出すなら表示（作成日空、正規 URL は 404 になりうる）をどうするか。
3. `.metadata.json` から `owner` / `slug` を削るか。残しても害は小さい。
4. 中断アップロードが無期限ゴミになりうることを明示して受け入れるか。
5. 期限切れ削除の間隔を 1 時間のままにするか。コスト理由では変えないでよい。
6. GHA 用 IAM は今回の対象外でよいか（本線にしない、の再確認）。

CI/CD 統合そのものは MVP 外のまま。文書化するのは「直置きしても消されない」というページ契約だけ、で足りるはず。
