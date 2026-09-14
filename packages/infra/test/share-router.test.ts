import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
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
  source = source.replace("import cf from 'cloudfront';", '');

  const sandbox: {
    handler?: (event: HandlerEvent) => Promise<HandlerResult>;
    cf: ReturnType<typeof createFakeCf>;
    console: Console;
  } = {
    cf: createFakeCf(store),
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

function basicAuthHeader(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

const TAG = 'AAAAAAAAAAA'; // 11文字, [A-Za-z0-9_-]
const SHARE_ID = 'BBBBBBBBBBBBBBBBBBBBBB'; // 22文字, [A-Za-z0-9_-]
const ID = TAG + SHARE_ID; // 33文字。URLの /s/<id>/ 部分
const PASSWORD = 'k7mq-3xwp-9rtd-h2vn';
const B_FIELD = basicAuthHeader('guest', PASSWORD).slice('Basic '.length);

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

  it('idの形式が不正なら404を返す(33文字未満)', async () => {
    const result = await handler(makeEvent('/s/short-id/'));
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('KVSに無いtagは404を返す', async () => {
    const result = await handler(makeEvent(`/s/${ID}/`));
    expect(result).toMatchObject({ statusCode: 404, body: 'Not Found' });
  });

  it('tagはKVSにあるが値のidが後半22文字と一致しないと404を返す(再発行後の旧URLなど)', async () => {
    store.set(
      TAG,
      JSON.stringify({ p: 'pages/tanaka@example.jp/q3/', id: 'c'.repeat(22), b: B_FIELD }),
    );
    const result = await handler(makeEvent(`/s/${ID}/`));
    expect(result).toMatchObject({ statusCode: 404, body: 'Not Found' });
  });

  describe('IP制限', () => {
    it('完全一致するIPは許可する', async () => {
      store.set(
        TAG,
        JSON.stringify({
          p: 'pages/tanaka@example.jp/q3/',
          id: SHARE_ID,
          b: B_FIELD,
          ips: ['203.0.113.5'],
        }),
      );
      const result = await handler(
        makeEvent(`/s/${ID}/`, {
          ip: '203.0.113.5',
          authorization: basicAuthHeader('guest', PASSWORD),
        }),
      );
      expect(result).toMatchObject({ uri: '/pages/tanaka@example.jp/q3/index.html' });
    });

    it('リストに無いIPは403を返す(Basic認証より先に判定する)', async () => {
      store.set(
        TAG,
        JSON.stringify({
          p: 'pages/tanaka@example.jp/q3/',
          id: SHARE_ID,
          b: B_FIELD,
          ips: ['203.0.113.5'],
        }),
      );
      const result = await handler(makeEvent(`/s/${ID}/`, { ip: '198.51.100.9' }));
      expect(result).toMatchObject({ statusCode: 403 });
    });

    it('複数件のいずれかに一致すれば許可する', async () => {
      store.set(
        TAG,
        JSON.stringify({
          p: 'pages/tanaka@example.jp/q3/',
          id: SHARE_ID,
          b: B_FIELD,
          ips: ['198.51.100.9', '203.0.113.5'],
        }),
      );
      const result = await handler(
        makeEvent(`/s/${ID}/`, {
          ip: '203.0.113.5',
          authorization: basicAuthHeader('guest', PASSWORD),
        }),
      );
      expect(result).toMatchObject({ uri: expect.any(String) });
    });
  });

  describe('Basic認証', () => {
    beforeEach(() => {
      store.set(
        TAG,
        JSON.stringify({ p: 'pages/tanaka@example.jp/q3/', id: SHARE_ID, b: B_FIELD }),
      );
    });

    it('制限が無ければ prefix + rest へrewriteし、末尾スラッシュはindex.htmlを補完する', async () => {
      const result = await handler(
        makeEvent(`/s/${ID}/`, { authorization: basicAuthHeader('guest', PASSWORD) }),
      );
      expect(result).toMatchObject({ uri: '/pages/tanaka@example.jp/q3/index.html' });
    });

    it('アセットパスもrewriteされる', async () => {
      const result = await handler(
        makeEvent(`/s/${ID}/assets/app.css`, {
          authorization: basicAuthHeader('guest', PASSWORD),
        }),
      );
      expect(result).toMatchObject({ uri: '/pages/tanaka@example.jp/q3/assets/app.css' });
    });

    it('Authorizationヘッダはオリジンへ転送しない', async () => {
      const event = makeEvent(`/s/${ID}/`, {
        authorization: basicAuthHeader('guest', PASSWORD),
      });
      const result = (await handler(event)) as CloudFrontRequest;
      expect(result.headers.authorization).toBeUndefined();
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

    it('パスワードが違うと401を返す', async () => {
      const result = await handler(
        makeEvent(`/s/${ID}/`, { authorization: basicAuthHeader('guest', 'wrong-password') }),
      );
      expect(result).toMatchObject({ statusCode: 401 });
    });

    it('ユーザー名が違うと401を返す(ユーザー名はguest固定)', async () => {
      const result = await handler(
        makeEvent(`/s/${ID}/`, { authorization: basicAuthHeader('tanaka', PASSWORD) }),
      );
      expect(result).toMatchObject({ statusCode: 401 });
    });

    it('Basicではない形式は401を返す', async () => {
      const result = await handler(makeEvent(`/s/${ID}/`, { authorization: 'Bearer sometoken' }));
      expect(result).toMatchObject({ statusCode: 401 });
    });
  });

  describe('パスワード無し(bが無いエントリ)', () => {
    it('Authorizationヘッダが無くてもrewriteされる(Basic認証をしない)', async () => {
      store.set(TAG, JSON.stringify({ p: 'pages/tanaka@example.jp/q3/', id: SHARE_ID }));
      const result = await handler(makeEvent(`/s/${ID}/`));
      expect(result).toMatchObject({ uri: '/pages/tanaka@example.jp/q3/index.html' });
    });

    it('IP制限があればそちらは引き続き判定する', async () => {
      store.set(
        TAG,
        JSON.stringify({
          p: 'pages/tanaka@example.jp/q3/',
          id: SHARE_ID,
          ips: ['203.0.113.5'],
        }),
      );
      const result = await handler(makeEvent(`/s/${ID}/`, { ip: '198.51.100.9' }));
      expect(result).toMatchObject({ statusCode: 403 });
    });
  });
});
