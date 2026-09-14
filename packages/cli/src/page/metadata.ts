import type { PageShare } from './share.js';

export const DEFAULT_RETENTION_DAYS = 30;

export interface PageMetadata {
  createdAt: string;
  /** ISO 8601。null なら無期限 */
  expiresAt: string | null;
  /** 外部共有設定。無ければ外部共有していない */
  share?: PageShare;
}

export function isPageMetadata(value: unknown): value is PageMetadata {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['createdAt'] === 'string' &&
    (record['expiresAt'] === null || typeof record['expiresAt'] === 'string') &&
    (record['share'] === undefined ||
      (typeof record['share'] === 'object' && record['share'] !== null))
  );
}
