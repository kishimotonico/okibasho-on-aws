import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompletePageResponse, CreatePageResponse } from '@page-share/shared';
import { ConfigError } from '../src/config.js';
import { runUpload } from '../src/commands/upload.js';
import { collectFiles } from '../src/collect-files.js';
import { resolveTitle } from '../src/resolve-title.js';
import type { FetchFn } from '../src/upload-client.js';
import { TokenRefreshError } from '../src/token-refresh.js';

const TEST_CONFIG = {
  apiUrl: 'https://api.example.test',
  issuer: 'https://issuer.example.test',
  clientId: 'cli-client',
};

const TEST_SLUG = 'abcd1234efgh5678';
const TEST_VERSION_ID = 'ijkl9012mnop3456';

function createFetchMock(handlers: {
  createPage?: (init: RequestInit) => CreatePageResponse | { status: number; body: unknown };
  completePage?: (
    slug: string,
    init: RequestInit,
  ) => CompletePageResponse | { status: number; body: unknown };
  puts?: Map<string, { status: number; statusText?: string; receivedHeaders?: Headers }>;
}): {
  fetch: FetchFn;
  calls: { createPage: number; completePage: number };
  putCalls: Array<{ url: string; headers: Headers }>;
} {
  const putCalls: Array<{ url: string; headers: Headers }> = [];
  const calls = { createPage: 0, completePage: 0 };

  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/api/pages')) {
      calls.createPage++;
      const result = handlers.createPage?.(init ?? {});
      if (!result) {
        throw new Error('createPage handler not configured');
      }
      if ('status' in result) {
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const completeMatch = url.match(/\/api\/pages\/([^/]+)\/complete$/);
    if (completeMatch) {
      calls.completePage++;
      const slug = completeMatch[1] ?? '';
      const result = handlers.completePage?.(slug, init ?? {});
      if (!result) {
        throw new Error('completePage handler not configured');
      }
      if ('status' in result) {
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const putHandler = handlers.puts?.get(url);
    if (putHandler) {
      putCalls.push({ url, headers: new Headers(init?.headers) });
      return new Response(null, {
        status: putHandler.status,
        statusText: putHandler.statusText ?? 'OK',
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as FetchFn;

  return { fetch: fetchFn, calls, putCalls };
}

async function createHtmlDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'share-html-upload-'));
  await writeFile(join(dir, 'index.html'), '<html></html>');
  return dir;
}

function defaultUploadDeps(fetch: FetchFn) {
  return {
    fetch,
    resolveConfig: async () => TEST_CONFIG,
    collectFiles,
    ensureIdToken: async () => 'id-token',
    readFile,
    resolveTitle,
  };
}

describe('runUpload', () => {
  it('index.html が無いディレクトリは API を呼ばず検証エラーになる', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'share-html-upload-'));
    await writeFile(join(dir, 'page.html'), '<html></html>');

    const { fetch, calls } = createFetchMock({});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(dir, {}, defaultUploadDeps(fetch));

    expect(result.exitCode).toBe(1);
    expect(calls.createPage).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('index.html'))).toBe(true);
    error.mockRestore();
  });

  it('--dry-run ではネットワークを呼ばない', async () => {
    const dir = await createHtmlDir();
    const { fetch, calls } = createFetchMock({});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, { dryRun: true }, defaultUploadDeps(fetch));

    expect(result.exitCode).toBe(0);
    expect(calls.createPage).toBe(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('Dry run'))).toBe(true);
    log.mockRestore();
  });

  it('presigned PUT と complete を実行する', async () => {
    const dir = await createHtmlDir();
    const putUrl = 'https://s3.example.test/upload/index.html';
    const signedHeaders = {
      'content-type': 'text/html',
      'content-length': '13',
      'x-amz-meta-custom': 'signed-value',
    };

    const { fetch, putCalls, calls } = createFetchMock({
      createPage: () => ({
        slug: TEST_SLUG,
        versionId: TEST_VERSION_ID,
        viewUrl: `https://pages.example.test/${TEST_SLUG}/`,
        uploads: [{ path: 'index.html', url: putUrl, headers: signedHeaders }],
      }),
      completePage: () => ({
        slug: TEST_SLUG,
        version: 1,
        activeVersionId: TEST_VERSION_ID,
        viewUrl: `https://pages.example.test/${TEST_SLUG}/`,
        expiresAt: null,
      }),
      puts: new Map([[putUrl, { status: 200 }]]),
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, {}, defaultUploadDeps(fetch));

    expect(result.exitCode).toBe(0);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]?.headers.get('content-type')).toBe('text/html');
    expect(putCalls[0]?.headers.get('content-length')).toBe('13');
    expect(putCalls[0]?.headers.get('x-amz-meta-custom')).toBe('signed-value');
    expect(calls.completePage).toBe(1);
    expect(log.mock.calls.some((c) => String(c[0]).includes(`https://pages.example.test/${TEST_SLUG}/`))).toBe(
      true,
    );
    expect(log.mock.calls.some((c) => String(c[0]).includes('社内限定'))).toBe(true);
    log.mockRestore();
  });

  it('--shared では shared 向けの表示を出す', async () => {
    const dir = await createHtmlDir();
    const putUrl = 'https://s3.example.test/upload/index.html';

    const { fetch } = createFetchMock({
      createPage: () => ({
        slug: TEST_SLUG,
        versionId: TEST_VERSION_ID,
        viewUrl: `https://share.example.test/${TEST_SLUG}/`,
        uploads: [{ path: 'index.html', url: putUrl, headers: {} }],
      }),
      completePage: () => ({
        slug: TEST_SLUG,
        version: 1,
        activeVersionId: TEST_VERSION_ID,
        viewUrl: `https://share.example.test/${TEST_SLUG}/`,
        expiresAt: null,
      }),
      puts: new Map([[putUrl, { status: 200 }]]),
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, { shared: true }, defaultUploadDeps(fetch));

    expect(result.exitCode).toBe(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('URLを知っていれば誰でも閲覧可'))).toBe(true);
    log.mockRestore();
  });

  it('API 400 の details を全件表示する', async () => {
    const dir = await createHtmlDir();
    const { fetch } = createFetchMock({
      createPage: () => ({
        status: 400,
        body: {
          error: {
            code: 'invalid_path',
            message: '検証エラー',
            details: [
              { code: 'invalid_path', message: '無効なパスです: foo' },
              { code: 'missing_index_html', message: 'index.html が必要です' },
            ],
          },
        },
      }),
    });

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(dir, {}, defaultUploadDeps(fetch));

    expect(result.exitCode).toBe(1);
    const messages = error.mock.calls.map((c) => String(c[0]));
    expect(messages).toContain('検証エラー');
    expect(messages).toContain('  - 無効なパスです: foo');
    expect(messages).toContain('  - index.html が必要です');
    error.mockRestore();
    log.mockRestore();
  });

  it('トークンが無いときログインを促す', async () => {
    const dir = await createHtmlDir();
    const { fetch } = createFetchMock({});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(
      dir,
      {},
      {
        ...(defaultUploadDeps(fetch)),
        ensureIdToken: async () => {
          throw new TokenRefreshError('先に `share-html login` を実行してください。');
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain('share-html login');
    error.mockRestore();
  });

  it('設定未完了のとき ConfigError を表示する', async () => {
    const dir = await createHtmlDir();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(
      dir,
      {},
      {
        fetch: globalThis.fetch,
        resolveConfig: async () => {
          throw new ConfigError('CLIの接続先が未設定です。');
        },
        collectFiles,
        ensureIdToken: async () => 'token',
        readFile,
        resolveTitle,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain('未設定');
    error.mockRestore();
  });
});
