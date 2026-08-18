import type {
  ApiErrorResponse,
  ListPageItem,
  ListPagesResponse,
  PageMetadata,
} from '@page-share/shared';
import { metaObjectKey, USERS_PREFIX } from '@page-share/shared';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { buildViewUrl } from './view-url.js';

const INDEX_FETCH_CONCURRENCY = 10;

export interface ListPagesInput {
  store: PageStore;
  pagesBaseUrl: string;
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

function metadataToListItem(metadata: PageMetadata, pagesBaseUrl: string): ListPageItem {
  return {
    slug: metadata.slug,
    retention: metadata.retention,
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    fileCount: metadata.fileCount,
    totalSize: metadata.totalSize,
    viewUrl: buildViewUrl(pagesBaseUrl, metadata.slug),
  };
}

async function deleteOrphanMarker(
  store: PageStore,
  ownerSub: string,
  markerKey: string,
  slug: string,
): Promise<void> {
  try {
    await store.deleteObjects([markerKey]);
    console.log('page_list_orphan_marker_deleted', {
      ownerSub,
      slug,
      markerKey,
    });
  } catch {
    // 次回の一覧取得でまた直せる。全体を失敗させない
    console.log('page_list_orphan_marker_delete_failed', {
      ownerSub,
      slug,
      markerKey,
    });
  }
}

export async function listPages(input: ListPagesInput): Promise<ListPagesResult> {
  try {
    const { keys, truncated } = await input.store.listUserIndexKeys(input.ownerSub);

    if (truncated) {
      // ListObjectsV2 の 1000 件上限に達した。ページネーションは実装しないが、
      // 黙って切り捨てないよう運用で気付けるようにする。
      console.log('page_list_truncated', {
        ownerSub: input.ownerSub,
        keyCount: keys.length,
      });
    }

    // マーカーは slug の列挙だけに使い、表示内容は meta/ から取る。
    // 件数分の GetObject が要るので、少しずつ並列に取る。
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
            // meta が無いマーカーは一覧に出さず、その場で掃除する
            await deleteOrphanMarker(input.store, input.ownerSub, markerKey, slug);
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
          // 他人の meta を誤って読んだとき、マーカーは消さない
          console.log('page_list_owner_mismatch', {
            ownerSub: input.ownerSub,
            slug,
            metadataOwnerSub: metadata.ownerSub,
            markerKey,
          });
          continue;
        }

        pages.push(metadataToListItem(metadata, input.pagesBaseUrl));
      }
    }

    // 期限切れページも含める。物理削除は Lifecycle 任せで即時ではないため、
    // 一覧から急に消えるより expiresAt を見て「期限切れ」と分かるほうが利用者にとって分かりやすい。
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
