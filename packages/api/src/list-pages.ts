import type {
  ApiErrorResponse,
  ListPageItem,
  ListPagesResponse,
  UserPageIndexEntry,
} from '@page-share/shared';
import { USERS_PREFIX } from '@page-share/shared';
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

function slugFromIndexKey(ownerSub: string, key: string): string | null {
  const prefix = `${USERS_PREFIX}${ownerSub}/`;
  if (!key.startsWith(prefix) || !key.endsWith('.json')) {
    return null;
  }
  const slug = key.slice(prefix.length, -'.json'.length);
  return slug.length > 0 ? slug : null;
}

function isUserPageIndexEntry(value: unknown): value is UserPageIndexEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['slug'] === 'string' &&
    (entry['retention'] === 'temporary' || entry['retention'] === 'permanent') &&
    typeof entry['createdAt'] === 'string' &&
    (entry['expiresAt'] === null || typeof entry['expiresAt'] === 'string') &&
    typeof entry['fileCount'] === 'number' &&
    typeof entry['totalSize'] === 'number'
  );
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

    // インデックスは1件1オブジェクトなので、件数分のGetObjectが要る。
    // 直列に回すと件数に比例してLambdaのタイムアウトに近づくため、
    // 少しずつ並列に取る。ここを無制限にするとS3への同時接続が増えすぎる
    const pages: ListPageItem[] = [];
    for (let i = 0; i < keys.length; i += INDEX_FETCH_CONCURRENCY) {
      const chunk = keys.slice(i, i + INDEX_FETCH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (key) => ({
          key,
          result: await input.store.getJson<UserPageIndexEntry>(key),
        })),
      );

      for (const { key, result } of results) {
        const slugFromKey = slugFromIndexKey(input.ownerSub, key);

        if (!result.ok) {
          if (slugFromKey !== null) {
            console.log('page_list_index_skipped', {
              ownerSub: input.ownerSub,
              slug: slugFromKey,
              reason: result.reason,
            });
          }
          continue;
        }

        if (!isUserPageIndexEntry(result.data)) {
          console.log('page_list_index_skipped', {
            ownerSub: input.ownerSub,
            slug: slugFromKey ?? 'unknown',
            reason: 'invalid_shape',
          });
          continue;
        }

        const entry = result.data;
        pages.push({
          ...entry,
          viewUrl: buildViewUrl(input.pagesBaseUrl, entry.slug),
        });
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
