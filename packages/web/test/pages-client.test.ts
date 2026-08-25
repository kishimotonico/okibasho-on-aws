import { describe, expect, it, vi } from 'vitest';

import { deletePage, listPages, updatePageRetention, updatePageTitle, type FetchFn } from '../src/lib/pages-client';

function createFetchMock(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
): FetchFn {
  return vi.fn(handler) as unknown as FetchFn;
}

describe('pages-client', () => {
  it('一覧取得で Authorization ヘッダが付く', async () => {
    const fetchFn = createFetchMock((_url, init) => {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-token',
      });
      return new Response(JSON.stringify({ pages: [] }), { status: 200 });
    });

    const result = await listPages(fetchFn, '/api', 'test-token');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.pages).toEqual([]);
    }
  });

  it('PATCH が正しいメソッド・パス・body で呼ばれる', async () => {
    const fetchFn = createFetchMock((url, init) => {
      expect(String(url)).toBe('/api/pages/demo-page');
      expect(init?.method).toBe('PATCH');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer patch-token',
        'Content-Type': 'application/json',
      });
      expect(init?.body).toBe(JSON.stringify({ retention: 'permanent' }));
      return new Response(
        JSON.stringify({
          slug: 'demo-page',
          retention: 'permanent',
          expiresAt: null,
        }),
        { status: 200 },
      );
    });

    const result = await updatePageRetention(
      fetchFn,
      '/api',
      'patch-token',
      'demo-page',
      'permanent',
    );
    expect(result.ok).toBe(true);
  });

  it('title 更新が PATCH で送られる', async () => {
    const fetchFn = createFetchMock((url, init) => {
      expect(String(url)).toBe('/api/pages/demo-page');
      expect(init?.method).toBe('PATCH');
      expect(init?.body).toBe(JSON.stringify({ title: 'New title' }));
      return new Response(
        JSON.stringify({
          slug: 'demo-page',
          title: 'New title',
          retention: 'temporary',
          expiresAt: '2026-09-01T00:00:00.000Z',
        }),
        { status: 200 },
      );
    });

    const result = await updatePageTitle(fetchFn, '/api', 'patch-token', 'demo-page', 'New title');
    expect(result.ok).toBe(true);
  });

  it('DELETE が正しいメソッドとパスで呼ばれる', async () => {
    const fetchFn = createFetchMock((url, init) => {
      expect(String(url)).toBe('/api/pages/remove-me');
      expect(init?.method).toBe('DELETE');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer delete-token',
      });
      return new Response(null, { status: 204 });
    });

    const result = await deletePage(fetchFn, '/api', 'delete-token', 'remove-me');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(204);
      expect(result.body).toBeNull();
    }
  });

  it('403 / 404 / 410 / 401 を区別して返す', async () => {
    const cases = [
      { status: 403, code: 'forbidden' },
      { status: 404, code: 'page_not_found' },
      { status: 410, code: 'page_expired' },
      { status: 401, code: 'unauthorized' },
    ] as const;

    for (const testCase of cases) {
      const fetchFn = createFetchMock(() => {
        return new Response(
          JSON.stringify({
            error: { code: testCase.code, message: `${testCase.status} error` },
          }),
          { status: testCase.status },
        );
      });

      const result = await listPages(fetchFn, '/api', 'token');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(testCase.status);
        expect(result.body.error.code).toBe(testCase.code);
      }
    }
  });
});
