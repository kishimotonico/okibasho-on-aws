import type {
  ApiErrorResponse,
  ListPageItem,
  ListPagesResponse,
  PageMetadata,
} from '@page-share/shared';
import { computeExpiresAt, metaObjectKey, USERS_PREFIX } from '@page-share/shared';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { buildViewUrl } from './view-url.js';

const INDEX_FETCH_CONCURRENCY = 10;

export interface ListPagesInput {
  store: PageStore;
  pagesBaseUrl: string;
  shareBaseUrl: string;
  ownerSub: string;
}

export type ListPagesResult =
  | { ok: true; status: 200; body: ListPagesResponse }
  | { ok: false; status: 500; body: ApiErrorResponse };

function slugFromMarkerKey(ownerSub: string, key: string): string | null {
  const prefix = `${USERS_PREFIX}${ownerSub}/`;
  if (!key.startsWith(prefix) || !key.endsWith('.json')) {
    return null;
  }
  const slug = key.slice(prefix.length, -'.json'.length);
  return slug.length > 0 ? slug : null;
}

function metadataToListItem(
  metadata: PageMetadata,
  pagesBaseUrl: string,
  shareBaseUrl: string,
): ListPageItem {
  const expiresAt = computeExpiresAt(metadata.retention, new Date(metadata.contentUpdatedAt));
  return {
    slug: metadata.slug,
    title: metadata.title,
    visibility: metadata.visibility,
    version: metadata.version,
    retention: metadata.retention,
    createdAt: metadata.createdAt,
    contentUpdatedAt: metadata.contentUpdatedAt,
    fileCount: metadata.fileCount,
    totalSize: metadata.totalSize,
    viewUrl: buildViewUrl(pagesBaseUrl, shareBaseUrl, metadata.visibility, metadata.slug),
    expiresAt,
  };
}

export async function listPages(input: ListPagesInput): Promise<ListPagesResult> {
  try {
    const { keys, truncated } = await input.store.listUserIndexKeys(input.ownerSub);

    if (truncated) {
      console.log('page_list_truncated', {
        ownerSub: input.ownerSub,
        keyCount: keys.length,
      });
    }

    const pages: ListPageItem[] = [];
    for (let i = 0; i < keys.length; i += INDEX_FETCH_CONCURRENCY) {
      const chunk = keys.slice(i, i + INDEX_FETCH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (markerKey) => {
          const slug = slugFromMarkerKey(input.ownerSub, markerKey);
          if (slug === null) {
            return { markerKey, slug: null as string | null, metaResult: null };
          }
          const metaResult = await input.store.getJson<PageMetadata>(metaObjectKey(slug));
          return { markerKey, slug, metaResult };
        }),
      );

      for (const { markerKey, slug, metaResult } of results) {
        if (slug === null || metaResult === null) {
          continue;
        }

        if (!metaResult.ok) {
          if (metaResult.reason === 'not_found') {
            console.log('page_list_orphan_marker', {
              ownerSub: input.ownerSub,
              slug,
              markerKey,
            });
          } else {
            console.log('page_list_meta_skipped', {
              ownerSub: input.ownerSub,
              slug,
              reason: metaResult.reason,
            });
          }
          continue;
        }

        if (!isPageMetadata(metaResult.data)) {
          console.log('page_list_meta_skipped', {
            ownerSub: input.ownerSub,
            slug,
            reason: 'invalid_shape',
          });
          continue;
        }

        const metadata = metaResult.data;

        if (metadata.ownerSub !== input.ownerSub) {
          console.log('page_list_owner_mismatch', {
            ownerSub: input.ownerSub,
            slug,
            metadataOwnerSub: metadata.ownerSub,
            markerKey,
          });
          continue;
        }

        pages.push(metadataToListItem(metadata, input.pagesBaseUrl, input.shareBaseUrl));
      }
    }

    pages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    console.log('page_listed', {
      ownerSub: input.ownerSub,
      pageCount: pages.length,
    });

    return {
      ok: true,
      status: 200,
      body: { pages },
    };
  } catch {
    console.log('page_list_failed', {
      errorCode: 'internal_error',
      ownerSub: input.ownerSub,
    });
    return {
      ok: false,
      status: 500,
      body: {
        error: {
          code: 'internal_error',
          message: 'ページ一覧の取得に失敗しました',
        },
      },
    };
  }
}
