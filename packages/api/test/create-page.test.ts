import { describe, expect, it, vi } from 'vitest';
import type { PageMetadata, UserPageIndexEntry } from '@page-share/shared';
import {
  contentTypeFromPath,
  DEFAULT_RETENTION_DAYS,
  metaObjectKey,
  userIndexObjectKey,
} from '@page-share/shared';
import { createPage, parseCreatePageRequestBody } from '../src/create-page.js';
import type { PageStore } from '../src/page-store.js';

const PAGES_BASE_URL = 'https://pages.example.com';
const OWNER_SUB = 'user-sub-123';
const OWNER_EMAIL = 'user@example.com';
const FIXED_NOW = new Date('2026-08-18T10:00:00.000Z');

function expectedExpiresAt(): string {
  const expires = new Date(FIXED_NOW);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

class FakePageStore implements PageStore {
  readonly objects = new Map<string, unknown>();
  private failPutIfAbsentCount: number;

  constructor(options?: { failPutIfAbsentCount?: number }) {
    this.failPutIfAbsentCount = options?.failPutIfAbsentCount ?? 0;
  }

  async putJsonIfAbsent(key: string, body: unknown): Promise<boolean> {
    if (this.failPutIfAbsentCount > 0) {
      this.failPutIfAbsentCount -= 1;
      return false;
    }
    if (this.objects.has(key)) {
      return false;
    }
    this.objects.set(key, body);
    return true;
  }

  async putJson(key: string, body: unknown): Promise<void> {
    this.objects.set(key, body);
  }

  async presignPut(key: string, contentType: string, contentLength: number): Promise<string> {
    return `https://s3.example.com/${key}?content-type=${encodeURIComponent(contentType)}&content-length=${contentLength}`;
  }
}

const validFiles = [
  { path: 'index.html', size: 100 },
  { path: 'assets/app.js', size: 200 },
];

function createPageInput(
  store: PageStore,
  body: unknown,
  options?: { generateSlug?: () => string },
) {
  return {
    store,
    pagesBaseUrl: PAGES_BASE_URL,
    ownerSub: OWNER_SUB,
    ownerEmail: OWNER_EMAIL,
    body,
    now: () => FIXED_NOW,
    generateSlug: options?.generateSlug ?? (() => 'generated-slug'),
  };
}

describe('createPage', () => {
  it('slug 指定あり: metadata とインデックスが正しいキーに書かれ、uploads と viewUrl を返す', async () => {
    const store = new FakePageStore();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await createPage(createPageInput(store, { slug: 'my-page', files: validFiles }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.status).toBe(201);
    expect(result.body.slug).toBe('my-page');
    expect(result.body.viewUrl).toBe('https://pages.example.com/p/my-page/');
    expect(result.body.expiresAt).toBe(expectedExpiresAt());
    expect(result.body.uploads).toHaveLength(2);

    const metadata = store.objects.get(metaObjectKey('my-page')) as PageMetadata;
    expect(metadata).toMatchObject({
      slug: 'my-page',
      ownerSub: OWNER_SUB,
      ownerEmail: OWNER_EMAIL,
      retention: 'temporary',
      createdAt: FIXED_NOW.toISOString(),
      expiresAt: expectedExpiresAt(),
      fileCount: 2,
      totalSize: 300,
    });

    const index = store.objects.get(userIndexObjectKey(OWNER_SUB, 'my-page')) as UserPageIndexEntry;
    expect(index).toMatchObject({
      slug: 'my-page',
      retention: 'temporary',
      fileCount: 2,
      totalSize: 300,
    });

    for (const log of logSpy.mock.calls) {
      expect(JSON.stringify(log)).not.toMatch(/https:\/\/s3\.example\.com/);
    }
    logSpy.mockRestore();
  });

  it('slug 未指定: generateSlug で確定する', async () => {
    const store = new FakePageStore();
    const result = await createPage(
      createPageInput(store, { files: validFiles }, { generateSlug: () => 'auto-slug-01' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.slug).toBe('auto-slug-01');
    expect(store.objects.has(metaObjectKey('auto-slug-01'))).toBe(true);
  });

  it('各 upload の headers に content-type と content-length が入り、拡張子由来の content-type になる', async () => {
    const store = new FakePageStore();
    const result = await createPage(
      createPageInput(store, { slug: 'hdr-test', files: validFiles }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const htmlUpload = result.body.uploads.find((u) => u.path === 'index.html');
    const jsUpload = result.body.uploads.find((u) => u.path === 'assets/app.js');

    expect(htmlUpload?.headers).toEqual({
      'content-type': contentTypeFromPath('index.html'),
      'content-length': '100',
    });
    expect(jsUpload?.headers).toEqual({
      'content-type': contentTypeFromPath('assets/app.js'),
      'content-length': '200',
    });
  });

  it('retention 未指定なら temporary、permanent なら expiresAt は null', async () => {
    const store = new FakePageStore();

    const temporary = await createPage(
      createPageInput(store, { slug: 'temp-page', files: validFiles }),
    );
    expect(temporary.ok && temporary.body.expiresAt).toBe(expectedExpiresAt());

    const permanent = await createPage(
      createPageInput(store, {
        slug: 'perm-page',
        retention: 'permanent',
        files: validFiles,
      }),
    );
    expect(permanent.ok && permanent.body.expiresAt).toBe(null);
  });

  it('指定 slug が既に存在するとき 409 slug_taken', async () => {
    const store = new FakePageStore();
    store.objects.set(metaObjectKey('taken-slug'), { slug: 'taken-slug' });
    const result = await createPage(
      createPageInput(store, { slug: 'taken-slug', files: validFiles }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('slug_taken');
  });

  it('自動生成 slug が衝突したときリトライして成功する', async () => {
    const store = new FakePageStore({ failPutIfAbsentCount: 2 });
    let callCount = 0;
    const slugs = ['collision-1', 'collision-2', 'collision-3'];

    const result = await createPage(
      createPageInput(
        store,
        { files: validFiles },
        {
          generateSlug: () => slugs[callCount++]!,
        },
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.slug).toBe('collision-3');
    expect(callCount).toBe(3);
  });

  it('検証エラーで 400 になり details に全件入る', async () => {
    const store = new FakePageStore();
    const result = await createPage(
      createPageInput(store, {
        slug: 'Bad',
        files: [
          { path: '../index.html', size: -1 },
          { path: 'assets/app.js', size: 100 },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(400);
    expect(result.body.error.details?.length).toBeGreaterThan(1);
    expect(result.body.error.code).toBe(result.body.error.details?.[0]?.code);
    expect(result.body.error.message).toBe(result.body.error.details?.[0]?.message);
  });

  it('index.html が無いと 400', async () => {
    const store = new FakePageStore();
    const result = await createPage(
      createPageInput(store, {
        files: [{ path: 'assets/app.js', size: 100 }],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(400);
    expect(result.body.error.details?.some((e) => e.code === 'missing_index_html')).toBe(true);
  });
});

describe('parseCreatePageRequestBody', () => {
  it('不正な JSON 相当の body で invalid_request', () => {
    const result = parseCreatePageRequestBody(null);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.body.error.code).toBe('invalid_request');
  });

  it('files が配列でないと invalid_request', () => {
    const result = parseCreatePageRequestBody({ files: 'not-array' });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.body.error.code).toBe('invalid_request');
  });

  it('要素の形が違うと invalid_request', () => {
    const result = parseCreatePageRequestBody({
      files: [{ path: 'index.html' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.body.error.code).toBe('invalid_request');
  });
});

describe('handler auth', () => {
  it('JWT クレームに sub が無いとき 401', async () => {
    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'POST', path: '/api/pages' },
        authorizer: { jwt: { claims: {} } },
      },
      body: JSON.stringify({ files: validFiles }),
    } as never);

    expect(result).toMatchObject({
      statusCode: 401,
    });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.error.code).toBe('unauthorized');
  });

  it('body が不正な JSON のとき 400 invalid_json', async () => {
    const { handler } = await import('../src/handlers/pages.js');

    const result = await handler({
      requestContext: {
        http: { method: 'POST', path: '/api/pages' },
        authorizer: { jwt: { claims: { sub: OWNER_SUB } } },
      },
      body: '{not-json',
    } as never);

    expect(result).toMatchObject({ statusCode: 400 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.error.code).toBe('invalid_json');
  });
});
