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

/** users/<sub>/<slug>.json — 一覧表示に必要な項目だけを持ち、毎回 metadata を引かない */
export interface UserPageIndexEntry {
  slug: string;
  retention: Retention;
  createdAt: string;
  expiresAt: string | null;
  fileCount: number;
  totalSize: number;
}
