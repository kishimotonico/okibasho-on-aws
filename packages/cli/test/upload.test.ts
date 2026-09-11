import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../src/config.js';
import { runUpload } from '../src/commands/upload.js';
import { collectFiles } from '../src/collect-files.js';
import { metadataObjectKey, pageObjectKey } from '../src/page/s3-keys.js';
import { isPageMetadata } from '../src/page/metadata.js';
import { resolveSlug } from '../src/resolve-slug.js';
import { TokenRefreshError } from '../src/token-refresh.js';
import { uploadPage } from '../src/upload-client.js';
import { FakeS3Store, makeIdToken, TEST_CONFIG, TEST_EMAIL } from './fake-s3.js';

async function createHtmlDir(name = 'my-page'): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'okibasho-upload-'));
  const dir = join(parent, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), '<html></html>');
  return dir;
}

function defaultUploadDeps(store: FakeS3Store) {
  return {
    resolveConfig: async () => TEST_CONFIG,
    collectFiles,
    ensureIdToken: async () => makeIdToken(TEST_EMAIL),
    readFile,
    resolveSlug,
    createS3Client: () => store.asClient(),
    uploadPage,
  };
}

describe('runUpload', () => {
  it('index.html が無いディレクトリは S3 を呼ばず検証エラーになる', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'okibasho-upload-'));
    await writeFile(join(dir, 'page.html'), '<html></html>');

    const store = new FakeS3Store();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(dir, {}, defaultUploadDeps(store));

    expect(result.exitCode).toBe(1);
    expect(store.objects.size).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('index.html'))).toBe(true);
    error.mockRestore();
  });

  it('無効な --name はエラーになる', async () => {
    const dir = await createHtmlDir();
    const store = new FakeS3Store();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(dir, { name: 'Bad-Slug' }, defaultUploadDeps(store));

    expect(result.exitCode).toBe(1);
    expect(store.objects.size).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('無効な slug'))).toBe(true);
    error.mockRestore();
  });

  it('--dry-run ではネットワークを呼ばない', async () => {
    const dir = await createHtmlDir();
    const store = new FakeS3Store();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, { dryRun: true }, defaultUploadDeps(store));

    expect(result.exitCode).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('Dry run'))).toBe(true);
    log.mockRestore();
  });

  it('PutObject と metadata 書き込み、差分削除を行う', async () => {
    const dir = await createHtmlDir('q3-report');
    const store = new FakeS3Store();
    const staleKey = pageObjectKey(TEST_EMAIL, 'q3-report', 'old.css');
    store.objects.set(staleKey, { body: Buffer.from('old'), contentType: 'text/css' });

    const metadataKey = metadataObjectKey(TEST_EMAIL, 'q3-report');
    store.objects.set(metadataKey, {
      body: Buffer.from(
        JSON.stringify({
          slug: 'q3-report',
          owner: TEST_EMAIL,
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-31T00:00:00.000Z',
        }),
      ),
      contentType: 'application/json',
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, {}, defaultUploadDeps(store));

    expect(result.exitCode).toBe(0);
    expect(store.objects.has(staleKey)).toBe(false);
    expect(store.objects.has(pageObjectKey(TEST_EMAIL, 'q3-report', 'index.html'))).toBe(true);

    const metadataRaw = store.objects.get(metadataKey)?.body.toString('utf8');
    expect(metadataRaw).toBeTruthy();
    const metadata = JSON.parse(metadataRaw!);
    expect(isPageMetadata(metadata)).toBe(true);
    expect(metadata.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(metadata.expiresAt).not.toBeNull();

    expect(
      log.mock.calls.some((c) =>
        String(c[0]).includes('https://pages.example.test/tanaka/q3-report/'),
      ),
    ).toBe(true);
    log.mockRestore();
  });

  it('permanent 化済みページを --permanent なしで再アップロードしても expiresAt は null のまま', async () => {
    const dir = await createHtmlDir('already-permanent');
    const store = new FakeS3Store();
    const metadataKey = metadataObjectKey(TEST_EMAIL, 'already-permanent');
    store.objects.set(metadataKey, {
      body: Buffer.from(
        JSON.stringify({
          slug: 'already-permanent',
          owner: TEST_EMAIL,
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: null,
        }),
      ),
      contentType: 'application/json',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, {}, defaultUploadDeps(store));

    expect(result.exitCode).toBe(0);
    const metadata = JSON.parse(store.objects.get(metadataKey)!.body.toString('utf8'));
    expect(metadata.expiresAt).toBeNull();
    log.mockRestore();
  });

  it('--permanent では expiresAt が null になる', async () => {
    const dir = await createHtmlDir('permanent-page');
    const store = new FakeS3Store();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, { permanent: true }, defaultUploadDeps(store));

    expect(result.exitCode).toBe(0);
    const metadataKey = metadataObjectKey(TEST_EMAIL, 'permanent-page');
    const metadata = JSON.parse(store.objects.get(metadataKey)!.body.toString('utf8'));
    expect(metadata.expiresAt).toBeNull();
    log.mockRestore();
  });

  it('トークンが無いときログインを促す', async () => {
    const dir = await createHtmlDir();
    const store = new FakeS3Store();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(
      dir,
      {},
      {
        ...defaultUploadDeps(store),
        ensureIdToken: async () => {
          throw new TokenRefreshError('先に `okiba login` を実行してください。');
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain('okiba login');
    error.mockRestore();
  });

  it('設定未完了のとき ConfigError を表示する', async () => {
    const dir = await createHtmlDir();
    const store = new FakeS3Store();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(
      dir,
      {},
      {
        ...defaultUploadDeps(store),
        resolveConfig: async () => {
          throw new ConfigError('CLIの接続先が未設定です。');
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain('未設定');
    error.mockRestore();
  });
});
