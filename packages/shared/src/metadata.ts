/** 保存期間の種別。temporary は期限付き、permanent は無期限 */
export type Retention = 'temporary' | 'permanent';

export const DEFAULT_RETENTION: Retention = 'temporary';

/** temporary のデフォルト保持日数 */
export const DEFAULT_RETENTION_DAYS = 30;

/** meta/<slug>.json の正本 */
export interface PageMetadata {
  slug: string;
  ownerSub: string;
  ownerEmail: string;
  retention: Retention;
  createdAt: string;
  expiresAt: string | null;
  fileCount: number;
  totalSize: number;
}

/**
 * users/<sub>/<slug>.json。所有関係を表すだけのマーカーで、可変な値は持たない。
 * retention や fileCount などは meta/ にだけ置き、更新系で2オブジェクトを揃える必要を
 * なくす。一覧は meta/ を読む。マーカーだけ残った孤立エントリは一覧取得時の lazy cleanup
 * か reconcile スクリプトで掃除する。
 */
export interface UserPageIndexEntry {
  slug: string;
  createdAt: string;
}
