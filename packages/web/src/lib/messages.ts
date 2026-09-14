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
  share: '外部共有…',
  shareActiveOpen: '外部共有中・誰でも閲覧可',
  shareActiveProtected: '外部共有中・パスワード / IP 制限あり',
  shareUpdateFailed: '外部共有の設定に失敗しました',

  /** 確認ダイアログ */
  deleteDialogTitle: 'このページを削除する',
  deleteDialogDescription: (slug: string) =>
    `「${slug}」を削除しますか？この操作は取り消せません。`,
  retentionDialogTitle: '保存期間を30日に変更',
  retentionDialogDescription: '保存期間を30日に変更しますか？',
  retentionDialogImmediateExpiry:
    '30日保存に戻すと、作成から30日以上経過しているため即座に期限切れになります。続行しますか？',

  /** 外部共有ダイアログ */
  shareDialogTitleNew: '外部共有',
  shareDialogTitleEdit: '外部共有の設定',
  shareDialogDescriptionNew: '外部の人に渡す別のURLを発行します。内部URLはそのまま使えます。',
  shareUrlLabel: '共有URL',
  shareExpiresHint: (dateLabel: string) => `保存期限（${dateLabel}）を過ぎると共有も終わります`,
  shareNoProtectionNotice: 'URLを知っている人なら誰でも見られます',
  shareCheckboxBasic: 'パスワード（Basic認証）',
  shareCheckboxCidr: 'IPアドレス制限',
  shareUsernameLabel: 'ユーザー名',
  sharePasswordLabel: 'パスワード',
  sharePasswordMasked: '••••••••',
  sharePasswordRegenerate: '再生成',
  sharePasswordCopy: 'パスワードをコピー',
  shareBasicChange: '変更',
  shareBasicCancelEdit: '取り消す',
  shareCidrTextareaLabel: '許可するIPアドレス（1行に1件）',
  shareCidrPlaceholder: '203.0.113.0/24',
  shareIssue: '共有URLを発行',
  shareSave: '設定を保存',
  shareReissue: 'URLを再発行',
  shareReissueConfirm: '再発行',
  shareStop: '共有を停止',
  shareCopyFailed: 'URL のコピーに失敗しました',
  shareReissueDialogTitle: 'URLを再発行する',
  shareReissueDialogDescription: '古いURLは使えなくなります。続行しますか？',
  shareStopDialogTitle: '外部共有を停止する',
  shareStopDialogDescription: '共有URLは使えなくなります。続行しますか？',
  shareSaveFailed: '保存に失敗しました',
  shareReissueFailed: '再発行に失敗しました',
  shareStopFailed: '共有停止に失敗しました',
  shareNoticeSave: '反映まで少し時間がかかることがあります。',
  shareNoticeReissue: '新しいURLに切り替わるまで少し時間がかかることがあります。',
  shareNoticeStop: '無効になるまで少し時間がかかることがあります。',
  shareClose: '閉じる',
  shareCompleteTitleIssue: '共有URLを発行しました',
  shareCompleteTitleSave: '設定を保存しました',
  shareSentInfoCopyAll: 'まとめてコピー',
  shareSentInfoNotice: 'パスワードはこの画面を閉じると再表示できません',
  shareSentInfoText: (url: string, username: string, password: string) =>
    `URL: ${url}\nユーザー名: ${username}\nパスワード: ${password}`,

  /** 汎用の確認操作 */
  cancel: 'やめる',
  replace: '差し替える',

  /** ユーティリティメニュー */
  menu: 'メニュー',
  logout: 'ログアウト',

  /** ログインコールバック */
  loginFailed: 'ログインに失敗しました',
  loginErrorTitle: 'ログインエラー',
  loginInProgress: 'ログイン処理中...',

  /** 404 */
  notFoundTitle: 'ページが見つかりません',
  notFoundDescription: 'アドレスが違うか、ページが削除されています。',
  backToTop: 'トップへ戻る',

  /** 公開URL（slug 入力） */
  publicUrlLabel: '公開URL',
  publicUrlAriaLabel: (urlOrigin: string, userPath: string, value: string) =>
    userPath ? `公開URL ${urlOrigin}${userPath}${value}` : '公開URL',

  /** 保存期間 */
  retentionLabel: '保存期間',
  retentionTemporaryOption: '30日',
  retentionPermanentOption: '無期限',

  /** 公開範囲（Composer） */
  shareVisibilityLabel: '公開範囲',
  shareVisibilityInternalOption: '内部のみ',
  shareVisibilityExternalOption: '外部にも公開',
  shareVisibilityLocked: '外部共有中（設定はそのまま）',
  shareVisibilityWithPassword: 'パスワードをかける',

  /** 一覧の期限表示 */
  expiredLabel: (dateLabel: string) => `期限切れ（${dateLabel}）`,
  activeUntilLabel: (dateTimeLabel: string, daysRemaining: number) =>
    `${dateTimeLabel} まで（あと${daysRemaining}日）`,

  /** 通信エラー */
  networkError: 'つながりません。接続を確かめて、もう一度どうぞ。',

  /** アップロードの検証 */
  validationFilesRequired: 'ファイルを選んでください',
  validationTooManyFiles: (max: number) => `ファイルは ${max} 件までです`,
  validationInvalidPath: (path: string) => `${path} は使えません`,
  validationDuplicatePath: (path: string) => `${path} が重複しています`,
  validationInvalidFileSize: (path: string) => `${path} のサイズが不正です`,
  validationFileTooLarge: (path: string) => `${path} が大きすぎます`,
  validationPageSizeExceeded: '合計サイズが上限を超えています',
  validationMissingIndexHtml: 'index.html がありません',
} as const;
