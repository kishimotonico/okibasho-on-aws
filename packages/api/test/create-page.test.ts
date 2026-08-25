import { describe, expect, it } from 'vitest';
import {
  contentTypeFromPath,
  metaObjectKey,
  pageObjectKey,
} from '@page-share/shared';
import { createPage, parseCreatePageRequestBody } from '../src/create-page.js';
import { RETENTION_TAG_KEY, RETENTION_TAG_VALUE_TEMPORARY } from '../src/retention.js';
import { FakePageStore } from './fake-page-store.js';

const PAGES_BASE_URL = 'https://pages.example.com';
const SHARE_BASE_URL = 'https://share.example.com';
const OWNER_SUB = 'user-sub-123';

const validFiles = [
  { path: 'index.html', size: 100 },
  { path: 'assets/app.js', size: 200 },
];

function createPageInput(
  store: FakePageStore,
  body: unknown,
  options?: { generateSlug?: () => string; generateVersionId?: () => string },
) {
  return {
    store,
    pagesBaseUrl: PAGES_BASE_URL,
    shareBaseUrl: SHARE_BASE_URL,
    ownerSub: OWNER_SUB,
    body,
    generateSlug: options?.generateSlug ?? (() => 'abcdefghijklmnop'),
    generateVersionId: options?.generateVersionId ?? (() => 'versionid1234567'),
  };
}

describe('createPage', () => {
  it('宣言だけ行い meta は書かず presigned URL と versionId を返す', async () => {
    const store = new FakePageStore();
    const result = await createPage(
      createPageInput(store, { title: 'My Page', files: validFiles }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.status).toBe(201);
    expect(result.body.slug).toBe('abcdefghijklmnop');
    expect(result.body.versionId).toBe('versionid1234567');
    expect(result.body.viewUrl).toBe('https://pages.example.com/abcdefghijklmnop/');
    expect(result.body.uploads).toHaveLength(2);
    expect(store.objects.has(metaObjectKey('abcdefghijklmnop'))).toBe(false);
    expect(store.putJsonCalls).toHaveLength(0);
  });

  it('shared visibility では share の viewUrl と shared-pages prefix を使う', async () => {
    const store = new FakePageStore();
    const result = await createPage(
      createPageInput(store, { visibility: 'shared', files: validFiles }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.body.viewUrl).toBe('https://share.example.com/abcdefghijklmnop/');
    expect(store.presignCalls[0]?.key).toBe(
      pageObjectKey('shared', 'abcdefghijklmnop', 'versionid1234567', 'index.html'),
    );
  });

  it('temporary なら presigned PUT に x-amz-tagging を含める', async () => {
    const store = new FakePageStore();
    const result = await createPage(createPageInput(store, { files: validFiles }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(store.presignCalls[0]?.tagging).toBe(
      `${encodeURIComponent(RETENTION_TAG_KEY)}=${encodeURIComponent(RETENTION_TAG_VALUE_TEMPORARY)}`,
    );
    expect(result.body.uploads[0]?.headers['x-amz-tagging']).toBeDefined();
  });

  it('slug 衝突時は exists(meta) でリトライする', async () => {
    const store = new FakePageStore();
    store.objects.set(metaObjectKey('abcdefghijklmnop'), { slug: 'abcdefghijklmnop' });

    const result = await createPage(
      createPageInput(store, { files: validFiles }, {
        generateSlug: (() => {
          let count = 0;
          return () => (count++ === 0 ? 'abcdefghijklmnop' : 'qrstuvwxyz123456');
        })(),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.slug).toBe('qrstuvwxyz123456');
  });

  it('検証エラーで 400 になる', async () => {
    const store = new FakePageStore();
    const result = await createPage(createPageInput(store, { files: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('files_required');
  });

  it('upload の content-type は拡張子由来', async () => {
    const store = new FakePageStore();
    const result = await createPage(createPageInput(store, { files: validFiles }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.uploads[0]?.headers['content-type']).toBe(
      contentTypeFromPath('index.html'),
    );
  });
});

describe('parseCreatePageRequestBody', () => {
  it('title / visibility / retention を受け付ける', () => {
    const parsed = parseCreatePageRequestBody({
      title: 'hello',
      visibility: 'shared',
      retention: 'permanent',
      files: validFiles,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.body.title).toBe('hello');
    expect(parsed.body.visibility).toBe('shared');
    expect(parsed.body.retention).toBe('permanent');
  });
});
