import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMetadata, UserPageIndexEntry } from '@page-share/shared';
import {
  DEFAULT_RETENTION_DAYS,
  metaObjectKey,
  pageObjectKey,
  userIndexObjectKey,
} from '@page-share/shared';
import { deletePage } from '../src/delete-page.js';
import { RETENTION_TAG_KEY, RETENTION_TAG_VALUE_TEMPORARY } from '../src/retention.js';
import { updatePage } from '../src/update-page.js';
import { FakePageStore } from './fake-page-store.js';

const PAGES_BASE_URL = 'https://pages.example.com';
const OWNER_SUB = 'user-sub-123';
const OTHER_SUB = 'other-sub-456';
const FIXED_NOW = new Date('2026-08-18T10:00:00.000Z');
const OLD_CREATED_AT = '2026-01-01T00:00:00.000Z';

function expectedExpiresAt(createdAt: string): string {
  const expires = new Date(createdAt);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

function makeMetadata(slug: string, overrides?: Partial<PageMetadata>): PageMetadata {
  const createdAt = overrides?.createdAt ?? OLD_CREATED_AT;
  const retention = overrides?.retention ?? 'temporary';
  return {
    slug,
    ownerSub: OWNER_SUB,
    ownerEmail: 'user@example.com',
    retention,
    createdAt,
    expiresAt:
      overrides?.expiresAt !== undefined
        ? overrides.expiresAt
        : retention === 'permanent'
          ? null
          : expectedExpiresAt(createdAt),
    fileCount: 1,
    totalSize: 100,
    ...overrides,
  };
}

function makeMarker(slug: string, overrides?: Partial<UserPageIndexEntry>): UserPageIndexEntry {
  return {
    slug,
    createdAt: overrides?.createdAt ?? OLD_CREATED_AT,
    ...overrides,
  };
}

function seedPage(
  store: FakePageStore,
  slug: string,
  options?: {
    metadata?: Partial<PageMetadata>;
    marker?: Partial<UserPageIndexEntry>;
    pageFiles?: string[];
  },
): void {
  const metadata = makeMetadata(slug, options?.metadata);
  store.objects.set(metaObjectKey(slug), metadata);
  store.objects.set(userIndexObjectKey(metadata.ownerSub, slug), makeMarker(slug, options?.marker));
  for (const path of options?.pageFiles ?? ['index.html']) {
    store.objects.set(pageObjectKey(slug, path), '<html></html>');
  }
}

describe('updatePage', () => {
  it('temporary → permanent で expiresAt が null になり、タグが外れる', async () => {
    const store = new FakePageStore();
    seedPage(store, 'my-page', {
      metadata: { retention: 'temporary' },
      pageFiles: ['index.html', 'assets/app.js'],
    });
    store.tags.set(metaObjectKey('my-page'), {
      [RETENTION_TAG_KEY]: RETENTION_TAG_VALUE_TEMPORARY,
    });

    const result = await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'my-page',
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.body.retention).toBe('permanent');
    expect(result.body.expiresAt).toBe(null);

    const metadata = store.objects.get(metaObjectKey('my-page')) as PageMetadata;
    expect(metadata.retention).toBe('permanent');
    expect(metadata.expiresAt).toBe(null);

    const taggedKeys = store.setObjectTagsCalls.map((call) => call.key);
    expect(taggedKeys).toContain(metaObjectKey('my-page'));
    expect(taggedKeys).not.toContain(userIndexObjectKey(OWNER_SUB, 'my-page'));
    expect(taggedKeys).toContain(pageObjectKey('my-page', 'index.html'));
    expect(taggedKeys).toContain(pageObjectKey('my-page', 'assets/app.js'));

    for (const call of store.setObjectTagsCalls) {
      expect(call.tags).toEqual({});
    }
  });

  it('permanent → temporary で expiresAt が createdAt + 30日になり、タグが付く', async () => {
    const store = new FakePageStore();
    seedPage(store, 'perm-page', {
      metadata: { retention: 'permanent', expiresAt: null },
    });

    const result = await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'perm-page',
      body: { retention: 'temporary' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const expectedExpires = expectedExpiresAt(OLD_CREATED_AT);
    expect(result.body.expiresAt).toBe(expectedExpires);

    for (const call of store.setObjectTagsCalls) {
      expect(call.tags).toEqual({ [RETENTION_TAG_KEY]: RETENTION_TAG_VALUE_TEMPORARY });
    }
  });

  it('作成から30日以上経ったページを temporary に戻すと即座に期限切れになる', async () => {
    const store = new FakePageStore();
    const createdAt = '2025-01-01T00:00:00.000Z';
    seedPage(store, 'old-page', {
      metadata: { retention: 'permanent', createdAt, expiresAt: null },
    });

    const result = await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'old-page',
      body: { retention: 'temporary' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const expectedExpires = expectedExpiresAt(createdAt);
    expect(result.body.expiresAt).toBe(expectedExpires);
    expect(new Date(result.body.expiresAt!).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
  });

  it('users/ には一切書き込まない', async () => {
    const store = new FakePageStore();
    seedPage(store, 'both-page', { metadata: { retention: 'temporary' } });

    await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'both-page',
      body: { retention: 'permanent' },
    });

    const usersKey = userIndexObjectKey(OWNER_SUB, 'both-page');
    expect(store.putJsonCalls.every((call) => call.key !== usersKey)).toBe(true);
    expect(store.setObjectTagsCalls.every((call) => call.key !== usersKey)).toBe(true);

    const marker = store.objects.get(usersKey) as UserPageIndexEntry;
    expect(marker).toEqual(makeMarker('both-page'));
  });

  it('meta/ の retention と expiresAt が更新される', async () => {
    const store = new FakePageStore();
    seedPage(store, 'meta-only', { metadata: { retention: 'temporary' } });

    await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'meta-only',
      body: { retention: 'permanent' },
    });

    const metadata = store.objects.get(metaObjectKey('meta-only')) as PageMetadata;
    expect(metadata.retention).toBe('permanent');
    expect(metadata.expiresAt).toBe(null);
  });

  it('他人のページで 403', async () => {
    const store = new FakePageStore();
    seedPage(store, 'secret-page', { metadata: { ownerSub: OTHER_SUB } });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'secret-page',
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(403);

    expect(logSpy).toHaveBeenCalledWith(
      'authorization_failed',
      expect.objectContaining({ action: 'patch_page', slug: 'secret-page' }),
    );
    logSpy.mockRestore();
  });

  it('存在しないページで 404', async () => {
    const store = new FakePageStore();
    const result = await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'missing-page',
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('page_not_found');
  });

  it('不正な body で 400', async () => {
    const store = new FakePageStore();
    seedPage(store, 'bad-body');

    const result = await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'bad-body',
      body: { retention: 'forever' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('invalid_request');
  });

  it('期限切れのページでも実行できる', async () => {
    const store = new FakePageStore();
    seedPage(store, 'expired-page', {
      metadata: {
        retention: 'temporary',
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
    });

    const result = await updatePage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: 'expired-page',
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.retention).toBe('permanent');
  });
});

describe('deletePage', () => {
  it('3箇所すべてが消え、削除順序が users → pages → meta である', async () => {
    const store = new FakePageStore();
    seedPage(store, 'del-page', { pageFiles: ['index.html', 'assets/app.js'] });

    const result = await deletePage({
      store,
      ownerSub: OWNER_SUB,
      slug: 'del-page',
    });

    expect(result.ok).toBe(true);
    expect(store.deleteCalls).toHaveLength(3);
    expect(store.deleteCalls[0]).toEqual([userIndexObjectKey(OWNER_SUB, 'del-page')]);
    expect(store.deleteCalls[1]).toEqual([
      pageObjectKey('del-page', 'index.html'),
      pageObjectKey('del-page', 'assets/app.js'),
    ]);
    expect(store.deleteCalls[2]).toEqual([metaObjectKey('del-page')]);

    expect(store.objects.size).toBe(0);
  });

  it('2回実行しても 204（冪等）', async () => {
    const store = new FakePageStore();
    seedPage(store, 'idempotent-page');

    const first = await deletePage({ store, ownerSub: OWNER_SUB, slug: 'idempotent-page' });
    const second = await deletePage({ store, ownerSub: OWNER_SUB, slug: 'idempotent-page' });

    expect(first.ok && first.status).toBe(204);
    expect(second.ok && second.status).toBe(204);
  });

  it('meta が無く users マーカーだけある状態でも削除できる', async () => {
    const store = new FakePageStore();
    store.objects.set(pageObjectKey('orphan-page', 'index.html'), '<html></html>');
    store.objects.set(userIndexObjectKey(OWNER_SUB, 'orphan-page'), makeMarker('orphan-page'));

    const result = await deletePage({ store, ownerSub: OWNER_SUB, slug: 'orphan-page' });

    expect(result.ok).toBe(true);
    expect(store.objects.size).toBe(0);
  });

  it('どちらも無ければ何も消さずに 204', async () => {
    const store = new FakePageStore();
    const result = await deletePage({ store, ownerSub: OWNER_SUB, slug: 'gone-page' });

    expect(result.ok).toBe(true);
    expect(store.deleteCalls).toEqual([]);
  });

  it('他人のページで 403、かつ何も消えていない', async () => {
    const store = new FakePageStore();
    seedPage(store, 'other-page', { metadata: { ownerSub: OTHER_SUB } });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await deletePage({ store, ownerSub: OWNER_SUB, slug: 'other-page' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(403);
    expect(store.deleteCalls).toEqual([]);
    expect(store.objects.size).toBeGreaterThan(0);

    expect(logSpy).toHaveBeenCalledWith(
      'authorization_failed',
      expect.objectContaining({ action: 'delete_page', slug: 'other-page' }),
    );
    logSpy.mockRestore();
  });
});

describe('handler PATCH / DELETE routes', () => {
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

  it('PATCH /api/pages/{slug} で retention を更新する', async () => {
    const store = new FakePageStore();
    seedPage(store, 'patch-route', { metadata: { retention: 'temporary' } });

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'PATCH', path: '/api/pages/patch-route' },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
      pathParameters: { slug: 'patch-route' },
      body: JSON.stringify({ retention: 'permanent' }),
    } as never);

    expect(result).toMatchObject({ statusCode: 200 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.retention).toBe('permanent');
  });

  it('DELETE /api/pages/{slug} で 204 を返す', async () => {
    const store = new FakePageStore();
    seedPage(store, 'delete-route');

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'DELETE', path: '/api/pages/delete-route' },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
      pathParameters: { slug: 'delete-route' },
    } as never);

    expect(result).toMatchObject({ statusCode: 204 });
    expect((result as { body?: string }).body).toBeUndefined();
  });

  it('認可失敗がログに記録され、トークンや presigned URL が出ない', async () => {
    const store = new FakePageStore();
    seedPage(store, 'forbidden-page', { metadata: { ownerSub: OTHER_SUB } });

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);

    const { handler } = await import('../src/handlers/pages.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler({
      requestContext: {
        http: { method: 'PATCH', path: '/api/pages/forbidden-page' },
        authorizer: {
          jwt: {
            claims: {
              sub: OWNER_SUB,
              email: 'user@example.com',
            },
          },
        },
      },
      pathParameters: { slug: 'forbidden-page' },
      body: JSON.stringify({ retention: 'permanent' }),
    } as never);

    expect(logSpy).toHaveBeenCalledWith(
      'authorization_failed',
      expect.objectContaining({ action: 'patch_page' }),
    );

    for (const log of logSpy.mock.calls) {
      const serialized = JSON.stringify(log);
      expect(serialized).not.toMatch(/https:\/\/s3\.example\.com/);
      expect(serialized).not.toMatch(/Bearer /);
      expect(serialized).not.toMatch(/eyJ/);
    }
    logSpy.mockRestore();
  });
});
