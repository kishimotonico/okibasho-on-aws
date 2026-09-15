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
  uploadedCopyAriaLabel: '公開しました。クリックで公開URLをコピーします',
  uploadFailed: 'アップロードに失敗しました。もう一度お試しください。',
  loginRequired: 'ログインが必要です',
  copyUrl: 'URLをコピー',
  copied: 'コピーしました',
  copyFailed: 'コピーに失敗しました',
  copyUrlFailed: 'URL のコピーに失敗しました',
  uploadAnother: '次のファイルを置く',
  confirmOverwrite: (slug: string) =>
    `${slug} は既にあります。保存期間はそのままで差し替えますか？`,

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
  shareActive: '外部共有中',
  shareActiveNoPassword: '外部共有中（パスワードなし）',
  shareUpdateFailed: '外部共有の設定に失敗しました',

  /** 確認ダイアログ */
  deleteDialogTitle: 'このページを削除する',
  deleteDialogDescription: (slug: string) =>
    `「${slug}」を削除しますか？この操作は取り消せません。`,
  retentionDialogTitle: '保存期間を30日に変更',
  retentionDialogDescription: '保存期間を30日に変更しますか？',

  /** 外部共有ダイアログ */
  shareDialogTitleNew: '外部共有',
  shareDialogTitleEdit: '外部共有の設定',
  shareDialogDescriptionNew: '外部向けの別URLを発行します。内部URLはそのまま使えます。',
  shareUrlLabel: '共有URL',
  shareExpiresMeta: (dateLabel: string) => `${dateLabel} まで`,
  shareUsernameLabel: 'ユーザー名',
  shareUsernameCopy: 'ユーザー名をコピー',
  sharePasswordLabel: 'パスワード',
  sharePasswordCopy: 'パスワードをコピー',
  shareIssue: '共有URLを発行',
  shareIssueFailed: '発行に失敗しました',
  sharePasswordOnFailed: 'パスワードの設定に失敗しました',
  sharePasswordOffFailed: 'パスワードの解除に失敗しました',
  shareRecreate: '作り直す',
  shareRecreateConfirm: '作り直す',
  shareRecreateFailed: '作り直しに失敗しました',
  shareStop: '共有を停止',
  shareCopyFailed: 'URL のコピーに失敗しました',
  shareRecreateDialogTitle: 'URLを作り直す',
  shareRecreateDialogDescription:
    '古いURLは使えなくなります。パスワードを付けている場合は、それも同時に作り直します。続行しますか？',
  shareStopDialogTitle: '外部共有を停止する',
  shareStopDialogDescription: '共有URLは使えなくなります。続行しますか？',
  shareStopFailed: '共有停止に失敗しました',
  shareNoticeRecreate: '開けるようになるまで数秒かかることがあります。',
  shareNoticeStop: '無効になるまで数秒かかることがあります。',
  shareClose: '閉じる',
  shareCopyAll: 'まとめてコピー',
  shareCopyAllText: (url: string, username: string, password: string) =>
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
  shareVisibilityLocked: '外部共有中',
  shareVisibilityLockedHint: '設定はそのまま',

  /** パスワードのオン/オフ（PasswordToggle。Composer のチップと ShareDialog で共通） */
  sharePasswordChipOff: 'パスワードなし',
  sharePasswordChipOn: 'パスワードあり',

  /** 一覧の期限表示 */
  expiredLabel: (dateLabel: string) => `期限切れ（${dateLabel}）`,
  activeUntilLabel: (dateTimeLabel: string, daysRemaining: number) =>
    `${dateTimeLabel} まで（あと${daysRemaining}日）`,

  /** 通信エラー */
  networkError: '接続できませんでした。ネットワークを確認してお試しください。',

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
