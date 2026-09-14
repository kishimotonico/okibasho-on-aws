import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { metadataObjectKey, pageObjectKey } from '@cli/page';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeExpiresAt,
  deletePage,
  getPageMetadata,
  listPages,
  updatePageRetention,
  updatePageShare,
  uploadPage,
} from '../src/api/pages';

const email = 'tanaka@example.jp';
const bucket = 'pages-bucket';
const pagesBaseUrl = 'https://pages.example.com';

type StoredObject = {
  body: Uint8Array;
  contentType?: string;
};

function createFakeS3Client(initial: Record<string, StoredObject> = {}): S3Client {
  const store = new Map<string, StoredObject>(Object.entries(initial));

  return {
    send: async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        const key = command.input.Key;
        if (!key) {
          throw new Error('Key is required');
        }
        const body = command.input.Body;
        let bytes: Uint8Array;
        if (body instanceof Uint8Array) {
          bytes = body;
        } else if (typeof body === 'string') {
          bytes = new TextEncoder().encode(body);
        } else if (body instanceof Blob) {
          bytes = new Uint8Array(await body.arrayBuffer());
        } else {
          throw new Error(`Unsupported body type: ${typeof body}`);
        }
        store.set(key, {
          body: bytes,
          contentType: command.input.ContentType,
        });
        return {};
      }

      if (command instanceof GetObjectCommand) {
        const key = command.input.Key;
        if (!key) {
          throw new Error('Key is required');
        }
        const object = store.get(key);
        if (!object) {
          const error = new Error('NotFound');
          error.name = 'NoSuchKey';
          throw error;
        }
        return { Body: object.body };
      }

      if (command instanceof ListObjectsV2Command) {
        const prefix = command.input.Prefix ?? '';
        const delimiter = command.input.Delimiter;
        const keys = [...store.keys()].filter((key) => key.startsWith(prefix));

        if (delimiter) {
          const commonPrefixes = new Set<string>();
          for (const key of keys) {
            const rest = key.slice(prefix.length);
            const slashIndex = rest.indexOf('/');
            if (slashIndex >= 0) {
              commonPrefixes.add(`${prefix}${rest.slice(0, slashIndex + 1)}`);
            }
          }
          return {
            CommonPrefixes: [...commonPrefixes].map((Prefix) => ({ Prefix })),
          };
        }

        const contents = keys.map((Key) => ({ Key }));
        return { Contents: contents };
      }

      if (command instanceof DeleteObjectsCommand) {
        for (const object of command.input.Delete?.Objects ?? []) {
          if (object.Key) {
            store.delete(object.Key);
          }
        }
        return {};
      }

      throw new Error(`Unsupported command: ${command?.constructor?.name ?? command}`);
    },
  } as unknown as S3Client;
}

describe('pages API', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1ファイルアップロードの onProgress は total に metadata を含めず最後は (1, 1)', async () => {
    const client = createFakeS3Client();
    const progress: Array<[number, number]> = [];

    await uploadPage(
      client,
      bucket,
      email,
      'q3-report',
      [{ path: 'index.html', file: new Blob(['<html></html>'], { type: 'text/html' }) }],
      { retention: 'temporary' },
      (completed, total) => {
        progress.push([completed, total]);
      },
    );

    expect(progress).toEqual([[1, 1]]);
  });

  it('新規アップロードでファイルと metadata を書き、URL を返せる', async () => {
    const client = createFakeS3Client();
    const createdAt = new Date('2026-08-26T00:00:00.000Z');

    const metadata = await uploadPage(
      client,
      bucket,
      email,
      'q3-report',
      [{ path: 'index.html', file: new Blob(['<html></html>'], { type: 'text/html' }) }],
      { retention: 'temporary' },
    );

    expect(metadata.slug).toBe('q3-report');
    expect(metadata.owner).toBe(email);
    expect(metadata.expiresAt).toBe(computeExpiresAt('temporary', createdAt));

    const storedHtml = await getPageMetadata(client, bucket, email, 'q3-report');
    expect(storedHtml?.slug).toBe('q3-report');

    const pages = await listPages(client, bucket, email, pagesBaseUrl);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.viewUrl).toBe('https://pages.example.com/p/tanaka/q3-report/');
  });

  it('再アップロードで含まれない古いオブジェクトを削除する', async () => {
    const slug = 'q3-report';
    const client = createFakeS3Client({
      [pageObjectKey(email, slug, 'old.css')]: {
        body: new TextEncoder().encode('old'),
        contentType: 'text/css',
      },
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(
          JSON.stringify({
            slug,
            owner: email,
            createdAt: '2026-08-01T00:00:00.000Z',
            expiresAt: '2026-09-01T00:00:00.000Z',
          }),
        ),
        contentType: 'application/json',
      },
    });

    await uploadPage(
      client,
      bucket,
      email,
      slug,
      [{ path: 'index.html', file: new Blob(['<html></html>'], { type: 'text/html' }) }],
      {
        retention: 'temporary',
        existingMetadata: {
          slug,
          owner: email,
          createdAt: '2026-08-01T00:00:00.000Z',
          expiresAt: '2026-09-01T00:00:00.000Z',
        },
      },
    );

    await expect(
      client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: pageObjectKey(email, slug, 'old.css'),
        }),
      ),
    ).rejects.toMatchObject({ name: 'NoSuchKey' });

    await expect(
      client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: pageObjectKey(email, slug, 'index.html'),
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('permanent 化済みページを temporary 指定で再アップロードしても expiresAt は null のまま', async () => {
    const slug = 'q3-report';
    const existingMetadata = {
      slug,
      owner: email,
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
    };
    const client = createFakeS3Client({
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(JSON.stringify(existingMetadata)),
        contentType: 'application/json',
      },
    });

    const metadata = await uploadPage(
      client,
      bucket,
      email,
      slug,
      [{ path: 'index.html', file: new Blob(['<html></html>'], { type: 'text/html' }) }],
      { retention: 'temporary', existingMetadata },
    );

    expect(metadata.expiresAt).toBeNull();
  });

  it('temporary ページの再アップロードで expiresAt が現在時刻起点に再計算される', async () => {
    const slug = 'q3-report';
    const existingMetadata = {
      slug,
      owner: email,
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-08-10T00:00:00.000Z',
    };
    const client = createFakeS3Client({
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(JSON.stringify(existingMetadata)),
        contentType: 'application/json',
      },
    });
    const now = new Date('2026-08-26T00:00:00.000Z');

    const metadata = await uploadPage(
      client,
      bucket,
      email,
      slug,
      [{ path: 'index.html', file: new Blob(['<html></html>'], { type: 'text/html' }) }],
      { retention: 'temporary', existingMetadata },
    );

    expect(metadata.expiresAt).toBe(computeExpiresAt('temporary', now));
    expect(metadata.expiresAt).not.toBe(existingMetadata.expiresAt);
  });

  it('保存期間変更は metadata だけ更新する', async () => {
    const slug = 'q3-report';
    const createdAt = '2026-08-01T00:00:00.000Z';
    const client = createFakeS3Client({
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(
          JSON.stringify({
            slug,
            owner: email,
            createdAt,
            expiresAt: null,
          }),
        ),
        contentType: 'application/json',
      },
    });

    const metadata = await updatePageRetention(client, bucket, email, slug, 'temporary');

    expect(metadata.expiresAt).toBe(computeExpiresAt('temporary', createdAt));
  });

  it('削除は prefix 配下をまとめて消す', async () => {
    const slug = 'q3-report';
    const client = createFakeS3Client({
      [pageObjectKey(email, slug, 'index.html')]: {
        body: new TextEncoder().encode('<html></html>'),
        contentType: 'text/html',
      },
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(
          JSON.stringify({
            slug,
            owner: email,
            createdAt: '2026-08-01T00:00:00.000Z',
            expiresAt: null,
          }),
        ),
        contentType: 'application/json',
      },
    });

    await deletePage(client, bucket, email, slug);

    const pages = await listPages(client, bucket, email, pagesBaseUrl);
    expect(pages).toEqual([]);
  });

  it('再アップロードで既存 metadata の share を引き継ぐ', async () => {
    const slug = 'q3-report';
    const share = {
      id: 'a'.repeat(22),
      basic: { username: 'guest', salt: 'b'.repeat(22), hash: 'c'.repeat(64) },
    };
    const existingMetadata = {
      slug,
      owner: email,
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
      share,
    };
    const client = createFakeS3Client({
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(JSON.stringify(existingMetadata)),
        contentType: 'application/json',
      },
    });

    const metadata = await uploadPage(
      client,
      bucket,
      email,
      slug,
      [{ path: 'index.html', file: new Blob(['<html></html>'], { type: 'text/html' }) }],
      { retention: 'temporary', existingMetadata },
    );

    expect(metadata.share).toEqual(share);
  });

  it('保存期間変更で share を引き継ぐ', async () => {
    const slug = 'q3-report';
    const share = { id: 'a'.repeat(22), allowedCidrs: ['203.0.113.0/24'] };
    const client = createFakeS3Client({
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(
          JSON.stringify({
            slug,
            owner: email,
            createdAt: '2026-08-01T00:00:00.000Z',
            expiresAt: null,
            share,
          }),
        ),
        contentType: 'application/json',
      },
    });

    const metadata = await updatePageRetention(client, bucket, email, slug, 'temporary');

    expect(metadata.share).toEqual(share);
  });

  it('updatePageShare は share だけを差し替える', async () => {
    const slug = 'q3-report';
    const client = createFakeS3Client({
      [metadataObjectKey(email, slug)]: {
        body: new TextEncoder().encode(
          JSON.stringify({
            slug,
            owner: email,
            createdAt: '2026-08-01T00:00:00.000Z',
            expiresAt: null,
          }),
        ),
        contentType: 'application/json',
      },
    });

    const share = { id: 'a'.repeat(22), allowedCidrs: ['203.0.113.0/24'] };
    const metadata = await updatePageShare(client, bucket, email, slug, share);
    expect(metadata.share).toEqual(share);
    expect(metadata.expiresAt).toBeNull();

    const stored = await getPageMetadata(client, bucket, email, slug);
    expect(stored?.share).toEqual(share);

    const cleared = await updatePageShare(client, bucket, email, slug, null);
    expect(cleared.share).toBeUndefined();

    const storedAfterClear = await getPageMetadata(client, bucket, email, slug);
    expect(storedAfterClear?.share).toBeUndefined();
  });

  it('updatePageShare は存在しないページでエラーになる', async () => {
    const client = createFakeS3Client();
    await expect(updatePageShare(client, bucket, email, 'missing', null)).rejects.toThrow(
      'ページが見つかりません',
    );
  });
});
