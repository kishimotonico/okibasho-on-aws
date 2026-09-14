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

const EMAIL_DOMAIN = 'example.jp';
const USER = 'tanaka';
const SLUG = 'q3-report';

function loadHandler(): (event: { request: CloudFrontRequest }) => HandlerResult {
  let source = readFileSync(functionPath, 'utf-8');
  source = source.replaceAll('__EMAIL_DOMAIN__', EMAIL_DOMAIN);

  const sandbox: { handler?: (event: { request: CloudFrontRequest }) => HandlerResult } = {};
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
  const handler = loadHandler();

  it('/p/<user>/<slug>/ を pages/<user>@<domain>/<slug>/index.html に rewrite する', () => {
    const result = handler(makeEvent(`/p/${USER}/${SLUG}/`));
    expect(result).toMatchObject({
      uri: `/pages/${USER}@${EMAIL_DOMAIN}/${SLUG}/index.html`,
    });
  });

  it('/p/<user>/<slug> を末尾スラッシュ付きへ 301 redirect する', () => {
    const result = handler(makeEvent(`/p/${USER}/${SLUG}`));
    expect(result).toMatchObject({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: `/p/${USER}/${SLUG}/` },
      },
    });
  });

  it('/p/<user>/<slug>/assets/app.css を pages prefix 付きパスへ rewrite する', () => {
    const result = handler(makeEvent(`/p/${USER}/${SLUG}/assets/app.css`));
    expect(result).toMatchObject({
      uri: `/pages/${USER}@${EMAIL_DOMAIN}/${SLUG}/assets/app.css`,
    });
  });

  it('user に @ が含まれると 404 を返す', () => {
    const result = handler(makeEvent(`/p/${USER}@evil.jp/${SLUG}/`));
    expect(result).toMatchObject({
      statusCode: 404,
      statusDescription: 'Not Found',
      body: 'Not Found',
    });
  });

  it('/p/ 無しのパスは 404 を返す', () => {
    const result = handler(makeEvent(`/${USER}/${SLUG}/`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('セグメントが足りないパスは 404 を返す', () => {
    const result = handler(makeEvent(`/p/${SLUG}/`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('/p/<user>/ は slug が無いので 404 を返す', () => {
    const result = handler(makeEvent(`/p/${USER}/`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('空セグメントは 404 を返す', () => {
    const result = handler(makeEvent(`/p//${SLUG}/`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('.. セグメントは 404 を返す', () => {
    const result = handler(makeEvent(`/p/${USER}/${SLUG}/../index.html`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('.metadata.json は配信せず 404 を返す', () => {
    const result = handler(makeEvent(`/p/${USER}/${SLUG}/.metadata.json`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('%2f は 404 を返す', () => {
    const result = handler(makeEvent(`/p/${USER}/${SLUG}%2fassets/`));
    expect(result).toMatchObject({
      statusCode: 404,
    });
  });

  it('301 redirect でクエリ文字列を location に付け直す', () => {
    const result = handler(
      makeEvent(`/p/${USER}/${SLUG}`, {
        foo: { value: 'bar' },
        id: { value: '42' },
      }),
    );
    expect(result).toMatchObject({
      statusCode: 301,
      headers: {
        location: { value: `/p/${USER}/${SLUG}/?foo=bar&id=42` },
      },
    });
  });
});
