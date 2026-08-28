# 未確定の論点

検討中の論点を集める場所。決まったら該当項目をここから消し、[architecture.md](architecture.md) に決定内容を書く。

「実装担当に委任」とある項目は、事前に決めず実装担当の判断に任せる。

検討中のメモ: [notes-optional-metadata.md](notes-optional-metadata.md)（S3 直置き、`.metadata.json` 任意化、orphan 回収の見直し。未決定。実装しない）。

slug の許可文字（`[a-z0-9][a-z0-9_-]{0,63}`）とサイズ上限（クライアント側の目安のみ。1 ファイル 50 MB / 1 ページ 200 MB / ファイル数 200）は実装時の判断として [architecture.md](architecture.md) へ移した。IAM ではサイズを強制できない、というトレードオフはそのまま残っている。
