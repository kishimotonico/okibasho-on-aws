import { DEFAULT_RETENTION_DAYS, type Retention } from '@page-share/shared';

/** S3 Lifecycle が参照する Object Tag のキー */
export const RETENTION_TAG_KEY = 'retention';

/** temporary ページに付与する Object Tag の値 */
export const RETENTION_TAG_VALUE_TEMPORARY = 'temporary';

/**
 * temporary の expiresAt は常に createdAt + 30日。
 * S3 Lifecycle はオブジェクト作成日からしか日数を数えられないため、
 * 変更時刻起点にすると論理期限と物理削除の基準がずれる。
 */
export function computeExpiresAt(retention: Retention, createdAt: Date): string | null {
  if (retention === 'permanent') {
    return null;
  }
  const expires = new Date(createdAt);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

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
