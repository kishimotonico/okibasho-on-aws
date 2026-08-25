import type { Visibility } from '@page-share/shared';
import { isValidVersionId, pagePrefix } from '@page-share/shared';
import type { PageStore } from './page-store.js';

/** 配信中でなく、かつ1時間以上更新されていないバージョンディレクトリを削除する */
export const ORPHAN_RECLAIM_MIN_AGE_MS = 60 * 60 * 1000;

export function versionIdFromObjectKey(
  visibility: Visibility,
  slug: string,
  key: string,
): string | null {
  const prefix = pagePrefix(visibility, slug);
  if (!key.startsWith(prefix)) {
    return null;
  }
  const rest = key.slice(prefix.length);
  const slashIndex = rest.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }
  const versionId = rest.slice(0, slashIndex);
  return isValidVersionId(versionId) ? versionId : null;
}

export async function reclaimOldVersions(
  store: PageStore,
  visibility: Visibility,
  slug: string,
  activeVersionId: string,
  now: Date,
): Promise<void> {
  const prefix = pagePrefix(visibility, slug);
  const { objects, truncated } = await store.listObjectInfos(prefix);
  if (truncated) {
    console.log('version_reclaim_truncated', { slug, visibility, objectCount: objects.length });
  }

  const versionLastModified = new Map<string, Date>();
  for (const object of objects) {
    const versionId = versionIdFromObjectKey(visibility, slug, object.key);
    if (versionId === null) {
      continue;
    }
    const current = versionLastModified.get(versionId);
    if (current === undefined || object.lastModified > current) {
      versionLastModified.set(versionId, object.lastModified);
    }
  }

  const keysToDelete: string[] = [];
  const cutoff = now.getTime() - ORPHAN_RECLAIM_MIN_AGE_MS;

  for (const object of objects) {
    const versionId = versionIdFromObjectKey(visibility, slug, object.key);
    if (versionId === null || versionId === activeVersionId) {
      continue;
    }
    const lastModified = versionLastModified.get(versionId);
    if (lastModified === undefined || lastModified.getTime() > cutoff) {
      continue;
    }
    keysToDelete.push(object.key);
  }

  if (keysToDelete.length > 0) {
    await store.deleteObjects(keysToDelete);
    console.log('version_reclaimed', {
      slug,
      visibility,
      deletedKeyCount: keysToDelete.length,
    });
  }
}
