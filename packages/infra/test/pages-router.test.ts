import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type CloudFrontQueryEntry = {
  value: string;
  multiValue?: Array<{ value: string }>;
};

type CloudFrontRequest = {
  uri: string;
  querystring: Record<string, CloudFrontQueryEntry>;
  method: string;
  headers: Record<string, unknown>;
};

type HandlerResult =
  | CloudFrontRequest
  | {
      statusCode: number;
      statusDescription: string;
      headers?: Record<string, { value: string }>;
      body?: string;
    };

const functionPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../lib/functions/pages-router.js',
);

const SLUG = 'abcdefghijklmnop';
const VERSION_ID = 'qrstuvwxyz123456';

function loadHandler(
  kvsGet: (key: string) => Promise<string | undefined> = async () =>
    JSON.stringify({ v: VERSION_ID }),
): (event: { request: CloudFrontRequest }) => Promise<HandlerResult> {
  let source = readFileSync(functionPath, 'utf-8');
  source = source.replace(/^import cf from 'cloudfront';\n/, '');
  source = source.replace(/^const kvsHandle = cf\.kvs\(\);\n/, '');

  const sandbox: {
    kvsHandle?: { get: (key: string) => Promise<string | undefined> };
    console?: { log: (...args: unknown[]) => void };
    handler?: (event: { request: CloudFrontRequest }) => Promise<HandlerResult>;
  } = {
    kvsHandle: { get: kvsGet },
    console: { log: vi.fn() },
  };

  runInNewContext(source, sandbox);
  if (!sandbox.handler) {
    throw new Error('handler が定義されていません');
  }
  return sandbox.handler;
}

function makeEvent(uri: string, querystring: Record<string, CloudFrontQueryEntry> = {}) {
  return {
    request: {
      uri,
      querystring,
      method: 'GET',
      headers: {},
    },
  };
}

describe('pages-router', () => {
  it('/<slug>/ を KVS の versionId 付き index.html に rewrite する', async () => {
    const handler = loadHandler();
    const result = await handler(makeEvent(`/${SLUG}/`));
    expect(result).toMatchObject({
      uri: `/${SLUG}/${VERSION_ID}/index.html`,
    });
  });

  it('/<slug> を /<slug>/ へ 301 redirect する（KVS を引かない）', async () => {
    const kvsGet = vi.fn(async () => JSON.stringify({ v: VERSION_ID }));
    const handler = loadHandler(kvsGet);
    const result = await handler(makeEvent(`/${SLUG}`));
    expect(kvsGet).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: `/${SLUG}/` },
      },
    });
  });

  it('/<slug>/assets/app.css を versionId 付きパスへ rewrite する', async () => {
    const handler = loadHandler();
    const result = await handler(makeEvent(`/${SLUG}/assets/app.css`));
    expect(result).toMatchObject({
      uri: `/${SLUG}/${VERSION_ID}/assets/app.css`,
    });
  });

  it('KVS キー無しは sentinel URI へ rewrite する', async () => {
    const handler = loadHandler(async () => undefined);
    const result = await handler(makeEvent(`/${SLUG}/`));
    expect(result).toMatchObject({
      uri: '/__missing__/index.html',
    });
  });

  it('KVS の e が期限切れなら sentinel URI へ rewrite する', async () => {
    const handler = loadHandler(async () =>
      JSON.stringify({ v: VERSION_ID, e: Math.floor(Date.now() / 1000) - 1 }),
    );
    const result = await handler(makeEvent(`/${SLUG}/`));
    expect(result).toMatchObject({
      uri: '/__missing__/index.html',
    });
  });

  it('KVS 例外時も sentinel URI へ rewrite する', async () => {
    const handler = loadHandler(async () => {
      throw new Error('kvs unavailable');
    });
    const result = await handler(makeEvent(`/${SLUG}/`));
    expect(result).toMatchObject({
      uri: '/__missing__/index.html',
    });
  });

  it('/ は 404 を返す', async () => {
    const handler = loadHandler();
    const result = await handler(makeEvent('/'));
    expect(result).toMatchObject({
      statusCode: 404,
      statusDescription: 'Not Found',
      body: 'Not Found',
    });
  });

  it('slug 長が不正なら 404 を返す', async () => {
    const handler = loadHandler();
    const result = await handler(makeEvent('/shortslug/'));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('空セグメントは 404 を返す', async () => {
    const handler = loadHandler();
    const result = await handler(makeEvent(`//${SLUG}/`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('.. セグメントは 404 を返す', async () => {
    const handler = loadHandler();
    const result = await handler(makeEvent(`/${SLUG}/../index.html`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('%2f は 404 を返す', async () => {
    const handler = loadHandler();
    const result = await handler(makeEvent(`/${SLUG}%2fassets/`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('301 redirect でクエリ文字列を location に付け直す', async () => {
    const handler = loadHandler();
    const result = await handler(
      makeEvent(`/${SLUG}`, {
        foo: { value: 'bar' },
        id: { value: '42' },
      }),
    );
    expect(result).toMatchObject({
      statusCode: 301,
      headers: {
        location: { value: `/${SLUG}/?foo=bar&id=42` },
      },
    });
  });
});
