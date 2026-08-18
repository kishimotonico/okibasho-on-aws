import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CreatePageResponse } from '@page-share/shared';
import { ConfigError } from '../src/config.js';
import { runUpload } from '../src/commands/upload.js';
import type { FetchFn } from '../src/upload-client.js';
import { TokenRefreshError } from '../src/token-refresh.js';

const TEST_CONFIG = {
  apiUrl: 'https://api.example.test',
  issuer: 'https://issuer.example.test',
  clientId: 'cli-client',
};

function createFetchMock(handlers: {
  createPage?: (init: RequestInit) => CreatePageResponse | { status: number; body: unknown };
  puts?: Map<string, { status: number; statusText?: string; receivedHeaders?: Headers }>;
}): {
  fetch: FetchFn;
  createPageCalls: number;
  putCalls: Array<{ url: string; headers: Headers }>;
} {
  const putCalls: Array<{ url: string; headers: Headers }> = [];
  let createPageCalls = 0;

  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/api/pages')) {
      createPageCalls++;
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

  return { fetch: fetchFn, createPageCalls, putCalls };
}

async function createHtmlDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'share-html-upload-'));
  await writeFile(join(dir, 'index.html'), '<html></html>');
  return dir;
}

describe('runUpload', () => {
  it('index.html が無いディレクトリは API を呼ばず検証エラーになる', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'share-html-upload-'));
    await writeFile(join(dir, 'page.html'), '<html></html>');

    const { fetch, createPageCalls } = createFetchMock({});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runUpload(
      dir,
      {},
      {
        fetch,
        resolveConfig: async () => TEST_CONFIG,
        collectFiles: (await import('../src/collect-files.js')).collectFiles,
        ensureIdToken: async () => 'token',
        readFile: (await import('node:fs/promises')).readFile,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(createPageCalls).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('index.html'))).toBe(true);
    error.mockRestore();
  });

  it('--dry-run ではネットワークを呼ばない', async () => {
    const dir = await createHtmlDir();
    const { fetch, createPageCalls } = createFetchMock({});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(
      dir,
      { dryRun: true },
      {
        fetch,
        resolveConfig: async () => TEST_CONFIG,
        collectFiles: (await import('../src/collect-files.js')).collectFiles,
        ensureIdToken: async () => {
          throw new Error('ensureIdToken should not be called');
        },
        readFile: (await import('node:fs/promises')).readFile,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(createPageCalls).toBe(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('Dry run'))).toBe(true);
    log.mockRestore();
  });

  it('presigned PUT に API が返した headers をそのまま使う', async () => {
    const dir = await createHtmlDir();
    const putUrl = 'https://s3.example.test/upload/index.html';
    const signedHeaders = {
      'content-type': 'text/html',
      'content-length': '13',
      'x-amz-meta-custom': 'signed-value',
    };

    const { fetch, putCalls } = createFetchMock({
      createPage: () => ({
        slug: 'test-page',
        viewUrl: 'https://pages.example.test/p/test-page/',
        expiresAt: null,
        uploads: [{ path: 'index.html', url: putUrl, headers: signedHeaders }],
      }),
      puts: new Map([[putUrl, { status: 200 }]]),
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runUpload(
      dir,
      {},
      {
        fetch,
        resolveConfig: async () => TEST_CONFIG,
        collectFiles: (await import('../src/collect-files.js')).collectFiles,
        ensureIdToken: async () => 'id-token',
        readFile: (await import('node:fs/promises')).readFile,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]?.headers.get('content-type')).toBe('text/html');
    expect(putCalls[0]?.headers.get('content-length')).toBe('13');
    expect(putCalls[0]?.headers.get('x-amz-meta-custom')).toBe('signed-value');
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

    const result = await runUpload(
      dir,
      {},
      {
        fetch,
        resolveConfig: async () => TEST_CONFIG,
        collectFiles: (await import('../src/collect-files.js')).collectFiles,
        ensureIdToken: async () => 'id-token',
        readFile: (await import('node:fs/promises')).readFile,
      },
    );

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
        fetch,
        resolveConfig: async () => TEST_CONFIG,
        collectFiles: (await import('../src/collect-files.js')).collectFiles,
        ensureIdToken: async () => {
          throw new TokenRefreshError('先に `share-html login` を実行してください。');
        },
        readFile: (await import('node:fs/promises')).readFile,
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
        collectFiles: (await import('../src/collect-files.js')).collectFiles,
        ensureIdToken: async () => 'token',
        readFile: (await import('node:fs/promises')).readFile,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain('未設定');
    error.mockRestore();
  });
});
