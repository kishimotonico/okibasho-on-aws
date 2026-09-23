import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

import { getWebConfig } from '~/config/env';
import { clearPersistedPages } from '~/lib/query-persistence';
import { clearPagesCredentialsCache } from '~/lib/s3-client';

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

  return new UserManager({
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

/** ローカルのログイン状態を消し、続けて遷移する先（Cognito の /logout）を返す */
export async function signOut(): Promise<string> {
  await clearPersistedPages();
  clearPagesCredentialsCache();
  await getUserManager().removeUser();
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

let loadUserPromise: Promise<User | null> | null = null;

/**
 * 保存済みユーザーを返す。期限切れなら refresh token で更新してから返す。
 * automaticSilentRenew は期限切れ前のタイマーだけで、タブを開き直したあとは動かない。
 * AuthProvider と loader が同時に走っても、signinSilent は一度だけにする。
 */
export function loadUser(): Promise<User | null> {
  loadUserPromise ??= restoreUser().finally(() => {
    loadUserPromise = null;
  });
  return loadUserPromise;
}

async function restoreUser(): Promise<User | null> {
  const manager = getUserManager();
  const user = await manager.getUser();
  if (!user || !user.expired) {
    return user;
  }
  if (!user.refresh_token) {
    return null;
  }
  try {
    return await manager.signinSilent();
  } catch {
    return null;
  }
}

/** route の loader など、React の外からログイン情報を読む */
export async function loadAuthSession(): Promise<AuthSession | null> {
  return sessionFromUser(await loadUser());
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

// loader が複数回走っても signinCallback（code_verifier を使い切る）は一度しか送らない
export function completeSignInCallbackOnce(): Promise<string> {
  signinCallbackPromise ??= getUserManager()
    .signinCallback()
    .then(() => consumeReturnPath());
  return signinCallbackPromise;
}
