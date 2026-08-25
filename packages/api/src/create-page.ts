import type {
  ApiErrorBody,
  ApiErrorResponse,
  CreatePageRequest,
  CreatePageResponse,
  DeclaredFile,
  PresignedUpload,
  Visibility,
} from '@page-share/shared';
import {
  contentTypeFromPath,
  DEFAULT_RETENTION,
  DEFAULT_VISIBILITY,
  generateSlug,
  generateVersionId,
  metaObjectKey,
  pageObjectKey,
  validateCreatePageRequest,
  validateUploadPath,
} from '@page-share/shared';
import type { PageStore } from './page-store.js';
import { retentionTaggingHeader } from './retention.js';
import { buildViewUrl } from './view-url.js';

const SLUG_RESERVE_MAX_ATTEMPTS = 5;

export interface CreatePageInput {
  store: PageStore;
  pagesBaseUrl: string;
  shareBaseUrl: string;
  ownerSub: string;
  body: unknown;
  generateSlug: () => string;
  generateVersionId: () => string;
}

export type CreatePageResult =
  | { ok: true; status: 201; body: CreatePageResponse }
  | { ok: false; status: 400 | 500; body: ApiErrorResponse };

type ParsedCreatePageRequest = CreatePageRequest & {
  files: DeclaredFile[];
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

  const files: DeclaredFile[] = [];
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

  if (record['title'] !== undefined) {
    if (typeof record['title'] !== 'string') {
      return invalidRequest('title は文字列で指定してください');
    }
    body.title = record['title'];
  }

  if (record['visibility'] !== undefined) {
    if (record['visibility'] !== 'internal' && record['visibility'] !== 'shared') {
      return invalidRequest('visibility は internal または shared を指定してください');
    }
    body.visibility = record['visibility'];
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

async function buildPresignedUploads(
  store: PageStore,
  visibility: Visibility,
  slug: string,
  versionId: string,
  files: DeclaredFile[],
  retention: typeof DEFAULT_RETENTION,
): Promise<PresignedUpload[]> {
  const tagging = retentionTaggingHeader(retention);
  const uploads: PresignedUpload[] = [];

  for (const file of files) {
    const pathResult = validateUploadPath(file.path);
    if (!pathResult.ok) {
      throw new Error('検証済みでないパスが S3 キー組み立てに渡された');
    }
    const normalizedPath = pathResult.path;
    const contentType = contentTypeFromPath(normalizedPath);
    const key = pageObjectKey(visibility, slug, versionId, normalizedPath);
    const url = await store.presignPut(key, contentType, file.size, tagging);
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

  return uploads;
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

  const visibility = parsed.body.visibility ?? DEFAULT_VISIBILITY;
  const retention = parsed.body.retention ?? DEFAULT_RETENTION;
  const versionId = input.generateVersionId();

  let slug: string | undefined;
  for (let attempt = 0; attempt < SLUG_RESERVE_MAX_ATTEMPTS; attempt++) {
    const candidate = input.generateSlug();
    const taken = await input.store.exists(metaObjectKey(candidate));
    if (!taken) {
      slug = candidate;
      break;
    }
  }

  if (slug === undefined) {
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
    const uploads = await buildPresignedUploads(
      input.store,
      visibility,
      slug,
      versionId,
      parsed.body.files,
      retention,
    );

    console.log('page_declared', {
      slug,
      ownerSub: input.ownerSub,
      visibility,
      versionId,
      fileCount: parsed.body.files.length,
    });

    return {
      ok: true,
      status: 201,
      body: {
        slug,
        versionId,
        viewUrl: buildViewUrl(input.pagesBaseUrl, input.shareBaseUrl, visibility, slug),
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
  generateVersionId,
} as const;
