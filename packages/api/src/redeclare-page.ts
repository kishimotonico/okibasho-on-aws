import type {
  ApiErrorBody,
  ApiErrorResponse,
  PageMetadata,
  PresignedUpload,
  RedeclarePageRequest,
  RedeclarePageResponse,
} from '@page-share/shared';
import {
  contentTypeFromPath,
  generateVersionId,
  isValidSlug,
  metaObjectKey,
  pageObjectKey,
  validateDeclaredFiles,
  validateUploadPath,
} from '@page-share/shared';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { retentionTaggingHeader } from './retention.js';
import { buildViewUrl } from './view-url.js';

export interface RedeclarePageInput {
  store: PageStore;
  pagesBaseUrl: string;
  shareBaseUrl: string;
  ownerSub: string;
  slug: string;
  body: unknown;
  generateVersionId: () => string;
}

export type RedeclarePageResult =
  | { ok: true; status: 200; body: RedeclarePageResponse }
  | { ok: false; status: 400 | 403 | 404 | 500; body: ApiErrorResponse };

type ParsedRedeclareBody = RedeclarePageRequest & {
  files: Array<{ path: string; size: number }>;
};

export function parseRedeclarePageRequestBody(
  raw: unknown,
): { ok: true; body: ParsedRedeclareBody } | { ok: false; body: ApiErrorResponse } {
  if (typeof raw !== 'object' || raw === null) {
    return invalidRequest('リクエスト body は JSON オブジェクトである必要があります');
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record['files'])) {
    return invalidRequest('files は配列で指定してください');
  }

  const files: Array<{ path: string; size: number }> = [];
  for (const item of record['files']) {
    if (typeof item !== 'object' || item === null) {
      return invalidRequest('files の各要素はオブジェクトである必要があります');
    }
    const file = item as Record<string, unknown>;
    if (typeof file['path'] !== 'string' || typeof file['size'] !== 'number') {
      return invalidRequest(
        'files の各要素は { path: string, size: number } の形である必要があります',
      );
    }
    files.push({ path: file['path'], size: file['size'] });
  }

  return { ok: true, body: { files } };
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

function validationErrorResponse(errors: ApiErrorBody[]): ApiErrorResponse {
  const first = errors[0]!;
  return {
    error: {
      code: first.code,
      message: first.message,
      details: errors,
    },
  };
}

export async function redeclarePage(input: RedeclarePageInput): Promise<RedeclarePageResult> {
  if (!isValidSlug(input.slug)) {
    console.log('page_redeclare_failed', {
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

  const parsed = parseRedeclarePageRequestBody(input.body);
  if (!parsed.ok) {
    return { ok: false, status: 400, body: parsed.body };
  }

  const validationErrors = validateDeclaredFiles(parsed.body.files);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: 400,
      body: validationErrorResponse(validationErrors),
    };
  }

  try {
    const metaResult = await input.store.getJson<PageMetadata>(metaObjectKey(input.slug));
    if (!metaResult.ok) {
      if (metaResult.reason === 'not_found') {
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
      return internalError();
    }

    if (!isPageMetadata(metaResult.data)) {
      return internalError();
    }

    const metadata = metaResult.data;
    if (metadata.ownerSub !== input.ownerSub) {
      console.log('authorization_failed', {
        action: 'redeclare_page',
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

    const versionId = input.generateVersionId();
    const tagging = retentionTaggingHeader(metadata.retention);
    const uploads: PresignedUpload[] = [];

    for (const file of parsed.body.files) {
      const pathResult = validateUploadPath(file.path);
      if (!pathResult.ok) {
        throw new Error('検証済みでないパスが S3 キー組み立てに渡された');
      }
      const normalizedPath = pathResult.path;
      const contentType = contentTypeFromPath(normalizedPath);
      const key = pageObjectKey(metadata.visibility, input.slug, versionId, normalizedPath);
      const url = await input.store.presignPut(key, contentType, file.size, tagging);
      uploads.push({
        path: normalizedPath,
        url,
        headers: {
          'content-type': contentType,
          'content-length': String(file.size),
          ...(tagging ? { 'x-amz-tagging': tagging } : {}),
        },
      });
    }

    console.log('page_redeclared', {
      slug: input.slug,
      ownerSub: input.ownerSub,
      visibility: metadata.visibility,
      versionId,
      fileCount: parsed.body.files.length,
    });

    return {
      ok: true,
      status: 200,
      body: {
        slug: input.slug,
        versionId,
        viewUrl: buildViewUrl(
          input.pagesBaseUrl,
          input.shareBaseUrl,
          metadata.visibility,
          input.slug,
        ),
        uploads,
      },
    };
  } catch {
    return internalError();
  }
}

function internalError(): RedeclarePageResult {
  return {
    ok: false,
    status: 500,
    body: {
      error: {
        code: 'internal_error',
        message: '再アップロードの宣言に失敗しました',
      },
    },
  };
}

export const defaultRedeclarePageDeps = {
  generateVersionId,
} as const;
