import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMetadata, UserPageIndexEntry } from '@page-share/shared';
import {
  kvsKey,
  metaObjectKey,
  pageObjectKey,
  userIndexObjectKey,
} from '@page-share/shared';
import { deletePage } from '../src/delete-page.js';
import { updatePage } from '../src/update-page.js';
import { FakeAliasStore } from './fake-alias-store.js';
import { FakePageStore } from './fake-page-store.js';

const PAGES_BASE_URL = 'https://pages.example.com';
const SHARE_BASE_URL = 'https://share.example.com';
const OWNER_SUB = 'user-sub-123';
const SLUG = 'abcdefghijklmnop';

function makeMetadata(overrides?: Partial<PageMetadata>): PageMetadata {
  return {
    slug: SLUG,
    title: 'Test Page',
    ownerSub: OWNER_SUB,
    ownerEmail: 'user@example.com',
    visibility: 'internal',
    retention: 'temporary',
    createdAt: '2026-01-01T00:00:00.000Z',
    contentUpdatedAt: '2026-06-01T00:00:00.000Z',
    version: 1,
    activeVersionId: 'versionid1234567',
    fileCount: 2,
    totalSize: 300,
    ...overrides,
  };
}

function makeMarker(overrides?: Partial<UserPageIndexEntry>): UserPageIndexEntry {
  return {
    slug: SLUG,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function seedPage(
  store: FakePageStore,
  options?: {
    metadata?: Partial<PageMetadata>;
    marker?: Partial<UserPageIndexEntry>;
    pageKeys?: string[];
  },
): void {
  store.objects.set(metaObjectKey(SLUG), makeMetadata(options?.metadata));
  store.objects.set(userIndexObjectKey(OWNER_SUB, SLUG), makeMarker(options?.marker));
  for (const key of options?.pageKeys ?? []) {
    store.seedObject(key);
  }
}

describe('updatePage', () => {
  it('retention 変更でタグ → metadata → KVS の順で更新する', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    const metadata = makeMetadata({ retention: 'temporary' });
    store.objects.set(metaObjectKey(SLUG), metadata);
    const pageKey = pageObjectKey('internal', SLUG, metadata.activeVersionId, 'index.html');
    store.seedObject(pageKey);

    const result = await updatePage({
      store,
      aliasStore,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: SLUG,
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.retention).toBe('permanent');
    expect(result.body.expiresAt).toBeNull();
    expect(aliasStore.entries.get(kvsKey('internal', SLUG))).toEqual({
      v: metadata.activeVersionId,
    });
    expect(store.setObjectTagsCalls.length).toBeGreaterThan(0);
    expect(store.putJsonCalls.some((call) => call.key === metaObjectKey(SLUG))).toBe(true);
    expect(aliasStore.putCalls).toHaveLength(1);
  });

  it('title のみ変更では KVS を書かない', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    seedPage(store);

    const result = await updatePage({
      store,
      aliasStore,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: SLUG,
      body: { title: '新しいタイトル' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.title).toBe('新しいタイトル');
    expect(aliasStore.putCalls).toHaveLength(0);
  });

  it('期限切れページでも retention 変更を許す', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    seedPage(store, {
      metadata: {
        retention: 'temporary',
        contentUpdatedAt: '2020-01-01T00:00:00.000Z',
      },
    });

    const result = await updatePage({
      store,
      aliasStore,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: SLUG,
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.retention).toBe('permanent');
  });

  it('retention が metadata と同じでも KVS を冪等に書く', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    seedPage(store, { metadata: { retention: 'permanent' } });

    const result = await updatePage({
      store,
      aliasStore,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: SLUG,
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(true);
    expect(aliasStore.putCalls).toHaveLength(1);
    expect(aliasStore.entries.get(kvsKey('internal', SLUG))).toEqual({
      v: 'versionid1234567',
    });
  });

  it('retention 変更で所有者マーカーも再タグする', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    seedPage(store, {
      pageKeys: [pageObjectKey('internal', SLUG, 'versionid1234567', 'index.html')],
    });

    const result = await updatePage({
      store,
      aliasStore,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: SLUG,
      body: { retention: 'permanent' },
    });

    expect(result.ok).toBe(true);
    const taggedKeys = store.setObjectTagsCalls.map((call) => call.key);
    expect(taggedKeys).toContain(userIndexObjectKey(OWNER_SUB, SLUG));
    expect(store.tags.has(userIndexObjectKey(OWNER_SUB, SLUG))).toBe(false);
  });
});

describe('deletePage', () => {
  it('meta / users / ページ本体 / KVS を削除する', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    const metadata = makeMetadata();
    seedPage(store, {
      pageKeys: [pageObjectKey('internal', SLUG, metadata.activeVersionId, 'index.html')],
    });
    aliasStore.entries.set(kvsKey('internal', SLUG), { v: metadata.activeVersionId });

    const result = await deletePage({
      store,
      aliasStore,
      ownerSub: OWNER_SUB,
      slug: SLUG,
    });

    expect(result.ok).toBe(true);
    expect(store.objects.has(metaObjectKey(SLUG))).toBe(false);
    expect(store.objects.has(userIndexObjectKey(OWNER_SUB, SLUG))).toBe(false);
    expect(aliasStore.entries.has(kvsKey('internal', SLUG))).toBe(false);
  });

  it('冪等: 既に消えていれば 204', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();

    const result = await deletePage({
      store,
      aliasStore,
      ownerSub: OWNER_SUB,
      slug: SLUG,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(204);
  });

  it('meta と users が無くても KVS を消してから 204 を返す', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    aliasStore.entries.set(kvsKey('internal', SLUG), { v: 'versionid1234567' });
    aliasStore.entries.set(kvsKey('shared', SLUG), { v: 'versionid1234567' });

    const result = await deletePage({
      store,
      aliasStore,
      ownerSub: OWNER_SUB,
      slug: SLUG,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(204);
    expect(aliasStore.entries.size).toBe(0);
  });
});

describe('handler routes', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env['PAGES_BUCKET'] = 'test-bucket';
    process.env['PAGES_BASE_URL'] = PAGES_BASE_URL;
    process.env['SHARE_BASE_URL'] = SHARE_BASE_URL;
    process.env['KVS_ARN'] = 'arn:aws:cloudfront::123:key-value-store/test';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('PATCH /api/pages/{slug} で retention を更新する', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    seedPage(store);

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);
    vi.spyOn(await import('../src/alias-store.js'), 'createAliasStore').mockReturnValue(aliasStore);

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'PATCH', path: `/api/pages/${SLUG}` },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
      pathParameters: { slug: SLUG },
      body: JSON.stringify({ retention: 'permanent' }),
    } as never);

    expect(result).toMatchObject({ statusCode: 200 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.retention).toBe('permanent');
    expect(body.expiresAt).toBeNull();
  });

  it('DELETE /api/pages/{slug} で 204 を返す', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    seedPage(store);

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);
    vi.spyOn(await import('../src/alias-store.js'), 'createAliasStore').mockReturnValue(aliasStore);

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'DELETE', path: `/api/pages/${SLUG}` },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
      pathParameters: { slug: SLUG },
    } as never);

    expect(result).toMatchObject({ statusCode: 204 });
  });

  it('PUT /api/pages/{slug} で再宣言できる', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    seedPage(store);

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);
    vi.spyOn(await import('../src/alias-store.js'), 'createAliasStore').mockReturnValue(aliasStore);
    vi.spyOn(await import('../src/redeclare-page.js'), 'defaultRedeclarePageDeps', 'get').mockReturnValue({
      generateVersionId: () => 'newversion123456',
    });

    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'PUT', path: `/api/pages/${SLUG}` },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
      pathParameters: { slug: SLUG },
      body: JSON.stringify({ files: [{ path: 'index.html', size: 100 }] }),
    } as never);

    expect(result).toMatchObject({ statusCode: 200 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.versionId).toBe('newversion123456');
  });
});
