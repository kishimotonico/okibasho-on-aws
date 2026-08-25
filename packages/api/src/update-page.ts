import type {
  ApiErrorResponse,
  GetPageResponse,
  PageMetadata,
  Retention,
} from '@page-share/shared';
import {
  computeExpiresAt,
  expiresAtEpochSeconds,
  isValidSlug,
  kvsKey,
  metaObjectKey,
  pagePrefix,
  userIndexObjectKey,
  validateTitle,
} from '@page-share/shared';
import type { AliasStore } from './alias-store.js';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { retentionObjectTags } from './retention.js';
import { buildViewUrl } from './view-url.js';

export interface UpdatePageInput {
  store: PageStore;
  aliasStore: AliasStore;
  pagesBaseUrl: string;
  shareBaseUrl: string;
  ownerSub: string;
  slug: string;
  body: unknown;
}

export type UpdatePageResult =
  | { ok: true; status: 200; body: GetPageResponse }
  | { ok: false; status: 400 | 403 | 404 | 500; body: ApiErrorResponse };

type ParsedPatchBody = {
  retention?: Retention;
  title?: string;
};

export function parsePatchPageRequestBody(
  raw: unknown,
): { ok: true; body: ParsedPatchBody } | { ok: false; body: ApiErrorResponse } {
  if (typeof raw !== 'object' || raw === null) {
    return invalidRequest('リクエスト body は JSON オブジェクトである必要があります');
  }

  const record = raw as Record<string, unknown>;
  const body: ParsedPatchBody = {};

  if (record['retention'] !== undefined) {
    if (record['retention'] !== 'temporary' && record['retention'] !== 'permanent') {
      return invalidRequest('retention は temporary または permanent を指定してください');
    }
    body.retention = record['retention'];
  }

  if (record['title'] !== undefined) {
    if (typeof record['title'] !== 'string') {
      return invalidRequest('title は文字列で指定してください');
    }
    const titleError = validateTitle(record['title']);
    if (titleError) {
      return {
        ok: false,
        body: { error: titleError },
      };
    }
    body.title = record['title'];
  }

  if (body.retention === undefined && body.title === undefined) {
    return invalidRequest('retention または title のいずれかを指定してください');
  }

  return { ok: true, body };
}

function invalidRequest(message: string): { ok: false; body: ApiErrorResponse } {
  return {
    ok: false,
    body: {
      error: {
        code: 'invalid_request',
        message,
      },
    },
  };
}

async function applyRetentionTags(
  store: PageStore,
  visibility: PageMetadata['visibility'],
  slug: string,
  ownerSub: string,
  retention: Retention,
): Promise<void> {
  const tags = retentionObjectTags(retention);
  const keysToTag: string[] = [metaObjectKey(slug), userIndexObjectKey(ownerSub, slug)];

  const { keys: pageKeys, truncated } = await store.listKeys(pagePrefix(visibility, slug));
  if (truncated) {
    console.log('page_update_tags_truncated', { slug, keyCount: pageKeys.length });
  }
  keysToTag.push(...pageKeys);

  await Promise.all(keysToTag.map((key) => store.setObjectTags(key, tags)));
}

export async function updatePage(input: UpdatePageInput): Promise<UpdatePageResult> {
  if (!isValidSlug(input.slug)) {
    console.log('page_update_failed', {
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

  const parsed = parsePatchPageRequestBody(input.body);
  if (!parsed.ok) {
    console.log('page_update_failed', {
      errorCode: parsed.body.error.code,
      ownerSub: input.ownerSub,
      slug: input.slug,
    });
    return { ok: false, status: 400, body: parsed.body };
  }

  try {
    const metaKey = metaObjectKey(input.slug);
    const result = await input.store.getJson<PageMetadata>(metaKey);

    if (!result.ok) {
      if (result.reason === 'not_found') {
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
        action: 'patch_page',
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
            message: 'このページを更新する権限がありません',
          },
        },
      };
    }

    const retention = parsed.body.retention ?? metadata.retention;
    const title = parsed.body.title ?? metadata.title;
    const retentionRequested = parsed.body.retention !== undefined;
    const retentionChanged = retentionRequested && retention !== metadata.retention;

    if (retentionChanged) {
      await applyRetentionTags(
        input.store,
        metadata.visibility,
        input.slug,
        input.ownerSub,
        retention,
      );
    }

    const updatedMetadata: PageMetadata = {
      ...metadata,
      retention,
      title,
    };
    await input.store.putJson(metaKey, updatedMetadata);

    if (retentionRequested) {
      const aliasValue = {
        v: updatedMetadata.activeVersionId,
        e: expiresAtEpochSeconds(retention, new Date(updatedMetadata.contentUpdatedAt)),
      };
      await input.aliasStore.put(kvsKey(metadata.visibility, input.slug), aliasValue);
    }

    console.log('page_updated', {
      slug: input.slug,
      ownerSub: input.ownerSub,
      retentionChanged,
      titleChanged: parsed.body.title !== undefined,
    });

    const expiresAt = computeExpiresAt(retention, new Date(updatedMetadata.contentUpdatedAt));

    return {
      ok: true,
      status: 200,
      body: {
        ...updatedMetadata,
        viewUrl: buildViewUrl(
          input.pagesBaseUrl,
          input.shareBaseUrl,
          updatedMetadata.visibility,
          updatedMetadata.slug,
        ),
        expiresAt,
      },
    };
  } catch {
    return internalError(input.ownerSub, input.slug);
  }
}

function internalError(ownerSub: string, slug: string): UpdatePageResult {
  console.log('page_update_failed', {
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
        message: 'ページの更新に失敗しました',
      },
    },
  };
}
