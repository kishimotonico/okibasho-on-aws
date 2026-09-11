import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  None,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';
import { CALLBACK_PATH } from '../callback-ports.js';
import { ConfigError, resolveConfig, type ResolvedConfig } from '../config.js';
import { tryOpenBrowser } from '../browser.js';
import { createCallbackServer, PortsInUseError } from '../port.js';
import { saveTokens } from '../token-store.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>okiba</title></head>
<body>
<p>ログインが完了しました。ターミナルに戻ってください。</p>
</body>
</html>`;

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function formatUserMessage(err: unknown): string {
  if (err instanceof ConfigError || err instanceof PortsInUseError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '予期しないエラーが発生しました。';
}

export async function runLogin(): Promise<void> {
  let config: ResolvedConfig;
  try {
    config = await resolveConfig();
  } catch (err) {
    console.error(formatUserMessage(err));
    process.exitCode = 1;
    return;
  }

  let callbackServer;
  try {
    callbackServer = await createCallbackServer();
  } catch (err) {
    console.error(formatUserMessage(err));
    process.exitCode = 1;
    return;
  }

  const { port, server } = callbackServer;
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = randomState();

  let oidcConfig: Configuration;
  try {
    oidcConfig = await discovery(new URL(config.issuer), config.clientId, undefined, None());
  } catch (err) {
    server.close();
    console.error(
      `認証サーバー (${config.issuer}) に接続できませんでした。\n` +
        'OKIBA_ISSUER の値が正しいか確認してください。',
    );
    process.exitCode = 1;
    return;
  }

  const authUrl = buildAuthorizationUrl(oidcConfig, {
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  console.log('ブラウザでログインしてください:');
  console.log(authUrl.href);
  await tryOpenBrowser(authUrl.href);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            'ログインがタイムアウトしました (5分)。もう一度 okiba login を実行してください。',
          ),
        );
      }, LOGIN_TIMEOUT_MS);

      server.on('request', (req: IncomingMessage, res: ServerResponse) => {
        void handleCallback(req, res);
      });

      async function handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (!req.url) {
          sendHtml(res, 400, '<p>不正なリクエストです。</p>');
          return;
        }

        const requestUrl = new URL(req.url, redirectUri);
        if (requestUrl.pathname !== CALLBACK_PATH) {
          sendHtml(res, 404, '<p>Not Found</p>');
          return;
        }

        if (requestUrl.searchParams.get('error')) {
          clearTimeout(timeout);
          const description =
            requestUrl.searchParams.get('error_description') ?? '認証が拒否されました。';
          sendHtml(res, 400, `<p>${escapeHtml(description)}</p>`);
          server.close();
          reject(new Error(description));
          return;
        }

        const returnedState = requestUrl.searchParams.get('state');
        if (returnedState !== state) {
          clearTimeout(timeout);
          sendHtml(res, 400, '<p>state が一致しません。もう一度 login を実行してください。</p>');
          server.close();
          reject(new Error('認証応答の検証に失敗しました (state)。'));
          return;
        }

        try {
          const tokens = await authorizationCodeGrant(oidcConfig, requestUrl, {
            expectedState: state,
            pkceCodeVerifier: codeVerifier,
          });

          const refreshToken = tokens.refresh_token;
          const idToken = tokens.id_token;
          if (!refreshToken || !idToken) {
            throw new Error('トークン応答に refresh_token または id_token が含まれていません。');
          }

          const obtainedAt = Date.now();
          const expiresIn = tokens.expiresIn();
          const expiresAt =
            expiresIn !== undefined ? obtainedAt + expiresIn * 1000 : obtainedAt + 3600 * 1000;

          await saveTokens({
            refreshToken,
            idToken,
            expiresAt,
            obtainedAt,
            issuer: config.issuer,
            clientId: config.clientId,
          });

          const claims = tokens.claims();
          const email = typeof claims?.email === 'string' ? claims.email : undefined;

          sendHtml(res, 200, SUCCESS_HTML);
          clearTimeout(timeout);
          server.close();
          console.log('Authenticated.');
          if (email) {
            console.log(email);
          }
          resolve();
        } catch (err) {
          clearTimeout(timeout);
          sendHtml(
            res,
            500,
            '<p>トークンの取得に失敗しました。ターミナルのメッセージを確認してください。</p>',
          );
          server.close();
          reject(err);
        }
      }
    });
  } catch (err) {
    server.close();
    console.error(formatUserMessage(err));
    process.exitCode = 1;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
