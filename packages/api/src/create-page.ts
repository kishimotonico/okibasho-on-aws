import type {
  ApiErrorBody,
  ApiErrorResponse,
  CreatePageRequest,
  CreatePageResponse,
  PageMetadata,
  PresignedUpload,
  Retention,
  UserPageIndexEntry,
} from '@page-share/shared';
import {
  contentTypeFromPath,
  DEFAULT_RETENTION,
  DEFAULT_RETENTION_DAYS,
  generateSlug,
  metaObjectKey,
  pageObjectKey,
  pageViewPath,
  userIndexObjectKey,
  validateCreatePageRequest,
  validateUploadPath,
} from '@page-share/shared';
import type { PageStore } from './page-store.js';

const SLUG_RESERVE_MAX_ATTEMPTS = 5;

export interface CreatePageInput {
  store: PageStore;
  pagesBaseUrl: string;
  ownerSub: string;
  ownerEmail: string;
  body: unknown;
  now: () => Date;
  generateSlug: () => string;
}

export type CreatePageResult =
  | { ok: true; status: 201; body: CreatePageResponse }
  | { ok: false; status: 400 | 409 | 500; body: ApiErrorResponse };

type ParsedCreatePageRequest = CreatePageRequest & {
  files: Array<{ path: string; size: number }>;
};

export function parseCreatePageRequestBody(
  raw: unknown,
): { ok: true; body: ParsedCreatePageRequest } | { ok: false; body: ApiErrorResponse } {
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

  const body: ParsedCreatePageRequest = { files };

  if (record['slug'] !== undefined) {
    if (typeof record['slug'] !== 'string') {
      return invalidRequest('slug は文字列で指定してください');
    }
    body.slug = record['slug'];
  }

  if (record['retention'] !== undefined) {
    if (record['retention'] !== 'temporary' && record['retention'] !== 'permanent') {
      return invalidRequest('retention は temporary または permanent を指定してください');
    }
    body.retention = record['retention'];
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

function buildViewUrl(pagesBaseUrl: string, slug: string): string {
  const base = pagesBaseUrl.endsWith('/') ? pagesBaseUrl.slice(0, -1) : pagesBaseUrl;
  return `${base}${pageViewPath(slug)}`;
}

function computeExpiresAt(retention: Retention, createdAt: Date): string | null {
  if (retention === 'permanent') {
    return null;
  }
  const expires = new Date(createdAt);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

function sumFileSizes(files: Array<{ size: number }>): number {
  return files.reduce((total, file) => total + file.size, 0);
}

export async function createPage(input: CreatePageInput): Promise<CreatePageResult> {
  const parsed = parseCreatePageRequestBody(input.body);
  if (!parsed.ok) {
    console.log('page_create_failed', {
      errorCode: parsed.body.error.code,
      ownerSub: input.ownerSub,
    });
    return { ok: false, status: 400, body: parsed.body };
  }

  const validationErrors = validateCreatePageRequest(parsed.body);
  if (validationErrors.length > 0) {
    console.log('page_create_failed', {
      errorCode: validationErrors[0]!.code,
      ownerSub: input.ownerSub,
    });
    return {
      ok: false,
      status: 400,
      body: validationErrorResponse(validationErrors),
    };
  }

  const retention = parsed.body.retention ?? DEFAULT_RETENTION;
  const createdAt = input.now();
  const createdAtIso = createdAt.toISOString();
  const expiresAt = computeExpiresAt(retention, createdAt);
  const fileCount = parsed.body.files.length;
  const totalSize = sumFileSizes(parsed.body.files);
  const slugWasSpecified = parsed.body.slug !== undefined;

  let slug = parsed.body.slug;
  let reserved = false;

  for (let attempt = 0; attempt < SLUG_RESERVE_MAX_ATTEMPTS; attempt++) {
    if (slug === undefined) {
      slug = input.generateSlug();
    }

    const metadata: PageMetadata = {
      slug,
      ownerSub: input.ownerSub,
      ownerEmail: input.ownerEmail,
      retention,
      createdAt: createdAtIso,
      expiresAt,
      fileCount,
      totalSize,
    };

    const reservedNow = await input.store.putJsonIfAbsent(metaObjectKey(slug), metadata);
    if (reservedNow) {
      reserved = true;
      break;
    }

    if (slugWasSpecified) {
      console.log('page_create_failed', {
        errorCode: 'slug_taken',
        ownerSub: input.ownerSub,
        slug,
      });
      return {
        ok: false,
        status: 409,
        body: {
          error: {
            code: 'slug_taken',
            message: `slug は既に使われています: ${slug}`,
          },
        },
      };
    }

    slug = undefined;
  }

  if (!reserved || slug === undefined) {
    console.log('page_create_failed', {
      errorCode: 'internal_error',
      ownerSub: input.ownerSub,
    });
    return {
      ok: false,
      status: 500,
      body: {
        error: {
          code: 'internal_error',
          message: 'slug の確保に失敗しました。しばらくしてから再試行してください',
        },
      },
    };
  }

  try {
    const indexEntry: UserPageIndexEntry = {
      slug,
      retention,
      createdAt: createdAtIso,
      expiresAt,
      fileCount,
      totalSize,
    };
    await input.store.putJson(userIndexObjectKey(input.ownerSub, slug), indexEntry);

    const uploads: PresignedUpload[] = [];
    for (const file of parsed.body.files) {
      const pathResult = validateUploadPath(file.path);
      if (!pathResult.ok) {
        // validateCreatePageRequest を通っていればここには来ない。
        // 万一来たら未検証のパスでS3キーを組み立てることになるので、握りつぶさず落とす
        throw new Error('検証済みでないパスが S3 キー組み立てに渡された');
      }
      const normalizedPath = pathResult.path;
      const contentType = contentTypeFromPath(normalizedPath);
      const key = pageObjectKey(slug, normalizedPath);
      const url = await input.store.presignPut(key, contentType, file.size);
      uploads.push({
        path: normalizedPath,
        url,
        headers: {
          'content-type': contentType,
          'content-length': String(file.size),
        },
      });
    }

    console.log('page_created', {
      slug,
      ownerSub: input.ownerSub,
      fileCount,
      totalSize,
    });

    return {
      ok: true,
      status: 201,
      body: {
        slug,
        viewUrl: buildViewUrl(input.pagesBaseUrl, slug),
        expiresAt,
        uploads,
      },
    };
  } catch {
    console.log('page_create_failed', {
      errorCode: 'internal_error',
      ownerSub: input.ownerSub,
      slug,
    });
    return {
      ok: false,
      status: 500,
      body: {
        error: {
          code: 'internal_error',
          message: 'ページの作成に失敗しました',
        },
      },
    };
  }
}

/** ハンドラのデフォルト依存（テストでは差し替える） */
export const defaultCreatePageDeps = {
  generateSlug,
} as const;
