import type { APIGatewayProxyStructuredResultV2, LambdaFunctionURLEvent } from 'aws-lambda';

export const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

export interface PagesCookieDeps {
  /** pages のホスト名。Cookie の Domain と署名する Resource に使う */
  pagesDomain: string;
  /** id_token を検証し、ログ用の email を返す。不正なら例外 */
  verifyIdToken: (idToken: string) => Promise<{ email: string }>;
  /** カスタムポリシーに署名し、Set-Cookie する名前と値を返す */
  signCookies: (policy: string) => Promise<Record<string, string>>;
  now?: () => number;
}

export function createHandler(deps: PagesCookieDeps) {
  const now = deps.now ?? Date.now;

  return async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyStructuredResultV2> => {
    if (event.requestContext.http.method !== 'POST') {
      return { statusCode: 405 };
    }

    const idToken = parseIdToken(event);
    if (!idToken) {
      console.log(JSON.stringify({ result: 'bad-request' }));
      return { statusCode: 400 };
    }

    let email: string;
    try {
      ({ email } = await deps.verifyIdToken(idToken));
    } catch (error) {
      // トークン自体は出さない
      console.log(JSON.stringify({ result: 'unauthorized', reason: errorName(error) }));
      return { statusCode: 401 };
    }

    const expiresAt = Math.floor(now() / 1000) + COOKIE_MAX_AGE_SECONDS;
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: `https://${deps.pagesDomain}/p/*`,
          Condition: { DateLessThan: { 'AWS:EpochTime': expiresAt } },
        },
      ],
    });
    const signed = await deps.signCookies(policy);

    // Path=/p なので /s/* と app には送られない
    const attributes = `Domain=${deps.pagesDomain}; Path=/p; Secure; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
    console.log(JSON.stringify({ result: 'issued', email }));
    return {
      statusCode: 204,
      headers: { 'cache-control': 'no-store' },
      cookies: Object.entries(signed).map(([name, value]) => `${name}=${value}; ${attributes}`),
    };
  };
}

function parseIdToken(event: LambdaFunctionURLEvent): string | null {
  if (!event.body) {
    return null;
  }
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;
  try {
    const parsed: unknown = JSON.parse(raw);
    const idToken = (parsed as { idToken?: unknown } | null)?.idToken;
    return typeof idToken === 'string' && idToken.length > 0 ? idToken : null;
  } catch {
    return null;
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
