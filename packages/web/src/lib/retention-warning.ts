import { DEFAULT_RETENTION_DAYS } from '@page-share/shared';

/**
 * 無期限から 30 日（temporary）へ戻すときに即座に期限切れになるか。
 * temporary の期限は変更時刻ではなく作成から 30 日固定のため、
 * 作成から 30 日以上経ったページを戻すと expiresAt が過去になる。
 */
export function shouldWarnImmediateExpiryOnTemporary(
  createdAt: string,
  now: Date = new Date(),
): boolean {
  const created = new Date(createdAt);
  const temporaryExpiresAt = new Date(created);
  temporaryExpiresAt.setUTCDate(temporaryExpiresAt.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return now.getTime() >= temporaryExpiresAt.getTime();
}
