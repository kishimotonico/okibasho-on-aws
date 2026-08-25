import type {
  ApiErrorResponse,
  GetPageResponse,
  ListPagesResponse,
  Retention,
} from '@page-share/shared';

export type FetchFn = typeof fetch;

export interface PagesSuccess<T> {
  ok: true;
  status: number;
  body: T;
}

export interface PagesError {
  ok: false;
  status: number;
  body: ApiErrorResponse;
}

export type PagesResult<T> = PagesSuccess<T> | PagesError;

function normalizeApiUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as unknown;
}

function authHeaders(idToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${idToken}`,
  };
}

export async function listPages(
  fetchFn: FetchFn,
  apiBaseUrl: string,
  idToken: string,
): Promise<PagesResult<ListPagesResponse>> {
  const response = await fetchFn(`${normalizeApiUrl(apiBaseUrl)}/pages`, {
    headers: authHeaders(idToken),
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: body as ApiErrorResponse,
    };
  }

  return {
    ok: true,
    status: response.status,
    body: body as ListPagesResponse,
  };
}

export async function updatePageRetention(
  fetchFn: FetchFn,
  apiBaseUrl: string,
  idToken: string,
  slug: string,
  retention: Retention,
): Promise<PagesResult<GetPageResponse>> {
  return patchPage(fetchFn, apiBaseUrl, idToken, slug, { retention });
}

export async function updatePageTitle(
  fetchFn: FetchFn,
  apiBaseUrl: string,
  idToken: string,
  slug: string,
  title: string,
): Promise<PagesResult<GetPageResponse>> {
  return patchPage(fetchFn, apiBaseUrl, idToken, slug, { title });
}

async function patchPage(
  fetchFn: FetchFn,
  apiBaseUrl: string,
  idToken: string,
  slug: string,
  patchBody: { retention?: Retention; title?: string },
): Promise<PagesResult<GetPageResponse>> {
  const response = await fetchFn(`${normalizeApiUrl(apiBaseUrl)}/pages/${slug}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(idToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patchBody),
  });

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: responseBody as ApiErrorResponse,
    };
  }

  return {
    ok: true,
    status: response.status,
    body: responseBody as GetPageResponse,
  };
}

export async function deletePage(
  fetchFn: FetchFn,
  apiBaseUrl: string,
  idToken: string,
  slug: string,
): Promise<PagesResult<null>> {
  const response = await fetchFn(`${normalizeApiUrl(apiBaseUrl)}/pages/${slug}`, {
    method: 'DELETE',
    headers: authHeaders(idToken),
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: body as ApiErrorResponse,
    };
  }

  return {
    ok: true,
    status: response.status,
    body: null,
  };
}
