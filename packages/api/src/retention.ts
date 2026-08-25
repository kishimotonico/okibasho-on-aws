export { computeExpiresAt, expiresAtEpochSeconds } from '@page-share/shared';

import type { Retention } from '@page-share/shared';

/** S3 Lifecycle が参照する Object Tag のキー */
export const RETENTION_TAG_KEY = 'retention';

/** temporary ページに付与する Object Tag の値 */
export const RETENTION_TAG_VALUE_TEMPORARY = 'temporary';

/** retention に応じた S3 Object Tag。permanent はタグを外す（空オブジェクト） */
export function retentionObjectTags(retention: Retention): Record<string, string> {
  if (retention === 'temporary') {
    return { [RETENTION_TAG_KEY]: RETENTION_TAG_VALUE_TEMPORARY };
  }
  return {};
}

/**
 * presigned PUT に載せる x-amz-tagging の値。permanent なら null(ヘッダ自体を付けない)。
 * S3のタグ指定はURLエンコードされたクエリ文字列の形をとる。
 */
export function retentionTaggingHeader(retention: Retention): string | null {
  if (retention !== 'temporary') {
    return null;
  }
  return `${encodeURIComponent(RETENTION_TAG_KEY)}=${encodeURIComponent(RETENTION_TAG_VALUE_TEMPORARY)}`;
}

/** オブジェクトタグから retention を推定する（complete 時の新規作成用） */
export function retentionFromObjectTags(tags: Record<string, string>): Retention {
  if (tags[RETENTION_TAG_KEY] === RETENTION_TAG_VALUE_TEMPORARY) {
    return 'temporary';
  }
  return 'permanent';
}
