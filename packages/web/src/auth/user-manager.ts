import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

import { getWebConfig } from '~/config/env';

const RETURN_PATH_KEY = 'page-share:auth:returnTo';

function createSessionStorage(): WebStorageStateStore {
  // アップロードされた untrusted な HTML は別 origin（pages 側）で配信されるため、
  // Same-Origin Policy により管理アプリの storage を読めない。これが設計上の主要な防御になる。
  // localStorage ではなく sessionStorage にするのは、タブを閉じたら消えるぶん露出時間が短いため。
  // Phase 3 で app 側に __Host- プレフィックス付きのセッション Cookie を導入する予定があり、
  // そのときにこの置き方は見直しになる。
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

export function createUserManager(): UserManager {
  const config = getWebConfig();
  const storage = createSessionStorage();

  return new UserManager({
    authority: config.oidcIssuer,
    metadata: buildMetadata(config.hostedUiBaseUrl, config.oidcIssuer),
    client_id: config.webAppClientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
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

export function saveReturnPath(path: string): void {
  sessionStorage.setItem(RETURN_PATH_KEY, path);
}

export function consumeReturnPath(): string {
  const value = sessionStorage.getItem(RETURN_PATH_KEY);
  sessionStorage.removeItem(RETURN_PATH_KEY);
  return value && value.startsWith('/') ? value : '/';
}
