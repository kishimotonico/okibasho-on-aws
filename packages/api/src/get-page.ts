import type { ApiErrorResponse, GetPageResponse, PageMetadata } from '@page-share/shared';
import { computeExpiresAt, isValidSlug, metaObjectKey } from '@page-share/shared';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { buildViewUrl } from './view-url.js';

export interface GetPageInput {
  store: PageStore;
  pagesBaseUrl: string;
  shareBaseUrl: string;
  ownerSub: string;
  slug: string;
}

export type GetPageResult =
  | { ok: true; status: 200; body: GetPageResponse }
  | { ok: false; status: 400 | 403 | 404 | 500; body: ApiErrorResponse };

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

      return internalError(input.ownerSub, input.slug);
    }

    if (!isPageMetadata(result.data)) {
      return internalError(input.ownerSub, input.slug);
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

    const expiresAt = computeExpiresAt(metadata.retention, new Date(metadata.contentUpdatedAt));

    console.log('page_retrieved', {
      slug: input.slug,
      ownerSub: input.ownerSub,
    });

    return {
      ok: true,
      status: 200,
      body: {
        ...metadata,
        viewUrl: buildViewUrl(
          input.pagesBaseUrl,
          input.shareBaseUrl,
          metadata.visibility,
          metadata.slug,
        ),
        expiresAt,
      },
    };
  } catch {
    return internalError(input.ownerSub, input.slug);
  }
}

function internalError(ownerSub: string, slug: string): GetPageResult {
  console.log('page_get_failed', {
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
        message: 'ページの取得に失敗しました',
      },
    },
  };
}
