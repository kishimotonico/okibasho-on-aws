import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

import { getWebConfig } from '~/config/env';

const RETURN_PATH_KEY = 'okibasho:auth:returnTo';

function createSessionStorage(): WebStorageStateStore {
  // アップロードされた untrusted な HTML は別 origin（pages 側）で配信されるため、
  // Same-Origin Policy により管理アプリの storage を読めない。これが設計上の主要な防御になる。
  // localStorage ではなく sessionStorage にするのは、タブを閉じたら消えるぶん露出時間が短いため。
  return new WebStorageStateStore({ store: window.sessionStorage });
}

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
    jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
  };
}

let userManager: UserManager | null = null;

/**
 * UserManager はアプリでひとつだけ持つ。
 * React の外（route の loader）からもログイン状態を読むため、
 * AuthProvider の内側に閉じ込めず、モジュールで共有する。
 * 複数インスタンスを作るとトークンの自動更新タイマーが二重に走る。
 */
export function getUserManager(): UserManager {
  userManager ??= createUserManager();
  return userManager;
}

function createUserManager(): UserManager {
  const config = getWebConfig();
  const storage = createSessionStorage();

  return new UserManager({
    authority: config.oidcIssuer,
    metadata: buildMetadata(config.hostedUiBaseUrl, config.oidcIssuer),
    client_id: config.webAppClientId,
    redirect_uri: `${window.location.origin}/callback`,
    post_logout_redirect_uri: window.location.origin,
    response_type: 'code',
    scope: 'openid email profile',
    userStore: storage,
    stateStore: storage,
    automaticSilentRenew: true,
  });
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

export function getLogoutUrl(): string {
  const config = getWebConfig();
  return buildLogoutUrl(config.hostedUiBaseUrl, config.webAppClientId, window.location.origin);
}

/** S3 を呼ぶのに必要なログイン情報。email は S3 のキーに使うため小文字で揃える */
export interface AuthSession {
  email: string;
  idToken: string;
}

export function sessionFromUser(user: User | null): AuthSession | null {
  if (!user || user.expired) {
    return null;
  }
  const email =
    typeof user.profile.email === 'string' ? user.profile.email.trim().toLowerCase() : null;
  if (!email || !user.id_token) {
    return null;
  }
  return { email, idToken: user.id_token };
}

/** route の loader など、React の外からログイン情報を読む */
export async function loadAuthSession(): Promise<AuthSession | null> {
  return sessionFromUser(await getUserManager().getUser());
}

export function saveReturnPath(path: string): void {
  sessionStorage.setItem(RETURN_PATH_KEY, path);
}

export function consumeReturnPath(): string {
  const value = sessionStorage.getItem(RETURN_PATH_KEY);
  sessionStorage.removeItem(RETURN_PATH_KEY);
  return value && value.startsWith('/') ? value : '/';
}

let signinCallbackPromise: Promise<string> | null = null;

/**
 * /callback の loader から呼ぶ。StrictMode やルーターの再実行で loader が複数回走っても、
 * signinCallback（code・code_verifier を使い切る token 交換）は一度しか送らないよう
 * Promise をモジュールに保持して共有する。
 */
export function completeSignInCallbackOnce(): Promise<string> {
  signinCallbackPromise ??= getUserManager()
    .signinCallback()
    .then(() => consumeReturnPath());
  return signinCallbackPromise;
}
