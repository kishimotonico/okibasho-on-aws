import type {
  ApiErrorResponse,
  CompletePageRequest,
  CompletePageResponse,
  CreatePageRequest,
  CreatePageResponse,
  RedeclarePageRequest,
  RedeclarePageResponse,
} from '@page-share/shared';

import { preparePresignedPutHeaders } from './presigned-headers.js';

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

export interface RedeclarePageResult {
  ok: true;
  body: RedeclarePageResponse;
}

export interface RedeclarePageError {
  ok: false;
  status: number;
  body: ApiErrorResponse;
}

export type RedeclarePageResponseResult = RedeclarePageResult | RedeclarePageError;

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
  apiBaseUrl: string,
  idToken: string,
  body: CreatePageRequest,
): Promise<CreatePageResponseResult> {
  const response = await fetchFn(`${normalizeApiUrl(apiBaseUrl)}/pages`, {
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

export async function redeclarePage(
  fetchFn: FetchFn,
  apiBaseUrl: string,
  idToken: string,
  slug: string,
  body: RedeclarePageRequest,
): Promise<RedeclarePageResponseResult> {
  const response = await fetchFn(`${normalizeApiUrl(apiBaseUrl)}/pages/${slug}`, {
    method: 'PUT',
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
    body: responseBody as RedeclarePageResponse,
  };
}

export async function completePage(
  fetchFn: FetchFn,
  apiBaseUrl: string,
  idToken: string,
  slug: string,
  body: CompletePageRequest,
): Promise<CompletePageResponseResult> {
  const response = await fetchFn(`${normalizeApiUrl(apiBaseUrl)}/pages/${slug}/complete`, {
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
  body: Blob,
): Promise<PutFileResponseResult> {
  const response = await fetchFn(url, {
    method: 'PUT',
    headers: preparePresignedPutHeaders(headers),
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

export interface UploadProgress {
  completed: number;
  total: number;
}

export async function uploadFilesWithConcurrency(
  fetchFn: FetchFn,
  uploads: Array<{
    path: string;
    url: string;
    headers: Record<string, string>;
    file: Blob;
  }>,
  options: {
    concurrency?: number;
    onProgress?: (progress: UploadProgress) => void;
  } = {},
): Promise<{ path: string; error: PutFileError } | null> {
  const concurrency = options.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY;
  let nextIndex = 0;
  let completed = 0;
  let failure: { path: string; error: PutFileError } | null = null;

  const reportProgress = () => {
    options.onProgress?.({ completed, total: uploads.length });
  };

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

      const result = await putFile(fetchFn, upload.url, upload.headers, upload.file);
      completed++;
      reportProgress();

      if (!result.ok) {
        failure = { path: upload.path, error: result };
        return;
      }
    }
  }

  reportProgress();
  const workerCount = Math.min(concurrency, uploads.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return failure;
}
