import { describe, expect, it, vi } from 'vitest';

import {
  completePage,
  createPage,
  redeclarePage,
  type FetchFn,
} from '../src/lib/upload-client';

function createFetchMock(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
): FetchFn {
  return vi.fn(handler) as unknown as FetchFn;
}

describe('upload-client', () => {
  it('createPage が POST /pages を呼ぶ', async () => {
    const fetchFn = createFetchMock((url, init) => {
      expect(String(url)).toBe('/api/pages');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer create-token',
        'Content-Type': 'application/json',
      });
      return Response.json({
        slug: 'abcdefghijklmnop',
        versionId: 'qrstuvwxyz123456',
        viewUrl: 'https://pages.example.com/abcdefghijklmnop/',
        uploads: [],
      });
    });

    const result = await createPage(fetchFn, '/api', 'create-token', {
      title: 'Demo',
      visibility: 'internal',
      retention: 'temporary',
      files: [{ path: 'index.html', size: 1 }],
    });

    expect(result.ok).toBe(true);
  });

  it('redeclarePage が PUT /pages/{slug} を呼ぶ', async () => {
    const fetchFn = createFetchMock((url, init) => {
      expect(String(url)).toBe('/api/pages/abcdefghijklmnop');
      expect(init?.method).toBe('PUT');
      return Response.json({
        slug: 'abcdefghijklmnop',
        versionId: 'newversion123456',
        viewUrl: 'https://pages.example.com/abcdefghijklmnop/',
        uploads: [],
      });
    });

    const result = await redeclarePage(fetchFn, '/api', 'token', 'abcdefghijklmnop', {
      files: [{ path: 'index.html', size: 1 }],
    });

    expect(result.ok).toBe(true);
  });

  it('completePage が POST /pages/{slug}/complete を呼ぶ', async () => {
    const fetchFn = createFetchMock((url, init) => {
      expect(String(url)).toBe('/api/pages/abcdefghijklmnop/complete');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(
        JSON.stringify({
          versionId: 'qrstuvwxyz123456',
          files: [{ path: 'index.html', size: 1 }],
        }),
      );
      return Response.json({
        slug: 'abcdefghijklmnop',
        version: 2,
        activeVersionId: 'qrstuvwxyz123456',
        viewUrl: 'https://pages.example.com/abcdefghijklmnop/',
        expiresAt: null,
      });
    });

    const result = await completePage(fetchFn, '/api', 'token', 'abcdefghijklmnop', {
      versionId: 'qrstuvwxyz123456',
      files: [{ path: 'index.html', size: 1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.version).toBe(2);
    }
  });
});
