/** 保存期間の種別。temporary は期限付き、permanent は無期限 */
export type Retention = 'temporary' | 'permanent';

export const DEFAULT_RETENTION: Retention = 'temporary';

/** temporary のデフォルト保持日数 */
export const DEFAULT_RETENTION_DAYS = 30;

/** 公開範囲。既定は社内限定 */
export type Visibility = 'internal' | 'shared';

export const DEFAULT_VISIBILITY: Visibility = 'internal';

export const TITLE_MAX_LENGTH = 200;

/** meta/<slug>.json の正本。expiresAt は保存せず retention と contentUpdatedAt から計算する */
export interface PageMetadata {
  slug: string;
  title: string;
  ownerSub: string;
  ownerEmail: string;
  visibility: Visibility;
  retention: Retention;
  createdAt: string;
  /** 新しいバージョンの complete が成功した時刻。title / retention の変更では動かない */
  contentUpdatedAt: string;
  /** 表示用の連番。complete 成功時にだけ加算する */
  version: number;
  /** 配信中の実体の versionId */
  activeVersionId: string;
  fileCount: number;
  totalSize: number;
}

/**
 * users/<sub>/<slug>.json。所有関係を表すだけのマーカーで、可変な値は持たない。
 * retention や fileCount などは meta/ にだけ置き、更新系で2オブジェクトを揃える必要を
 * なくす。一覧は meta/ を読む。マーカーだけ残った孤立エントリは一覧では無視し、
 * 掃除は reconcile スクリプトの手動実行に任せる。
 */
export interface UserPageIndexEntry {
  slug: string;
  createdAt: string;
}
