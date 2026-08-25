import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMetadata } from '@page-share/shared';
import {
  DEFAULT_RETENTION_DAYS,
  kvsKey,
  metaObjectKey,
  pageObjectKey,
  userIndexObjectKey,
} from '@page-share/shared';
import { completePage } from '../src/complete-page.js';
import { ORPHAN_RECLAIM_MIN_AGE_MS } from '../src/version-reclaim.js';
import { FakeAliasStore } from './fake-alias-store.js';
import { FakePageStore } from './fake-page-store.js';

const PAGES_BASE_URL = 'https://pages.example.com';
const SHARE_BASE_URL = 'https://share.example.com';
const OWNER_SUB = 'user-sub-123';
const OWNER_EMAIL = 'user@example.com';
const SLUG = 'abcdefghijklmnop';
const VERSION_ID = 'versionid1234567';
const NEW_VERSION_ID = 'newversion123456';
const FIXED_NOW = new Date('2026-08-18T10:00:00.000Z');

const validFiles = [
  { path: 'index.html', size: 100 },
  { path: 'assets/app.js', size: 200 },
];

function expectedExpiresAt(contentUpdatedAt: string): string {
  const expires = new Date(contentUpdatedAt);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

function makeMetadata(overrides?: Partial<PageMetadata>): PageMetadata {
  return {
    slug: SLUG,
    title: 'Test Page',
    ownerSub: OWNER_SUB,
    ownerEmail: OWNER_EMAIL,
    visibility: 'internal',
    retention: 'temporary',
    createdAt: '2026-01-01T00:00:00.000Z',
    contentUpdatedAt: '2026-01-01T00:00:00.000Z',
    version: 2,
    activeVersionId: 'oldversion123456',
    fileCount: 2,
    totalSize: 300,
    ...overrides,
  };
}

function seedUploadedVersion(
  store: FakePageStore,
  visibility: PageMetadata['visibility'],
  versionId: string,
  options?: { old?: boolean },
): void {
  for (const file of validFiles) {
    const key = pageObjectKey(visibility, SLUG, versionId, file.path);
    store.seedObject(
      key,
      options?.old
        ? new Date(FIXED_NOW.getTime() - ORPHAN_RECLAIM_MIN_AGE_MS - 1000)
        : FIXED_NOW,
    );
    store.tags.set(key, { retention: 'temporary' });
  }
}

function completeInput(
  store: FakePageStore,
  aliasStore: FakeAliasStore,
  body: unknown,
  slug = SLUG,
) {
  return {
    store,
    aliasStore,
    pagesBaseUrl: PAGES_BASE_URL,
    shareBaseUrl: SHARE_BASE_URL,
    ownerSub: OWNER_SUB,
    ownerEmail: OWNER_EMAIL,
    slug,
    body,
    now: () => FIXED_NOW,
  };
}

describe('completePage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('新規 complete で meta / users / KVS を作成し KVS が先に書かれる', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    const callOrder: string[] = [];
    const originalPut = aliasStore.put.bind(aliasStore);
    aliasStore.put = async (key, value) => {
      callOrder.push('kvs');
      return originalPut(key, value);
    };
    const originalPutIfAbsent = store.putJsonIfAbsent.bind(store);
    store.putJsonIfAbsent = async (key, body) => {
      const created = await originalPutIfAbsent(key, body);
      if (created) {
        callOrder.push('meta');
      }
      return created;
    };

    seedUploadedVersion(store, 'internal', VERSION_ID);

    const result = await completePage(
      completeInput(store, aliasStore, {
        versionId: VERSION_ID,
        files: validFiles,
        title: 'Weekly report',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.body.version).toBe(1);
    expect(result.body.activeVersionId).toBe(VERSION_ID);
    expect(store.objects.get(metaObjectKey(SLUG))).toMatchObject({ title: 'Weekly report' });
    expect(store.objects.has(metaObjectKey(SLUG))).toBe(true);
    expect(store.objects.has(userIndexObjectKey(OWNER_SUB, SLUG))).toBe(true);
    expect(aliasStore.entries.get(kvsKey('internal', SLUG))).toEqual({
      v: VERSION_ID,
      e: Math.floor(new Date(expectedExpiresAt(FIXED_NOW.toISOString())).getTime() / 1000),
    });
    expect(callOrder.indexOf('kvs')).toBeLessThan(callOrder.indexOf('meta'));
  });

  it('activeVersionId と同じ versionId なら冪等に 200 を返す', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    const metadata = makeMetadata({ activeVersionId: VERSION_ID, version: 3 });
    store.objects.set(metaObjectKey(SLUG), metadata);

    const result = await completePage(
      completeInput(store, aliasStore, { versionId: VERSION_ID, files: validFiles }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.version).toBe(3);
    expect(aliasStore.putCalls).toHaveLength(0);
    expect(store.putJsonCalls).toHaveLength(0);
  });

  it('欠けファイルがあると incomplete_upload', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    store.seedObject(pageObjectKey('internal', SLUG, VERSION_ID, 'index.html'));

    const result = await completePage(
      completeInput(store, aliasStore, { versionId: VERSION_ID, files: validFiles }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('incomplete_upload');
  });

  it('再アップロード complete で version を加算し KVS を先に更新する', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    const metadata = makeMetadata();
    store.objects.set(metaObjectKey(SLUG), metadata);
    seedUploadedVersion(store, 'internal', NEW_VERSION_ID);

    const result = await completePage(
      completeInput(store, aliasStore, { versionId: NEW_VERSION_ID, files: validFiles }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.version).toBe(3);
    expect(aliasStore.entries.get(kvsKey('internal', SLUG))?.v).toBe(NEW_VERSION_ID);
  });

  it('再アップロード complete は現行 retention を新バージョンへ再タグする', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    store.objects.set(metaObjectKey(SLUG), makeMetadata({ retention: 'permanent' }));
    seedUploadedVersion(store, 'internal', NEW_VERSION_ID);

    const result = await completePage(
      completeInput(store, aliasStore, { versionId: NEW_VERSION_ID, files: validFiles }),
    );

    expect(result.ok).toBe(true);
    const taggedKey = pageObjectKey('internal', SLUG, NEW_VERSION_ID, 'index.html');
    expect(store.tags.has(taggedKey)).toBe(false);
  });

  it('1時間以上前の非アクティブバージョンを回収する', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    const metadata = makeMetadata({ activeVersionId: 'oldversion123456' });
    store.objects.set(metaObjectKey(SLUG), metadata);
    seedUploadedVersion(store, 'internal', NEW_VERSION_ID);
    seedUploadedVersion(store, 'internal', 'oldversion123456', { old: true });

    await completePage(
      completeInput(store, aliasStore, { versionId: NEW_VERSION_ID, files: validFiles }),
    );

    const oldKey = pageObjectKey('internal', SLUG, 'oldversion123456', 'index.html');
    expect(store.objects.has(oldKey)).toBe(false);
    const activeKey = pageObjectKey('internal', SLUG, NEW_VERSION_ID, 'index.html');
    expect(store.objects.has(activeKey)).toBe(true);
  });

  it('他人のページは 403', async () => {
    const store = new FakePageStore();
    const aliasStore = new FakeAliasStore();
    store.objects.set(metaObjectKey(SLUG), makeMetadata({ ownerSub: 'other-user' }));

    const result = await completePage(
      completeInput(store, aliasStore, { versionId: VERSION_ID, files: validFiles }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(403);
  });
});
