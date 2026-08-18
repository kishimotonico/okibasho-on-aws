import type {
  ApiErrorResponse,
  GetPageResponse,
  PageMetadata,
  Retention,
} from '@page-share/shared';
import { isValidSlug, metaObjectKey, pagePrefix } from '@page-share/shared';
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

async function applyRetentionTags(
  store: PageStore,
  slug: string,
  retention: Retention,
): Promise<void> {
  const tags = retentionObjectTags(retention);
  const keysToTag: string[] = [metaObjectKey(slug)];

  const { keys: pageKeys, truncated } = await store.listKeys(pagePrefix(slug));
  if (truncated) {
    // 1ページ200ファイル上限なので通常は収まるが、黙って切り捨てない
    console.log('page_update_tags_truncated', { slug, keyCount: pageKeys.length });
  }
  keysToTag.push(...pageKeys);

  // users/ マーカーには Lifecycle 用タグを付けない。
  // temporary ページが物理削除されたあとマーカーだけ残るが、一覧の lazy cleanup が掃除する。
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

    // 可変データは meta/ だけを更新する。users/ マーカーは触らない。
    await input.store.putJson(metaKey, updatedMetadata);
    await applyRetentionTags(input.store, input.slug, retention);

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
