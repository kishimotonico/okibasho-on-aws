import type {
  ApiErrorResponse,
  CompletePageRequest,
  CompletePageResponse,
  CreatePageRequest,
  CreatePageResponse,
} from '@page-share/shared';

export type FetchFn = typeof fetch;

export interface CreatePageResult {
  ok: true;
  body: CreatePageResponse;
}

export interface CreatePageError {
  ok: false;
  status: number;
  body: ApiErrorResponse;
}

export type CreatePageResponseResult = CreatePageResult | CreatePageError;

export interface CompletePageResult {
  ok: true;
  body: CompletePageResponse;
}

export interface CompletePageError {
  ok: false;
  status: number;
  body: ApiErrorResponse;
}

export type CompletePageResponseResult = CompletePageResult | CompletePageError;

export interface PutFileResult {
  ok: true;
}

export interface PutFileError {
  ok: false;
  status: number;
  statusText: string;
}

export type PutFileResponseResult = PutFileResult | PutFileError;

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

export async function createPage(
  fetchFn: FetchFn,
  apiUrl: string,
  idToken: string,
  body: CreatePageRequest,
): Promise<CreatePageResponseResult> {
  const response = await fetchFn(`${normalizeApiUrl(apiUrl)}/api/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody: unknown = await response.json();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: responseBody as ApiErrorResponse,
    };
  }

  return {
    ok: true,
    body: responseBody as CreatePageResponse,
  };
}

export async function completePage(
  fetchFn: FetchFn,
  apiUrl: string,
  idToken: string,
  slug: string,
  body: CompletePageRequest,
): Promise<CompletePageResponseResult> {
  const response = await fetchFn(`${normalizeApiUrl(apiUrl)}/api/pages/${slug}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody: unknown = await response.json();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: responseBody as ApiErrorResponse,
    };
  }

  return {
    ok: true,
    body: responseBody as CompletePageResponse,
  };
}

export async function putFile(
  fetchFn: FetchFn,
  url: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<PutFileResponseResult> {
  // presigned PUT の署名に content-type / content-length が含まれるため、
  // API が返した headers をそのまま送らないと S3 が拒否する
  const response = await fetchFn(url, {
    method: 'PUT',
    headers,
    body,
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
    };
  }

  return { ok: true };
}

const DEFAULT_UPLOAD_CONCURRENCY = 4;

export async function uploadFilesWithConcurrency(
  fetchFn: FetchFn,
  uploads: Array<{
    path: string;
    url: string;
    headers: Record<string, string>;
    readBody: () => Promise<Buffer>;
  }>,
  concurrency = DEFAULT_UPLOAD_CONCURRENCY,
): Promise<{ path: string; error: PutFileError } | null> {
  let nextIndex = 0;
  let failure: { path: string; error: PutFileError } | null = null;

  async function worker(): Promise<void> {
    while (nextIndex < uploads.length) {
      if (failure) {
        return;
      }

      const currentIndex = nextIndex++;
      const upload = uploads[currentIndex];
      if (!upload) {
        return;
      }

      const fileBody = await upload.readBody();
      const result = await putFile(fetchFn, upload.url, upload.headers, fileBody);
      if (!result.ok) {
        failure = { path: upload.path, error: result };
        return;
      }
    }
  }

  const workerCount = Math.min(concurrency, uploads.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return failure;
}
