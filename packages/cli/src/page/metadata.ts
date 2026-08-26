export const DEFAULT_RETENTION_DAYS = 30;

export interface PageMetadata {
  slug: string;
  owner: string;
  createdAt: string;
  /** ISO 8601。null なら無期限 */
  expiresAt: string | null;
}

export function isPageMetadata(value: unknown): value is PageMetadata {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['slug'] === 'string' &&
    typeof record['owner'] === 'string' &&
    typeof record['createdAt'] === 'string' &&
    (record['expiresAt'] === null || typeof record['expiresAt'] === 'string')
  );
}
