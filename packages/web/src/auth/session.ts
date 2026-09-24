import { OidcClient, UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { redirect } from '@tanstack/react-router';

import { NotSignedInError } from '~/auth/not-signed-in-error';
import { getWebConfig } from '~/config/env';

const RETURN_PATH_KEY = 'okibasho:auth:returnTo';

/**
 * discoveryに頼らず、エンドポイントを明示する。
 *
 * Cognitoのdiscovery document (/.well-known/openid-configuration) があるのは
 * issuer (https://cognito-idp.<region>.amazonaws.com/<userPoolId>) 側で、
 * Hosted UIのドメインには無い。一方でauthorize / tokenの実体はHosted UI側にある。
 * 2つのホストにまたがるため、どちらをauthorityにしても片方が欠ける。
 * どちらのURLもCfnOutputから分かっているので、組み立てて渡すほうが確実。
 */
function buildMetadata(hostedUiBaseUrl: string, issuer: string) {
  const hostedUi = hostedUiBaseUrl.replace(/\/$/, '');
  const issuerUrl = issuer.replace(/\/$/, '');
  return {
    issuer: issuerUrl,
    authorization_endpoint: `${hostedUi}/oauth2/authorize`,
    token_endpoint: `${hostedUi}/oauth2/token`,
    userinfo_endpoint: `${hostedUi}/oauth2/userInfo`,
    revocation_endpoint: `${hostedUi}/oauth2/revoke`,
    jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
  };
}

function buildOidcSettings() {
  const config = getWebConfig();
  return {
    authority: config.oidcIssuer,
    metadata: buildMetadata(config.hostedUiBaseUrl, config.oidcIssuer),
    client_id: config.webAppClientId,
    redirect_uri: `${window.location.origin}/callback`,
    post_logout_redirect_uri: window.location.origin,
    response_type: 'code',
    scope: 'openid email profile',
    // untrusted な HTML は別 origin（pages 側）で配信され storage を読めないので、トークンはタブ間で共有する
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  };
}

// UserManager と OidcClient で settings（stateStore 含む）が食い違わないよう、一度だけ作って共有する
let oidcSettings: ReturnType<typeof buildOidcSettings> | null = null;

function getOidcSettings(): ReturnType<typeof buildOidcSettings> {
  oidcSettings ??= buildOidcSettings();
  return oidcSettings;
}

let userManager: UserManager | null = null;

function getUserManager(): UserManager {
  userManager ??= new UserManager(getOidcSettings());
  return userManager;
}

let oidcClient: OidcClient | null = null;

// signinRedirect は即座に遷移するため、route の beforeLoad から throw redirect(...) する形に載せられない。
// createSigninRequest は遷移せずに authorize URL だけを返す公開 API なのでこちらを使う
function getOidcClient(): OidcClient {
  oidcClient ??= new OidcClient(getOidcSettings());
  return oidcClient;
}

/**
 * 保存済みトークンを書き換える処理（更新・ログイン完了・ログアウト）は、タブをまたいで一つずつ走らせる。
 * ログアウトで消したトークンを、別タブで先に始まっていた更新が後から書き戻すのを防ぐ。
 */
async function withTokenLock<T>(operation: () => Promise<T>): Promise<T> {
  return navigator.locks.request('okibasho:auth:tokens', operation);
}

/**
 * Cognitoのログアウトは標準のRP-Initiated Logoutではなく、
 * /logout?client_id=...&logout_uri=... という独自の形をとる。
 * oidc-client-ts の signoutRedirect は id_token_hint と post_logout_redirect_uri を
 * 送るため噛み合わない。ローカルの状態を消してから自分でリダイレクトする。
 * logout_uri はApp Clientのサインアウト先として登録済みである必要がある。
 */
export function buildLogoutUrl(
  hostedUiBaseUrl: string,
  clientId: string,
  returnTo: string,
): string {
  const hostedUi = hostedUiBaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ client_id: clientId, logout_uri: returnTo });
  return `${hostedUi}/logout?${params.toString()}`;
}

/** email は S3 のキーに使うため小文字で揃える */
function emailFromUser(user: User): string | null {
  return typeof user.profile.email === 'string' ? user.profile.email.trim().toLowerCase() : null;
}

/**
 * 保存済みユーザーを返す。期限切れなら refresh token で更新してから返す。
 * 呼び出し側が同時に呼んでも、後のほうはロックの中で更新済みのトークンを読む。
 */
export function loadUser(): Promise<User | null> {
  const manager = getUserManager();
  return withTokenLock(async () => {
    const user = await manager.getUser();
    if (!user?.expired) {
      return user;
    }
    return manager.signinSilent().catch(() => null);
  });
}

export function saveReturnPath(path: string): void {
  sessionStorage.setItem(RETURN_PATH_KEY, path);
}

/** 保存した戻り先を消費する。同じ origin の相対パス以外（"//evil.example" や絶対 URL）は "/" に寄せる */
export function consumeReturnPath(): string {
  const value = sessionStorage.getItem(RETURN_PATH_KEY);
  sessionStorage.removeItem(RETURN_PATH_KEY);
  if (!value) {
    return '/';
  }
  const url = new URL(value, window.location.origin);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : '/';
}

/** S3 を呼ぶ直前など、使う時点で読む。未ログイン・期限切れの更新失敗では投げる */
export async function requireIdToken(): Promise<string> {
  const user = await loadUser();
  if (!user?.id_token) {
    throw new NotSignedInError();
  }
  return user.id_token;
}

/**
 * ルート直下の認証ゲート。未ログインなら戻り先を保存して Managed Login へ redirect する。
 * 管理UIはチーム内専用でIAMがセキュリティ境界のため、未ログインで見せる画面は用意しない
 */
export async function requireSignedIn(returnPath: string): Promise<{ email: string }> {
  // loadUser は期限切れなら更新し、失敗すれば null を返すので、ここでは期限切れを気にしなくてよい
  const user = await loadUser();
  const email = user ? emailFromUser(user) : null;
  if (email) {
    return { email };
  }

  saveReturnPath(returnPath);
  const signinRequest = await getOidcClient().createSigninRequest({});
  throw redirect({ href: signinRequest.url });
}

/**
 * ローカルのログイン状態を消し、続けて遷移する先（Cognito の /logout）を返す。
 * Cognito の /logout は refresh token を失効させないので、持ち出された token が 30 日使えないよう先に失効させる。
 */
export async function signOut(): Promise<string> {
  const manager = getUserManager();
  await withTokenLock(async () => {
    await manager.revokeTokens(['refresh_token']);
    await manager.removeUser();
  });
  const config = getWebConfig();
  return buildLogoutUrl(config.hostedUiBaseUrl, config.webAppClientId, window.location.origin);
}

let signinCallbackPromise: Promise<string> | null = null;

// loader が複数回走っても signinRedirectCallback（code_verifier を使い切る）は一度しか送らない。
// signinCallback は state の request_type で振り分けるが、createSigninRequest の state には request_type が無い
export function completeSignInCallbackOnce(): Promise<string> {
  const manager = getUserManager();
  signinCallbackPromise ??= withTokenLock(() => manager.signinRedirectCallback()).then(() =>
    consumeReturnPath(),
  );
  return signinCallbackPromise;
}
