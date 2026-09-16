import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../lib/lambda/pages-cookie/handler.js';

const NOW = Date.UTC(2026, 8, 16, 0, 0, 0);

function makeEvent(body: string | undefined, method = 'POST'): LambdaFunctionURLEvent {
  return {
    body,
    isBase64Encoded: false,
    requestContext: { http: { method } },
  } as unknown as LambdaFunctionURLEvent;
}

function setup(verify: (idToken: string) => Promise<{ email: string }>) {
  const signCookies = vi.fn(async (_policy: string) => ({
    'CloudFront-Policy': 'p',
    'CloudFront-Signature': 's',
    'CloudFront-Key-Pair-Id': 'K123',
  }));
  const handler = createHandler({
    pagesDomain: 'okibasho.example.com',
    verifyIdToken: verify,
    signCookies,
    now: () => NOW,
  });
  return { handler, signCookies };
}

describe('pages-cookie', () => {
  it('検証できた id_token に 24 時間の Signed Cookie を発行する', async () => {
    const { handler, signCookies } = setup(async () => ({ email: 'tanaka@example.jp' }));

    const result = await handler(makeEvent(JSON.stringify({ idToken: 'token' })));

    expect(result.statusCode).toBe(204);
    expect(JSON.parse(signCookies.mock.calls[0]![0])).toEqual({
      Statement: [
        {
          Resource: 'https://okibasho.example.com/p/*',
          Condition: { DateLessThan: { 'AWS:EpochTime': NOW / 1000 + 86400 } },
        },
      ],
    });
    const attributes =
      'Domain=okibasho.example.com; Path=/p; Secure; HttpOnly; SameSite=Lax; Max-Age=86400';
    expect(result.cookies).toEqual([
      `CloudFront-Policy=p; ${attributes}`,
      `CloudFront-Signature=s; ${attributes}`,
      `CloudFront-Key-Pair-Id=K123; ${attributes}`,
    ]);
  });

  it('検証に失敗したら 401 で Cookie を出さない', async () => {
    const { handler, signCookies } = setup(async () => {
      throw new Error('expired');
    });

    const result = await handler(makeEvent(JSON.stringify({ idToken: 'token' })));

    expect(result).toMatchObject({ statusCode: 401 });
    expect(result.cookies).toBeUndefined();
    expect(signCookies).not.toHaveBeenCalled();
  });

  it.each([undefined, 'not json', '{}', '{"idToken":1}'])('ボディ %s は 400', async (body) => {
    const { handler } = setup(async () => ({ email: 'tanaka@example.jp' }));

    expect(await handler(makeEvent(body))).toMatchObject({ statusCode: 400 });
  });

  it('POST 以外は 405', async () => {
    const { handler } = setup(async () => ({ email: 'tanaka@example.jp' }));

    expect(await handler(makeEvent(undefined, 'GET'))).toMatchObject({ statusCode: 405 });
  });
});
