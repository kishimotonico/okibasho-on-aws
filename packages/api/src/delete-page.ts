import type { ApiErrorResponse, PageMetadata } from '@page-share/shared';
import { isValidSlug, metaObjectKey, pagePrefix, userIndexObjectKey } from '@page-share/shared';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';

export interface DeletePageInput {
  store: PageStore;
  ownerSub: string;
  slug: string;
}

export type DeletePageResult =
  { ok: true; status: 204 } | { ok: false; status: 400 | 403 | 500; body: ApiErrorResponse };

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

    if (metaResult.ok) {
      if (!isPageMetadata(metaResult.data)) {
        console.log('page_delete_failed', {
          errorCode: 'internal_error',
          ownerSub: input.ownerSub,
          slug: input.slug,
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
    } else if (metaResult.reason === 'invalid_json') {
      console.log('page_delete_failed', {
        errorCode: 'internal_error',
        ownerSub: input.ownerSub,
        slug: input.slug,
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
    } else {
      // meta が無いときは users インデックスで所有者を確認する
      const hasIndex = await input.store.exists(indexKey);
      if (!hasIndex) {
        // 冪等: 既に消えていれば何もしない
        return { ok: true, status: 204 };
      }
    }

    const deletedPageKeys: string[] = [];
    let metaDeleted = false;
    let indexDeleted = false;

    try {
      const { keys: pageKeys, truncated } = await input.store.listKeys(pagePrefix(input.slug));
      if (truncated) {
        console.log('page_delete_list_truncated', {
          slug: input.slug,
          ownerSub: input.ownerSub,
          keyCount: pageKeys.length,
        });
      }

      if (pageKeys.length > 0) {
        await input.store.deleteObjects(pageKeys);
        deletedPageKeys.push(...pageKeys);
      }

      if (await input.store.exists(metaKey)) {
        await input.store.deleteObjects([metaKey]);
        metaDeleted = true;
      }

      // users インデックスは所有権の証拠になるので最後に消す。
      // 途中で失敗しても再実行で続きから片付けられる。
      if (await input.store.exists(indexKey)) {
        await input.store.deleteObjects([indexKey]);
        indexDeleted = true;
      }

      console.log('page_deleted', {
        slug: input.slug,
        ownerSub: input.ownerSub,
      });

      return { ok: true, status: 204 };
    } catch (error) {
      console.log('page_delete_partial', {
        slug: input.slug,
        ownerSub: input.ownerSub,
        deletedPageKeys,
        metaDeleted,
        indexDeleted,
        errorCode: 'internal_error',
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
  } catch {
    console.log('page_delete_failed', {
      errorCode: 'internal_error',
      ownerSub: input.ownerSub,
      slug: input.slug,
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
}
