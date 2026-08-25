import { DEFAULT_RETENTION_DAYS, type Retention } from './metadata.js';

/**
 * 論理期限。temporary は contentUpdatedAt + 30日、permanent は null。
 * 派生値なので metadata には保存せず、API の応答と KVS の `e` はここを通す。
 */
export function computeExpiresAt(retention: Retention, contentUpdatedAt: Date): string | null {
  if (retention === 'permanent') {
    return null;
  }
  const expires = new Date(contentUpdatedAt);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

/** KVS の `e` 用。無期限なら undefined（フィールドごと省く） */
export function expiresAtEpochSeconds(
  retention: Retention,
  contentUpdatedAt: Date,
): number | undefined {
  const expiresAt = computeExpiresAt(retention, contentUpdatedAt);
  if (expiresAt === null) {
    return undefined;
  }
  return Math.floor(new Date(expiresAt).getTime() / 1000);
}
