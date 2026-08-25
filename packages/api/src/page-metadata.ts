import type { PageMetadata } from '@page-share/shared';

/** S3 から読んだ JSON が PageMetadata の形かどうかを実行時に検査する */
export function isPageMetadata(value: unknown): value is PageMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata['slug'] === 'string' &&
    typeof metadata['title'] === 'string' &&
    typeof metadata['ownerSub'] === 'string' &&
    typeof metadata['ownerEmail'] === 'string' &&
    (metadata['visibility'] === 'internal' || metadata['visibility'] === 'shared') &&
    (metadata['retention'] === 'temporary' || metadata['retention'] === 'permanent') &&
    typeof metadata['createdAt'] === 'string' &&
    typeof metadata['contentUpdatedAt'] === 'string' &&
    typeof metadata['version'] === 'number' &&
    typeof metadata['activeVersionId'] === 'string' &&
    typeof metadata['fileCount'] === 'number' &&
    typeof metadata['totalSize'] === 'number'
  );
}
