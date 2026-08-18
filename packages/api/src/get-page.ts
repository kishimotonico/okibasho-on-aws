import type { ApiErrorResponse, GetPageResponse, PageMetadata } from '@page-share/shared';
import { isValidSlug, metaObjectKey } from '@page-share/shared';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { buildViewUrl } from './view-url.js';

export interface GetPageInput {
  store: PageStore;
  pagesBaseUrl: string;
  ownerSub: string;
  slug: string;
  now: () => Date;
}

export type GetPageResult =
  | { ok: true; status: 200; body: GetPageResponse }
  | { ok: false; status: 400 | 403 | 404 | 410 | 500; body: ApiErrorResponse };

function isExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) {
    return false;
  }
  return new Date(expiresAt).getTime() <= now.getTime();
}

export async function getPage(input: GetPageInput): Promise<GetPageResult> {
  if (!isValidSlug(input.slug)) {
    console.log('page_get_failed', {
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

  try {
    const result = await input.store.getJson<PageMetadata>(metaObjectKey(input.slug));

    if (!result.ok) {
      if (result.reason === 'not_found') {
        console.log('page_get_failed', {
          errorCode: 'page_not_found',
          ownerSub: input.ownerSub,
          slug: input.slug,
        });
        return {
          ok: false,
          status: 404,
          body: {
            error: {
              code: 'page_not_found',
              message: 'ページが見つかりません',
            },
          },
        };
      }

      console.log('page_get_failed', {
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
            message: 'ページの取得に失敗しました',
          },
        },
      };
    }

    if (!isPageMetadata(result.data)) {
      console.log('page_get_failed', {
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
            message: 'ページの取得に失敗しました',
          },
        },
      };
    }

    const metadata = result.data;

    if (metadata.ownerSub !== input.ownerSub) {
      console.log('authorization_failed', {
        action: 'get_page',
        slug: input.slug,
        ownerSub: metadata.ownerSub,
        requesterSub: input.ownerSub,
      });
      return {
        ok: false,
        status: 403,
        body: {
          error: {
            code: 'forbidden',
            message: 'このページにアクセスする権限がありません',
          },
        },
      };
    }

    if (isExpired(metadata.expiresAt, input.now())) {
      console.log('page_get_failed', {
        errorCode: 'page_expired',
        ownerSub: input.ownerSub,
        slug: input.slug,
      });
      return {
        ok: false,
        status: 410,
        body: {
          error: {
            code: 'page_expired',
            message: 'ページの有効期限が切れています',
          },
        },
      };
    }

    console.log('page_retrieved', {
      slug: input.slug,
      ownerSub: input.ownerSub,
    });

    return {
      ok: true,
      status: 200,
      body: {
        ...metadata,
        viewUrl: buildViewUrl(input.pagesBaseUrl, metadata.slug),
      },
    };
  } catch {
    console.log('page_get_failed', {
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
          message: 'ページの取得に失敗しました',
        },
      },
    };
  }
}
