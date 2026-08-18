import type { PageMetadata } from '@page-share/shared';

/** S3 から読んだ JSON が PageMetadata の形かどうかを実行時に検査する */
export function isPageMetadata(value: unknown): value is PageMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata['slug'] === 'string' &&
    typeof metadata['ownerSub'] === 'string' &&
    typeof metadata['ownerEmail'] === 'string' &&
    (metadata['retention'] === 'temporary' || metadata['retention'] === 'permanent') &&
    typeof metadata['createdAt'] === 'string' &&
    (metadata['expiresAt'] === null || typeof metadata['expiresAt'] === 'string') &&
    typeof metadata['fileCount'] === 'number' &&
    typeof metadata['totalSize'] === 'number'
  );
}
