import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as nodeCrypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

type CloudFrontQueryEntry = {
  value: string;
  multiValue?: Array<{ value: string }>;
};

type CloudFrontRequest = {
  uri: string;
  querystring: Record<string, CloudFrontQueryEntry>;
  method: string;
  headers: Record<string, { value: string } | undefined>;
};

type HandlerEvent = {
  viewer: { ip: string };
  request: CloudFrontRequest;
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
  '../lib/functions/share-router.js',
);

/** テスト用の偽 KVS ストア。projector が投影するエントリを直接差し込む */
function createFakeCf(store: Map<string, string>) {
  return {
    kvs() {
      return {
        get(key: string) {
          if (store.has(key)) {
            return Promise.resolve(store.get(key));
          }
          return Promise.reject(new Error(`key not found: ${key}`));
        },
      };
    },
  };
}

function loadHandler(store: Map<string, string>): (event: HandlerEvent) => Promise<HandlerResult> {
  let source = readFileSync(functionPath, 'utf-8');
  // cloudfront-js-2.0 専用の import はNode vmでは動かないので、偽実装に差し替える
  source = source.replace("import crypto from 'crypto';", '');
  source = source.replace("import cf from 'cloudfront';", '');

  const sandbox: {
    handler?: (event: HandlerEvent) => Promise<HandlerResult>;
    crypto: typeof nodeCrypto;
    cf: ReturnType<typeof createFakeCf>;
    Buffer: typeof Buffer;
    console: Console;
  } = {
    crypto: nodeCrypto,
    cf: createFakeCf(store),
    Buffer,
    console,
  };
  runInNewContext(source, sandbox);
  if (!sandbox.handler) {
    throw new Error('handler が定義されていません');
  }
  return sandbox.handler;
}

function makeEvent(
  uri: string,
  options: {
    ip?: string;
    authorization?: string;
    querystring?: Record<string, CloudFrontQueryEntry>;
  } = {},
): HandlerEvent {
  const headers: CloudFrontRequest['headers'] = {};
  if (options.authorization !== undefined) {
    headers.authorization = { value: options.authorization };
  }
  return {
    viewer: { ip: options.ip ?? '203.0.113.5' },
    request: {
      uri,
      querystring: options.querystring ?? {},
      method: 'GET',
      headers,
    },
  };
}

function sha256Hex(input: string): string {
  return nodeCrypto.createHash('sha256').update(input).digest('hex');
}

function basicAuthHeader(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'; // 22文字, [A-Za-z0-9_-]

describe('share-router', () => {
  it('コードサイズは10KB以下(CloudFront Functionsの上限)', () => {
    const size = statSync(functionPath).size;
    expect(size).toBeLessThanOrEqual(10 * 1024);
  });

  let store: Map<string, string>;
  let handler: (event: HandlerEvent) => Promise<HandlerResult>;

  beforeEach(() => {
    store = new Map();
    handler = loadHandler(store);
  });

  it('/s/<id> を末尾スラッシュ付きへ301 redirectする', async () => {
    const result = await handler(makeEvent(`/s/${ID}`));
    expect(result).toMatchObject({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: `/s/${ID}/` } },
    });
  });

  it('301 redirectでクエリ文字列をlocationに付け直す', async () => {
    const result = await handler(makeEvent(`/s/${ID}`, { querystring: { foo: { value: 'bar' } } }));
    expect(result).toMatchObject({
      statusCode: 301,
      headers: { location: { value: `/s/${ID}/?foo=bar` } },
    });
  });

  it('%2f は404を返す', async () => {
    const result = await handler(makeEvent(`/s/${ID}%2fassets/`));
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('.. セグメントは404を返す', async () => {
    const result = await handler(makeEvent(`/s/${ID}/../index.html`));
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('空セグメントは404を返す', async () => {
    const result = await handler(makeEvent(`/s/${ID}//index.html`));
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('.metadata.json は404を返す', async () => {
    store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3/' }));
    const result = await handler(makeEvent(`/s/${ID}/.metadata.json`));
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('idの形式が不正なら404を返す', async () => {
    const result = await handler(makeEvent('/s/short-id/'));
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('KVSに無いidは404を返す', async () => {
    const result = await handler(makeEvent(`/s/${ID}/`));
    expect(result).toMatchObject({ statusCode: 404, body: 'Not Found' });
  });

  it('墓標エントリ({"t": ...})は404を返す(share-idの再利用防止で残っているだけなので閲覧はさせない)', async () => {
    store.set(ID, JSON.stringify({ t: 'pages/tanaka@example.jp/q3/' }));
    const result = await handler(makeEvent(`/s/${ID}/`));
    expect(result).toMatchObject({ statusCode: 404, body: 'Not Found' });
  });

  it('制限が無ければ /p 相当の prefix + rest へrewriteし、末尾スラッシュはindex.htmlを補完する', async () => {
    store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3-report/' }));
    const result = await handler(makeEvent(`/s/${ID}/`));
    expect(result).toMatchObject({
      uri: '/pages/tanaka@example.jp/q3-report/index.html',
    });
  });

  it('アセットパスもrewriteされる', async () => {
    store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3-report/' }));
    const result = await handler(makeEvent(`/s/${ID}/assets/app.css`));
    expect(result).toMatchObject({
      uri: '/pages/tanaka@example.jp/q3-report/assets/app.css',
    });
  });

  it('Authorizationヘッダはオリジンへ転送しない', async () => {
    store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3-report/' }));
    const event = makeEvent(`/s/${ID}/`, { authorization: 'Basic garbage' });
    const result = (await handler(event)) as CloudFrontRequest;
    expect(result.headers.authorization).toBeUndefined();
  });

  describe('IP制限', () => {
    it('CIDRに含まれるIPは許可する', async () => {
      store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3/', c: ['203.0.113.0/24'] }));
      const result = await handler(makeEvent(`/s/${ID}/`, { ip: '203.0.113.5' }));
      expect(result).toMatchObject({ uri: '/pages/tanaka@example.jp/q3/index.html' });
    });

    it('CIDRに含まれないIPは403を返す', async () => {
      store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3/', c: ['203.0.113.0/24'] }));
      const result = await handler(makeEvent(`/s/${ID}/`, { ip: '198.51.100.9' }));
      expect(result).toMatchObject({ statusCode: 403 });
    });

    it('/32(単一IP)は完全一致だけ許可する', async () => {
      store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3/', c: ['203.0.113.5/32'] }));
      expect(await handler(makeEvent(`/s/${ID}/`, { ip: '203.0.113.5' }))).toMatchObject({
        uri: expect.any(String),
      });
      expect(await handler(makeEvent(`/s/${ID}/`, { ip: '203.0.113.6' }))).toMatchObject({
        statusCode: 403,
      });
    });

    it('/0は常に一致する(左シフト32のJS仕様に依存しない実装になっている)', async () => {
      store.set(ID, JSON.stringify({ p: 'pages/tanaka@example.jp/q3/', c: ['0.0.0.0/0'] }));
      const result = await handler(makeEvent(`/s/${ID}/`, { ip: '8.8.8.8' }));
      expect(result).toMatchObject({ uri: expect.any(String) });
    });

    it('複数CIDRのいずれかに一致すれば許可する', async () => {
      store.set(
        ID,
        JSON.stringify({
          p: 'pages/tanaka@example.jp/q3/',
          c: ['198.51.100.0/24', '203.0.113.0/24'],
        }),
      );
      const result = await handler(makeEvent(`/s/${ID}/`, { ip: '203.0.113.9' }));
      expect(result).toMatchObject({ uri: expect.any(String) });
    });
  });

  describe('Basic認証', () => {
    const salt = 'saltsaltsaltsaltsaltsa';
    const username = 'tanaka';
    const password = 'sup3r-secret';
    const hash = sha256Hex(`${salt}:${username}:${password}`);

    beforeEach(() => {
      store.set(
        ID,
        JSON.stringify({
          p: 'pages/tanaka@example.jp/q3/',
          b: `${salt}:${hash}`,
        }),
      );
    });

    it('Authorizationヘッダが無いと401とWWW-Authenticateを返す', async () => {
      const result = await handler(makeEvent(`/s/${ID}/`));
      expect(result).toMatchObject({
        statusCode: 401,
        headers: {
          'www-authenticate': { value: 'Basic realm="okibasho", charset="UTF-8"' },
        },
      });
    });

    it('正しいusername/passwordなら通す', async () => {
      const result = await handler(
        makeEvent(`/s/${ID}/`, { authorization: basicAuthHeader(username, password) }),
      );
      expect(result).toMatchObject({ uri: '/pages/tanaka@example.jp/q3/index.html' });
    });

    it('パスワードが違うと401を返す', async () => {
      const result = await handler(
        makeEvent(`/s/${ID}/`, { authorization: basicAuthHeader(username, 'wrong-password') }),
      );
      expect(result).toMatchObject({ statusCode: 401 });
    });

    it('Basicではない形式は401を返す', async () => {
      const result = await handler(makeEvent(`/s/${ID}/`, { authorization: 'Bearer sometoken' }));
      expect(result).toMatchObject({ statusCode: 401 });
    });
  });
});
