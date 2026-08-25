import type {
  ApiErrorBody,
  ApiErrorResponse,
  CompletePageRequest,
  CompletePageResponse,
  DeclaredFile,
  PageMetadata,
  UserPageIndexEntry,
  Visibility,
} from '@page-share/shared';
import {
  computeExpiresAt,
  expiresAtEpochSeconds,
  isValidSlug,
  isValidVersionId,
  kvsKey,
  metaObjectKey,
  pageObjectKey,
  userIndexObjectKey,
  validateDeclaredFiles,
  validateTitle,
  validateUploadPath,
} from '@page-share/shared';
import type { AliasStore } from './alias-store.js';
import { isPageMetadata } from './page-metadata.js';
import type { PageStore } from './page-store.js';
import { retentionFromObjectTags, retentionObjectTags } from './retention.js';
import { buildViewUrl } from './view-url.js';
import { reclaimOldVersions } from './version-reclaim.js';

const FILE_VERIFY_CONCURRENCY = 10;

export interface CompletePageInput {
  store: PageStore;
  aliasStore: AliasStore;
  pagesBaseUrl: string;
  shareBaseUrl: string;
  ownerSub: string;
  ownerEmail: string;
  slug: string;
  body: unknown;
  now: () => Date;
}

export type CompletePageResult =
  | { ok: true; status: 200; body: CompletePageResponse }
  | { ok: false; status: 400 | 403 | 404 | 500; body: ApiErrorResponse };

type ParsedCompleteBody = CompletePageRequest & {
  files: DeclaredFile[];
};

export function parseCompletePageRequestBody(
  raw: unknown,
): { ok: true; body: ParsedCompleteBody } | { ok: false; body: ApiErrorResponse } {
  if (typeof raw !== 'object' || raw === null) {
    return invalidRequest('リクエスト body は JSON オブジェクトである必要があります');
  }

  const record = raw as Record<string, unknown>;
  if (typeof record['versionId'] !== 'string') {
    return invalidRequest('versionId は文字列で指定してください');
  }

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

  const body: ParsedCompleteBody = {
    versionId: record['versionId'],
    files,
  };

  if (record['title'] !== undefined) {
    if (typeof record['title'] !== 'string') {
      return invalidRequest('title は文字列で指定してください');
    }
    body.title = record['title'];
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

function sumFileSizes(files: DeclaredFile[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}

function completeResponse(
  metadata: PageMetadata,
  pagesBaseUrl: string,
  shareBaseUrl: string,
): CompletePageResponse {
  const contentUpdatedAt = new Date(metadata.contentUpdatedAt);
  return {
    slug: metadata.slug,
    version: metadata.version,
    activeVersionId: metadata.activeVersionId,
    viewUrl: buildViewUrl(pagesBaseUrl, shareBaseUrl, metadata.visibility, metadata.slug),
    expiresAt: computeExpiresAt(metadata.retention, contentUpdatedAt),
  };
}

async function detectVisibility(
  store: PageStore,
  slug: string,
  versionId: string,
  files: DeclaredFile[],
): Promise<Visibility | null> {
  const firstPath = validateUploadPath(files[0]!.path);
  if (!firstPath.ok) {
    return null;
  }

  const internalKey = pageObjectKey('internal', slug, versionId, firstPath.path);
  const sharedKey = pageObjectKey('shared', slug, versionId, firstPath.path);
  const [internalExists, sharedExists] = await Promise.all([
    store.exists(internalKey),
    store.exists(sharedKey),
  ]);

  if (internalExists && !sharedExists) {
    return 'internal';
  }
  if (sharedExists && !internalExists) {
    return 'shared';
  }
  return null;
}

async function verifyDeclaredFilesExist(
  store: PageStore,
  visibility: Visibility,
  slug: string,
  versionId: string,
  files: DeclaredFile[],
): Promise<boolean> {
  for (let i = 0; i < files.length; i += FILE_VERIFY_CONCURRENCY) {
    const batch = files.slice(i, i + FILE_VERIFY_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (file) => {
        const pathResult = validateUploadPath(file.path);
        if (!pathResult.ok) {
          return false;
        }
        return store.exists(pageObjectKey(visibility, slug, versionId, pathResult.path));
      }),
    );
    if (!results.every(Boolean)) {
      return false;
    }
  }
  return true;
}

async function inferRetentionFromVersion(
  store: PageStore,
  visibility: Visibility,
  slug: string,
  versionId: string,
  files: DeclaredFile[],
): Promise<'temporary' | 'permanent'> {
  const firstPath = validateUploadPath(files[0]!.path);
  if (!firstPath.ok) {
    return 'temporary';
  }
  const key = pageObjectKey(visibility, slug, versionId, firstPath.path);
  const tags = await store.getObjectTags(key);
  return retentionFromObjectTags(tags);
}

async function applyRetentionTagsToDeclaredFiles(
  store: PageStore,
  visibility: Visibility,
  slug: string,
  versionId: string,
  files: DeclaredFile[],
  retention: PageMetadata['retention'],
): Promise<void> {
  const tags = retentionObjectTags(retention);
  for (let i = 0; i < files.length; i += FILE_VERIFY_CONCURRENCY) {
    const batch = files.slice(i, i + FILE_VERIFY_CONCURRENCY);
    await Promise.all(
      batch.map(async (file) => {
        const pathResult = validateUploadPath(file.path);
        if (!pathResult.ok) {
          throw new Error('検証済みでないパスが S3 キー組み立てに渡された');
        }
        await store.setObjectTags(
          pageObjectKey(visibility, slug, versionId, pathResult.path),
          tags,
        );
      }),
    );
  }
}

async function applyRetentionTagsToMetaAndUsers(
  store: PageStore,
  ownerSub: string,
  slug: string,
  retention: PageMetadata['retention'],
): Promise<void> {
  const tags = retentionObjectTags(retention);
  await store.setObjectTags(metaObjectKey(slug), tags);
  await store.setObjectTags(userIndexObjectKey(ownerSub, slug), tags);
}

export async function completePage(input: CompletePageInput): Promise<CompletePageResult> {
  if (!isValidSlug(input.slug)) {
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

  const parsed = parseCompletePageRequestBody(input.body);
  if (!parsed.ok) {
    return { ok: false, status: 400, body: parsed.body };
  }

  if (!isValidVersionId(parsed.body.versionId)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'invalid_version_id',
          message: 'versionId の形式が不正です',
        },
      },
    };
  }

  const validationErrors = validateDeclaredFiles(parsed.body.files);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: 400,
      body: validationErrorResponse(validationErrors),
    };
  }

  const versionId = parsed.body.versionId;
  const fileCount = parsed.body.files.length;
  const totalSize = sumFileSizes(parsed.body.files);
  const now = input.now();
  const nowIso = now.toISOString();

  try {
    const metaResult = await input.store.getJson<PageMetadata>(metaObjectKey(input.slug));

    if (metaResult.ok) {
      if (!isPageMetadata(metaResult.data)) {
        return internalError(input.slug, input.ownerSub);
      }

      const metadata = metaResult.data;
      if (metadata.ownerSub !== input.ownerSub) {
        console.log('authorization_failed', {
          action: 'complete_page',
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
              message: 'このページを完了する権限がありません',
            },
          },
        };
      }

      if (metadata.activeVersionId === versionId) {
        return {
          ok: true,
          status: 200,
          body: completeResponse(metadata, input.pagesBaseUrl, input.shareBaseUrl),
        };
      }

      const filesExist = await verifyDeclaredFilesExist(
        input.store,
        metadata.visibility,
        input.slug,
        versionId,
        parsed.body.files,
      );
      if (!filesExist) {
        return incompleteUpload();
      }

      await applyRetentionTagsToDeclaredFiles(
        input.store,
        metadata.visibility,
        input.slug,
        versionId,
        parsed.body.files,
        metadata.retention,
      );

      const aliasValue = {
        v: versionId,
        e: expiresAtEpochSeconds(metadata.retention, now),
      };
      await input.aliasStore.put(kvsKey(metadata.visibility, input.slug), aliasValue);

      const updatedMetadata: PageMetadata = {
        ...metadata,
        version: metadata.version + 1,
        activeVersionId: versionId,
        contentUpdatedAt: nowIso,
        fileCount,
        totalSize,
      };
      await input.store.putJson(metaObjectKey(input.slug), updatedMetadata);
      await applyRetentionTagsToMetaAndUsers(
        input.store,
        input.ownerSub,
        input.slug,
        metadata.retention,
      );
      await reclaimOldVersions(input.store, metadata.visibility, input.slug, versionId, now);

      console.log('page_completed', {
        slug: input.slug,
        ownerSub: input.ownerSub,
        visibility: metadata.visibility,
        version: updatedMetadata.version,
        versionId,
      });

      return {
        ok: true,
        status: 200,
        body: completeResponse(updatedMetadata, input.pagesBaseUrl, input.shareBaseUrl),
      };
    }

    if (metaResult.reason === 'invalid_json') {
      return internalError(input.slug, input.ownerSub);
    }

    const visibility = await detectVisibility(input.store, input.slug, versionId, parsed.body.files);
    if (visibility === null) {
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

    const filesExist = await verifyDeclaredFilesExist(
      input.store,
      visibility,
      input.slug,
      versionId,
      parsed.body.files,
    );
    if (!filesExist) {
      return incompleteUpload();
    }

    const retention = await inferRetentionFromVersion(
      input.store,
      visibility,
      input.slug,
      versionId,
      parsed.body.files,
    );

    let title = '';
    if (parsed.body.title !== undefined) {
      const titleError = validateTitle(parsed.body.title);
      if (titleError) {
        return {
          ok: false,
          status: 400,
          body: {
            error: titleError,
          },
        };
      }
      title = parsed.body.title;
    }

    const aliasValue = {
      v: versionId,
      e: expiresAtEpochSeconds(retention, now),
    };
    await input.aliasStore.put(kvsKey(visibility, input.slug), aliasValue);

    const metadata: PageMetadata = {
      slug: input.slug,
      title,
      ownerSub: input.ownerSub,
      ownerEmail: input.ownerEmail,
      visibility,
      retention,
      createdAt: nowIso,
      contentUpdatedAt: nowIso,
      version: 1,
      activeVersionId: versionId,
      fileCount,
      totalSize,
    };

    const created = await input.store.putJsonIfAbsent(metaObjectKey(input.slug), metadata);
    if (!created) {
      return internalError(input.slug, input.ownerSub);
    }

    const indexEntry: UserPageIndexEntry = {
      slug: input.slug,
      createdAt: nowIso,
    };
    await input.store.putJson(userIndexObjectKey(input.ownerSub, input.slug), indexEntry);
    await applyRetentionTagsToMetaAndUsers(input.store, input.ownerSub, input.slug, retention);
    await reclaimOldVersions(input.store, visibility, input.slug, versionId, now);

    console.log('page_completed', {
      slug: input.slug,
      ownerSub: input.ownerSub,
      visibility,
      version: 1,
      versionId,
    });

    return {
      ok: true,
      status: 200,
      body: completeResponse(metadata, input.pagesBaseUrl, input.shareBaseUrl),
    };
  } catch {
    return internalError(input.slug, input.ownerSub);
  }
}

function incompleteUpload(): CompletePageResult {
  return {
    ok: false,
    status: 400,
    body: {
      error: {
        code: 'incomplete_upload',
        message: '宣言されたファイルがすべてアップロードされていません',
      },
    },
  };
}

function internalError(slug: string, ownerSub: string): CompletePageResult {
  console.log('page_complete_failed', {
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
        message: 'アップロードの完了に失敗しました',
      },
    },
  };
}
