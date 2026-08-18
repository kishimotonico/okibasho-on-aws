import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

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

function loadHandler(): (event: { request: CloudFrontRequest }) => HandlerResult {
  const sandbox: { handler?: (event: { request: CloudFrontRequest }) => HandlerResult } = {};
  runInNewContext(readFileSync(functionPath, 'utf-8'), sandbox);
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
  const handler = loadHandler();

  it('/p/test/ を /pages/test/index.html にrewriteする', () => {
    const result = handler(makeEvent('/p/test/'));
    expect(result).toMatchObject({
      uri: '/pages/test/index.html',
    });
  });

  it('/p/test を /p/test/ へ301 redirectする', () => {
    const result = handler(makeEvent('/p/test'));
    expect(result).toMatchObject({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: '/p/test/' },
      },
    });
  });

  it('/p/test/assets/app.css を /pages/test/assets/app.css にrewriteする', () => {
    const result = handler(makeEvent('/p/test/assets/app.css'));
    expect(result).toMatchObject({
      uri: '/pages/test/assets/app.css',
    });
  });

  it('/p/test/sub/ を /pages/test/sub/index.html にrewriteする', () => {
    const result = handler(makeEvent('/p/test/sub/'));
    expect(result).toMatchObject({
      uri: '/pages/test/sub/index.html',
    });
  });

  it('/p/test/sub を /p/test/sub/ へ301 redirectする', () => {
    const result = handler(makeEvent('/p/test/sub'));
    expect(result).toMatchObject({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: '/p/test/sub/' },
      },
    });
  });

  it('/p/ を /pages/index.html にrewriteする', () => {
    const result = handler(makeEvent('/p/'));
    expect(result).toMatchObject({
      uri: '/pages/index.html',
    });
  });

  it('/ は404を返す', () => {
    const result = handler(makeEvent('/'));
    expect(result).toMatchObject({
      statusCode: 404,
      statusDescription: 'Not Found',
      body: 'Not Found',
    });
  });

  it('/pages/test/index.html は404を返す', () => {
    const result = handler(makeEvent('/pages/test/index.html'));
    expect(result).toMatchObject({
      statusCode: 404,
      statusDescription: 'Not Found',
      body: 'Not Found',
    });
  });

  it('/meta/test.json は404を返す', () => {
    const result = handler(makeEvent('/meta/test.json'));
    expect(result).toMatchObject({
      statusCode: 404,
      statusDescription: 'Not Found',
      body: 'Not Found',
    });
  });

  it('301 redirectでクエリ文字列をlocationに付け直す', () => {
    const result = handler(
      makeEvent('/p/test', {
        foo: { value: 'bar' },
        id: { value: '42' },
      }),
    );
    expect(result).toMatchObject({
      statusCode: 301,
      headers: {
        location: { value: '/p/test/?foo=bar&id=42' },
      },
    });
  });
});
