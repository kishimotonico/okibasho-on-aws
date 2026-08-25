import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMetadata, UserPageIndexEntry } from '@page-share/shared';
import { computeExpiresAt, metaObjectKey, userIndexObjectKey } from '@page-share/shared';
import { getPage } from '../src/get-page.js';
import { listPages } from '../src/list-pages.js';
import { FakePageStore } from './fake-page-store.js';

const PAGES_BASE_URL = 'https://pages.example.com';
const SHARE_BASE_URL = 'https://share.example.com';
const OWNER_SUB = 'user-sub-123';
const OTHER_SUB = 'other-sub-456';

function makeMarker(slug: string, overrides?: Partial<UserPageIndexEntry>): UserPageIndexEntry {
  return {
    slug,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const DETAIL_SLUG = 'detailpage123456';
const EXPIRED_SLUG = 'expiredpage12345';
const SECRET_SLUG = 'secretpage123456';

function makeMetadata(slug: string, overrides?: Partial<PageMetadata>): PageMetadata {
  return {
    slug,
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
    seedListedPage(store, 'page-newer', { metadata: { createdAt: '2026-02-01T00:00:00.000Z' } });
    seedListedPage(store, 'page-older', { metadata: { createdAt: '2026-01-01T00:00:00.000Z' } });

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.pages).toHaveLength(2);
    expect(result.body.pages[0]?.slug).toBe('page-newer');
    expect(result.body.pages[0]?.viewUrl).toBe('https://pages.example.com/page-newer/');
    expect(result.body.pages[0]?.version).toBe(1);
  });

  it('shared ページは share の viewUrl を返す', async () => {
    const store = new FakePageStore();
    seedListedPage(store, 'shared-page', { metadata: { visibility: 'shared' } });

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.pages[0]?.viewUrl).toBe('https://share.example.com/shared-page/');
  });

  it('期限切れページも expiresAt 付きで含める', async () => {
    const store = new FakePageStore();
    seedListedPage(store, 'expired-page', {
      metadata: {
        retention: 'temporary',
        contentUpdatedAt: '2020-01-01T00:00:00.000Z',
      },
    });

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const page = result.body.pages[0];
    expect(page?.expiresAt).toBe(
      computeExpiresAt('temporary', new Date('2020-01-01T00:00:00.000Z')),
    );
  });

  it('meta が無いマーカーは一覧から落ち、書き込み副作用は起こさない', async () => {
    const store = new FakePageStore();
    store.objects.set(userIndexObjectKey(OWNER_SUB, 'orphan-page'), makeMarker('orphan-page'));

    const result = await listPages({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.pages).toHaveLength(0);
    expect(store.deleteCalls).toHaveLength(0);
  });
});

describe('getPage', () => {
  it('owner のページを 200 で返し expiresAt は計算値', async () => {
    const store = new FakePageStore();
    const metadata = makeMetadata(DETAIL_SLUG);
    store.objects.set(metaObjectKey(DETAIL_SLUG), metadata);

    const result = await getPage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: DETAIL_SLUG,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.expiresAt).toBe(
      computeExpiresAt(metadata.retention, new Date(metadata.contentUpdatedAt)),
    );
    expect(result.body.viewUrl).toBe(`https://pages.example.com/${DETAIL_SLUG}/`);
  });

  it('期限切れでも owner は 200', async () => {
    const store = new FakePageStore();
    store.objects.set(
      metaObjectKey(EXPIRED_SLUG),
      makeMetadata(EXPIRED_SLUG, {
        retention: 'temporary',
        contentUpdatedAt: '2020-01-01T00:00:00.000Z',
      }),
    );

    const result = await getPage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: EXPIRED_SLUG,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.status).toBe(200);
  });

  it('他人のページは 403', async () => {
    const store = new FakePageStore();
    store.objects.set(metaObjectKey(SECRET_SLUG), makeMetadata(SECRET_SLUG, { ownerSub: OTHER_SUB }));

    const result = await getPage({
      store,
      pagesBaseUrl: PAGES_BASE_URL,
      shareBaseUrl: SHARE_BASE_URL,
      ownerSub: OWNER_SUB,
      slug: SECRET_SLUG,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(403);
  });
});

describe('handler GET routes', () => {
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

  it('GET /api/pages で一覧を返す', async () => {
    const store = new FakePageStore();
    seedListedPage(store, 'listed-page');

    vi.spyOn(await import('../src/page-store.js'), 'createPageStore').mockReturnValue(store);
    vi.spyOn(await import('../src/alias-store.js'), 'createAliasStore').mockReturnValue({
      put: vi.fn(),
      delete: vi.fn(),
    });

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
});
