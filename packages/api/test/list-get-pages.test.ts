import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMetadata, UserPageIndexEntry } from '@page-share/shared';
import { metaObjectKey, userIndexObjectKey } from '@page-share/shared';
import { getPage } from '../src/get-page.js';
import { listPages } from '../src/list-pages.js';
import { FakePageStore } from './fake-page-store.js';

const PAGES_BASE_URL = 'https://pages.example.com';
const OWNER_SUB = 'user-sub-123';
const OTHER_SUB = 'other-sub-456';
const FIXED_NOW = new Date('2026-08-18T10:00:00.000Z');

function makeIndexEntry(slug: string, overrides?: Partial<UserPageIndexEntry>): UserPageIndexEntry {
  return {
    slug,
    retention: 'temporary',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    fileCount: 1,
    totalSize: 100,
    ...overrides,
  };
}

function makeMetadata(slug: string, overrides?: Partial<PageMetadata>): PageMetadata {
  return {
    slug,
    ownerSub: OWNER_SUB,
    ownerEmail: 'user@example.com',
    retention: 'temporary',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    fileCount: 1,
    totalSize: 100,
    ...overrides,
  };
}

describe('listPages', () => {
  it('自分のページだけが返り、createdAt 降順で viewUrl が正しい', async () => {
    const store = new FakePageStore();
    store.objects.set(
      userIndexObjectKey(OWNER_SUB, 'older-page'),
      makeIndexEntry('older-page', { createdAt: '2026-08-01T00:00:00.000Z' }),
    );
    store.objects.set(
      userIndexObjectKey(OWNER_SUB, 'newer-page'),
      makeIndexEntry('newer-page', { createdAt: '2026-08-10T00:00:00.000Z' }),
    );
    store.objects.set(userIndexObjectKey(OTHER_SUB, 'other-page'), makeIndexEntry('other-page'));

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.body.pages).toHaveLength(2);
    expect(result.body.pages.map((page) => page.slug)).toEqual(['newer-page', 'older-page']);
    expect(result.body.pages[0]?.viewUrl).toBe('https://pages.example.com/p/newer-page/');
    expect(result.body.pages[1]?.viewUrl).toBe('https://pages.example.com/p/older-page/');
  });

  it('期限切れページも expiresAt 付きで含める', async () => {
    const store = new FakePageStore();
    store.objects.set(
      userIndexObjectKey(OWNER_SUB, 'expired-page'),
      makeIndexEntry('expired-page', { expiresAt: '2020-01-01T00:00:00.000Z' }),
    );

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.pages).toHaveLength(1);
    expect(result.body.pages[0]?.expiresAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('壊れた JSON が1件あってもそれ以外が返る', async () => {
    const store = new FakePageStore();
    const brokenKey = userIndexObjectKey(OWNER_SUB, 'broken-page');
    const goodKey = userIndexObjectKey(OWNER_SUB, 'good-page');
    store.objects.set(goodKey, makeIndexEntry('good-page'));
    store.invalidJsonKeys.add(brokenKey);
    store.listResult = { keys: [brokenKey, goodKey], truncated: false };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.pages).toHaveLength(1);
    expect(result.body.pages[0]?.slug).toBe('good-page');

    expect(logSpy).toHaveBeenCalledWith(
      'page_list_index_skipped',
      expect.objectContaining({ slug: 'broken-page', reason: 'invalid_json' }),
    );
    logSpy.mockRestore();
  });

  it('0件のとき空配列', async () => {
    const store = new FakePageStore();
    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.pages).toEqual([]);
  });
});

describe('getPage', () => {
  it('正常系: metadata と viewUrl を返す', async () => {
    const store = new FakePageStore();
    store.objects.set(metaObjectKey('my-page'), makeMetadata('my-page'));

    const result = await getPage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'my-page',
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.slug).toBe('my-page');
    expect(result.body.viewUrl).toBe('https://pages.example.com/p/my-page/');
    expect(result.body.ownerSub).toBe(OWNER_SUB);
  });

  it('存在しない slug で 404', async () => {
    const store = new FakePageStore();
    const result = await getPage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'missing-page',
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('page_not_found');
  });

  it('他人のページで 403', async () => {
    const store = new FakePageStore();
    store.objects.set(
      metaObjectKey('other-page'),
      makeMetadata('other-page', { ownerSub: OTHER_SUB }),
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await getPage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'other-page',
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('forbidden');

    expect(logSpy).toHaveBeenCalledWith(
      'authorization_failed',
      expect.objectContaining({
        action: 'get_page',
        slug: 'other-page',
        requesterSub: OWNER_SUB,
      }),
    );
    logSpy.mockRestore();
  });

  it('期限切れで 410', async () => {
    const store = new FakePageStore();
    store.objects.set(
      metaObjectKey('expired-page'),
      makeMetadata('expired-page', { expiresAt: '2020-01-01T00:00:00.000Z' }),
    );

    const result = await getPage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'expired-page',
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(410);
    expect(result.body.error.code).toBe('page_expired');
  });

  it.each(['../escape', 'BadSlug', ''])(
    '不正な slug (%s) で 400 になり S3 キー組み立てに渡らない',
    async (slug) => {
      const store = new FakePageStore();
      const result = await getPage({
        store,
        pagesBaseUrl: PAGES_BASE_URL,
        ownerSub: OWNER_SUB,
        slug,
        now: () => FIXED_NOW,
      });

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('invalid_slug');
      expect(store.getJsonCalls).toEqual([]);
    },
  );
});

describe('handler GET routes', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env['PAGES_BUCKET'] = 'test-bucket';
    process.env['PAGES_BASE_URL'] = PAGES_BASE_URL;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('GET /api/pages で一覧を返す', async () => {
    const store = new FakePageStore();
    store.objects.set(userIndexObjectKey(OWNER_SUB, 'listed-page'), makeIndexEntry('listed-page'));

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'GET', path: '/api/pages' },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
    } as never);

    expect(result).toMatchObject({ statusCode: 200 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0].slug).toBe('listed-page');
  });

  it('GET /api/pages/{slug} で1件取得', async () => {
    const store = new FakePageStore();
    store.objects.set(metaObjectKey('detail-page'), makeMetadata('detail-page'));

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'GET', path: '/api/pages/detail-page' },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
      pathParameters: { slug: 'detail-page' },
    } as never);

    expect(result).toMatchObject({ statusCode: 200 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.slug).toBe('detail-page');
  });

  it('認可失敗(403)がログに記録され、presigned URL やトークンが出ない', async () => {
    const store = new FakePageStore();
    store.objects.set(
      metaObjectKey('secret-page'),
      makeMetadata('secret-page', { ownerSub: OTHER_SUB }),
    );

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);

    const { handler } = await import('../src/handlers/pages.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await handler({
      requestContext: {
        http: { method: 'GET', path: '/api/pages/secret-page' },
        authorizer: {
          jwt: {
            claims: {
              sub: OWNER_SUB,
              email: 'user@example.com',
            },
          },
        },
      },
      pathParameters: { slug: 'secret-page' },
    } as never);

    expect(result).toMatchObject({ statusCode: 403 });
    expect(logSpy).toHaveBeenCalledWith(
      'authorization_failed',
      expect.objectContaining({ action: 'get_page', slug: 'secret-page' }),
    );

    for (const log of logSpy.mock.calls) {
      const serialized = JSON.stringify(log);
      expect(serialized).not.toMatch(/https:\/\/s3\.example\.com/);
      expect(serialized).not.toMatch(/Bearer /);
      expect(serialized).not.toMatch(/eyJ/);
    }
    logSpy.mockRestore();
  });

  it('未対応メソッドは 405', async () => {
    const store = new FakePageStore();
    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'DELETE', path: '/api/pages' },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
    } as never);

    expect(result).toMatchObject({ statusCode: 405 });
  });
});
