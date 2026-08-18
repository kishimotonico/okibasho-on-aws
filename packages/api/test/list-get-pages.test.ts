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

function makeMarker(slug: string, overrides?: Partial<UserPageIndexEntry>): UserPageIndexEntry {
  return {
    slug,
    createdAt: overrides?.createdAt ?? '2026-08-01T00:00:00.000Z',
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

function seedListedPage(
  store: FakePageStore,
  slug: string,
  overrides?: { metadata?: Partial<PageMetadata>; marker?: Partial<UserPageIndexEntry> },
): void {
  store.objects.set(metaObjectKey(slug), makeMetadata(slug, overrides?.metadata));
  store.objects.set(userIndexObjectKey(OWNER_SUB, slug), makeMarker(slug, overrides?.marker));
}

describe('listPages', () => {
  it('自分のページだけが返り、createdAt 降順で viewUrl が正しい', async () => {
    const store = new FakePageStore();
    seedListedPage(store, 'older-page', {
      metadata: { createdAt: '2026-08-01T00:00:00.000Z' },
      marker: { createdAt: '2026-08-01T00:00:00.000Z' },
    });
    seedListedPage(store, 'newer-page', {
      metadata: { createdAt: '2026-08-10T00:00:00.000Z' },
      marker: { createdAt: '2026-08-10T00:00:00.000Z' },
    });
    store.objects.set(userIndexObjectKey(OTHER_SUB, 'other-page'), makeMarker('other-page'));
    store.objects.set(
      metaObjectKey('other-page'),
      makeMetadata('other-page', { ownerSub: OTHER_SUB }),
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

    expect(result.body.pages).toHaveLength(2);
    expect(result.body.pages.map((page) => page.slug)).toEqual(['newer-page', 'older-page']);
    expect(result.body.pages[0]?.viewUrl).toBe('https://pages.example.com/p/newer-page/');
    expect(result.body.pages[1]?.viewUrl).toBe('https://pages.example.com/p/older-page/');
  });

  it('meta/ の内容が反映される（retention 変更後の値が一覧に出る）', async () => {
    const store = new FakePageStore();
    seedListedPage(store, 'patched-page', {
      metadata: { retention: 'permanent', expiresAt: null },
    });

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.pages[0]?.retention).toBe('permanent');
    expect(result.body.pages[0]?.expiresAt).toBe(null);
  });

  it('期限切れページも expiresAt 付きで含める', async () => {
    const store = new FakePageStore();
    seedListedPage(store, 'expired-page', {
      metadata: { expiresAt: '2020-01-01T00:00:00.000Z' },
    });

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

  it('meta/ が無いマーカーは一覧から落ち、マーカーが削除される', async () => {
    const store = new FakePageStore();
    const orphanKey = userIndexObjectKey(OWNER_SUB, 'orphan-page');
    store.objects.set(orphanKey, makeMarker('orphan-page'));
    seedListedPage(store, 'good-page');

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
    expect(store.objects.has(orphanKey)).toBe(false);

    expect(logSpy).toHaveBeenCalledWith(
      'page_list_orphan_marker_deleted',
      expect.objectContaining({ slug: 'orphan-page', ownerSub: OWNER_SUB }),
    );
    logSpy.mockRestore();
  });

  it('マーカー削除に失敗しても一覧が返る', async () => {
    const store = new FakePageStore();
    const orphanKey = userIndexObjectKey(OWNER_SUB, 'orphan-page');
    store.objects.set(orphanKey, makeMarker('orphan-page'));
    seedListedPage(store, 'good-page');
    store.failDeleteKeys.add(orphanKey);

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
    expect(store.objects.has(orphanKey)).toBe(true);

    expect(logSpy).toHaveBeenCalledWith(
      'page_list_orphan_marker_delete_failed',
      expect.objectContaining({ slug: 'orphan-page' }),
    );
    logSpy.mockRestore();
  });

  it('meta の ownerSub が呼び出し元と違うとき一覧に含めず、マーカーを消さない', async () => {
    const store = new FakePageStore();
    const markerKey = userIndexObjectKey(OWNER_SUB, 'wrong-owner-page');
    store.objects.set(markerKey, makeMarker('wrong-owner-page'));
    store.objects.set(
      metaObjectKey('wrong-owner-page'),
      makeMetadata('wrong-owner-page', { ownerSub: OTHER_SUB }),
    );

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
    expect(result.body.pages).toHaveLength(0);
    expect(store.objects.has(markerKey)).toBe(true);

    expect(logSpy).toHaveBeenCalledWith(
      'page_list_owner_mismatch',
      expect.objectContaining({
        slug: 'wrong-owner-page',
        ownerSub: OWNER_SUB,
        metadataOwnerSub: OTHER_SUB,
      }),
    );
    logSpy.mockRestore();
  });

  it('壊れた meta JSON が1件あってもそれ以外が返る', async () => {
    const store = new FakePageStore();
    const brokenSlug = 'broken-page';
    store.objects.set(userIndexObjectKey(OWNER_SUB, brokenSlug), makeMarker(brokenSlug));
    store.invalidJsonKeys.add(metaObjectKey(brokenSlug));
    seedListedPage(store, 'good-page');
    store.listResult = {
      keys: [userIndexObjectKey(OWNER_SUB, brokenSlug), userIndexObjectKey(OWNER_SUB, 'good-page')],
      truncated: false,
    };

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
      'page_list_meta_skipped',
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
    seedListedPage(store, 'listed-page');

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
