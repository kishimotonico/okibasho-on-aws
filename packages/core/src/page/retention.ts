export const DEFAULT_RETENTION_DAYS = 30;

/** 保存期間。temporary は 30 日、permanent は無期限 */
export type Retention = 'temporary' | 'permanent';

export function retentionFromExpiresAt(expiresAt: string | null): Retention {
  return expiresAt === null ? 'permanent' : 'temporary';
}

/** 保存期限。temporary は基準時刻から 30 日後、permanent は期限なし */
export function computeExpiresAt(retention: Retention, base: Date | string): string | null {
  if (retention === 'permanent') {
    return null;
  }
  const expires = new Date(base);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

/**
 * 保存期間を変えたときの保存期限。起点は作成時刻（変更時刻ではない）。
 * S3 への書き込みと web の楽観更新が同じ計算になるよう、ここだけで決める
 */
export function retentionChangeExpiresAt(retention: Retention, createdAt: string): string | null {
  return computeExpiresAt(retention, createdAt);
}
