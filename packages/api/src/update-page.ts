import type {
  ApiErrorResponse,
  GetPageResponse,
  PageMetadata,
  Retention,
} from '@page-share/shared';
import {
  isValidSlug,
  metaObjectKey,
  pagePrefix,
  userIndexObjectKey,
  type UserPageIndexEntry,
} from '@page-share/shared';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { computeExpiresAt, retentionObjectTags } from './retention.js';
import { buildViewUrl } from './view-url.js';

export interface UpdatePageInput {
  store: PageStore;
  pagesBaseUrl: string;
  ownerSub: string;
  slug: string;
  body: unknown;
}

export type UpdatePageResult =
  | { ok: true; status: 200; body: GetPageResponse }
  | { ok: false; status: 400 | 403 | 404 | 500; body: ApiErrorResponse };

type ParsedPatchBody = { retention: Retention };

export function parsePatchPageRequestBody(
  raw: unknown,
): { ok: true; body: ParsedPatchBody } | { ok: false; body: ApiErrorResponse } {
  if (typeof raw !== 'object' || raw === null) {
    return invalidRequest('リクエスト body は JSON オブジェクトである必要があります');
  }

  const record = raw as Record<string, unknown>;
  const retention = record['retention'];

  if (retention !== 'temporary' && retention !== 'permanent') {
    return invalidRequest('retention は temporary または permanent を指定してください');
  }

  return { ok: true, body: { retention } };
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

async function applyRetentionTags(
  store: PageStore,
  slug: string,
  ownerSub: string,
  retention: Retention,
): Promise<void> {
  const tags = retentionObjectTags(retention);
  const keysToTag: string[] = [metaObjectKey(slug), userIndexObjectKey(ownerSub, slug)];

  const { keys: pageKeys, truncated } = await store.listKeys(pagePrefix(slug));
  if (truncated) {
    // 1ページ200ファイル上限なので通常は収まるが、黙って切り捨てない
    console.log('page_update_tags_truncated', { slug, ownerSub, keyCount: pageKeys.length });
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
        console.log('page_update_failed', {
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

      console.log('page_update_failed', {
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
            message: 'ページの更新に失敗しました',
          },
        },
      };
    }

    if (!isPageMetadata(result.data)) {
      console.log('page_update_failed', {
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
            message: 'ページの更新に失敗しました',
          },
        },
      };
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

    // 論理期限を過ぎていても retention 変更は許す。
    // Lifecycle による物理削除までは猶予があり、その間に permanent へ変えて救える。
    // ただし Lifecycle が既に走っていればファイルは戻らない。
    const retention = parsed.body.retention;
    const createdAt = new Date(metadata.createdAt);
    const expiresAt = computeExpiresAt(retention, createdAt);

    const updatedMetadata: PageMetadata = {
      ...metadata,
      retention,
      expiresAt,
    };

    const indexKey = userIndexObjectKey(input.ownerSub, input.slug);
    const indexResult = await input.store.getJson<UserPageIndexEntry>(indexKey);
    let indexEntry: UserPageIndexEntry;

    if (indexResult.ok && isUserPageIndexEntry(indexResult.data)) {
      indexEntry = {
        ...indexResult.data,
        retention,
        expiresAt,
      };
    } else {
      // インデックスが欠けていても metadata 更新は続行する
      indexEntry = {
        slug: metadata.slug,
        retention,
        createdAt: metadata.createdAt,
        expiresAt,
        fileCount: metadata.fileCount,
        totalSize: metadata.totalSize,
      };
    }

    await input.store.putJson(metaKey, updatedMetadata);
    await input.store.putJson(indexKey, indexEntry);
    await applyRetentionTags(input.store, input.slug, input.ownerSub, retention);

    console.log('page_retention_updated', {
      slug: input.slug,
      ownerSub: input.ownerSub,
      retention,
    });

    return {
      ok: true,
      status: 200,
      body: {
        ...updatedMetadata,
        viewUrl: buildViewUrl(input.pagesBaseUrl, updatedMetadata.slug),
      },
    };
  } catch {
    console.log('page_update_failed', {
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
          message: 'ページの更新に失敗しました',
        },
      },
    };
  }
}
