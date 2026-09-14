/**
 * 画面に出す日本語をここにまとめる。同じ文言をフォームと一覧の両方に散らさないため。
 * 敬体・用語（slug / 保存期間 / 30日 / 無期限 / 公開URL / 再アップロード）は DESIGN.md に従う。
 */

export const messages = {
  /** composer（フォーム） */
  dropLead: 'ここにドロップして公開',
  dragOverlayFallback: '上のフォームにドロップ',
  pickFiles: 'ファイルを選ぶ',
  pickDirectory: 'フォルダを選ぶ',
  slugTooltip: 'クリックして名前を付け直せる',
  invalidSlug: '使えるのは小文字の英数字と - _ だけ',
  notHtml: 'HTML 以外は置けません',
  uploaded: '公開しました',
  uploadFailed: '送れませんでした。もう一度どうぞ。',
  loginRequired: 'ログインが必要です',
  copyUrl: 'URLをコピー',
  copied: 'コピーしました',
  copyFailed: 'コピーに失敗しました',
  copyUrlFailed: 'URL のコピーに失敗しました',
  uploadAnother: '次のファイルを置く',
  confirmOverwrite: (slug: string) => `${slug} はもうあるよ。差し替える？ 保存期間はそのまま`,

  /** 一覧 */
  listHeading: 'アップロード済みページ',
  listLoading: '一覧を読み込み中...',
  listEmpty: 'まだページがありません。上のフォームからアップロードしてください。',
  listLoadFailed: '一覧の取得に失敗しました',
  listReload: '再読み込み',
  openPage: 'ページを開く',
  rowActions: (slug: string) => `${slug}の操作`,
  moreActions: 'その他の操作',
  reupload: '再アップロード',
  toPermanent: '無期限に変更',
  toTemporary: '30日に戻す',
  remove: '削除',
  removeFailed: '削除に失敗しました',
  retentionChangeFailed: '保存期間の変更に失敗しました',

  /** 確認ダイアログ */
  deleteDialogTitle: 'このページを削除する',
  deleteDialogDescription: (slug: string) =>
    `「${slug}」を削除しますか？この操作は取り消せません。`,
  retentionDialogTitle: '保存期間を30日に変更',
  retentionDialogDescription: '保存期間を30日に変更しますか？',
  retentionDialogImmediateExpiry:
    '30日保存に戻すと、作成から30日以上経過しているため即座に期限切れになります。続行しますか？',
} as const;
