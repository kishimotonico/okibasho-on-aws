import type { ApiErrorResponse, PageMetadata } from '@page-share/shared';
import { isValidSlug, kvsKey, metaObjectKey, pagePrefix, userIndexObjectKey } from '@page-share/shared';
import type { AliasStore } from './alias-store.js';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';

export interface DeletePageInput {
  store: PageStore;
  aliasStore: AliasStore;
  ownerSub: string;
  slug: string;
}

export type DeletePageResult =
  | { ok: true; status: 204 }
  | { ok: false; status: 400 | 403 | 500; body: ApiErrorResponse };

export async function deletePage(input: DeletePageInput): Promise<DeletePageResult> {
  if (!isValidSlug(input.slug)) {
    console.log('page_delete_failed', {
      errorCode: 'invalid_slug',
      ownerSub: input.ownerSub,
      slug: input.slug,
    });
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'invalid_slug',
          message: 'slug の形式が不正です',
        },
      },
    };
  }

  const metaKey = metaObjectKey(input.slug);
  const indexKey = userIndexObjectKey(input.ownerSub, input.slug);

  try {
    const metaResult = await input.store.getJson<PageMetadata>(metaKey);
    let visibility: PageMetadata['visibility'] | null = null;

    if (metaResult.ok) {
      if (!isPageMetadata(metaResult.data)) {
        return internalError(input.ownerSub, input.slug);
      }

      if (metaResult.data.ownerSub !== input.ownerSub) {
        console.log('authorization_failed', {
          action: 'delete_page',
          slug: input.slug,
          ownerSub: metaResult.data.ownerSub,
          requesterSub: input.ownerSub,
        });
        return {
          ok: false,
          status: 403,
          body: {
            error: {
              code: 'forbidden',
              message: 'このページを削除する権限がありません',
            },
          },
        };
      }

      visibility = metaResult.data.visibility;
    } else if (metaResult.reason === 'invalid_json') {
      return internalError(input.ownerSub, input.slug);
    }

    const prefixes =
      visibility === null
        ? [pagePrefix('internal', input.slug), pagePrefix('shared', input.slug)]
        : [pagePrefix(visibility, input.slug)];

    const pageKeys: string[] = [];
    for (const prefix of prefixes) {
      const { keys, truncated } = await input.store.listKeys(prefix);
      if (truncated) {
        console.log('page_delete_list_truncated', {
          slug: input.slug,
          ownerSub: input.ownerSub,
          keyCount: keys.length,
        });
      }
      pageKeys.push(...keys);
    }

    if (pageKeys.length > 0) {
      await input.store.deleteObjects(pageKeys);
    }

    if (await input.store.exists(indexKey)) {
      await input.store.deleteObjects([indexKey]);
    }

    if (await input.store.exists(metaKey)) {
      await input.store.deleteObjects([metaKey]);
    }

    if (visibility === null) {
      await Promise.all([
        input.aliasStore.delete(kvsKey('internal', input.slug)).catch(() => undefined),
        input.aliasStore.delete(kvsKey('shared', input.slug)).catch(() => undefined),
      ]);
    } else {
      await input.aliasStore.delete(kvsKey(visibility, input.slug));
    }

    console.log('page_deleted', {
      slug: input.slug,
      ownerSub: input.ownerSub,
    });

    return { ok: true, status: 204 };
  } catch {
    return internalError(input.ownerSub, input.slug);
  }
}

function internalError(ownerSub: string, slug: string): DeletePageResult {
  console.log('page_delete_failed', {
    errorCode: 'internal_error',
    ownerSub,
    slug,
  });
  return {
    ok: false,
    status: 500,
    body: {
      error: {
        code: 'internal_error',
        message: 'ページの削除に失敗しました',
      },
    },
  };
}
