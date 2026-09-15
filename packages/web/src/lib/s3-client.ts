import { S3Client } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { createPageStore, type PageStore } from '@okibasho/core';

import type { AuthSession } from '~/auth/user-manager';
import type { WebConfig } from '~/config/env';

export function cognitoLoginKey(config: WebConfig): string {
  return `cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

let cached: { idToken: string; client: S3Client } | null = null;

/**
 * 同じ idToken なら同じクライアントを使い回す。
 * S3Client の中で Cognito の一時認証情報がキャッシュされるため、
 * 操作のたびに作り直すと毎回 GetCredentialsForIdentity を往復することになる。
 * config はビルド時に固定なので鍵に含めない。
 */
export function getPagesS3Client(config: WebConfig, session: AuthSession): S3Client {
  if (cached?.idToken !== session.idToken) {
    cached = { idToken: session.idToken, client: createPagesS3Client(config, session) };
  }
  return cached.client;
}

/** ログイン中のユーザーのページに対する S3 操作 */
export function getPageStore(config: WebConfig, session: AuthSession): PageStore {
  return createPageStore({
    s3: getPagesS3Client(config, session),
    bucket: config.pagesBucket,
    email: session.email,
  });
}

const CREDENTIALS_STORAGE_KEY = 'okibasho:pages-credentials';
/** これを切ったら使い回さず GetCredentialsForIdentity を取り直す */
const CREDENTIALS_MIN_REMAINING_MS = 5 * 60 * 1000;

type PagesCredentials = Awaited<ReturnType<ReturnType<typeof fromCognitoIdentityPool>>>;

interface CachedCredentials {
  idToken: string;
  credentials: PagesCredentials;
}

/**
 * GetCredentialsForIdentity は SDK がキャッシュしないため（GetId と違いリロードのたびに
 * 往復してしまう）、sessionStorage に idToken とセットで残し、有効期限に十分な余裕がある
 * 間だけ使い回す。sessionStorage が使えなくても GetCredentialsForIdentity するだけで壊れない
 */
function loadCachedCredentials(idToken: string): PagesCredentials | null {
  try {
    const raw = window.sessionStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const cached: CachedCredentials = JSON.parse(raw);
    if (cached.idToken !== idToken || !cached.credentials.expiration) {
      return null;
    }
    const expiration = new Date(cached.credentials.expiration);
    if (expiration.getTime() - Date.now() < CREDENTIALS_MIN_REMAINING_MS) {
      return null;
    }
    return { ...cached.credentials, expiration };
  } catch {
    return null;
  }
}

function saveCachedCredentials(idToken: string, credentials: PagesCredentials): void {
  try {
    const cached: CachedCredentials = { idToken, credentials };
    window.sessionStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // 保存できなくても致命的ではない（毎回 GetCredentialsForIdentity するだけ）
  }
}

function withSessionCredentialsCache(
  idToken: string,
  provider: ReturnType<typeof fromCognitoIdentityPool>,
): ReturnType<typeof fromCognitoIdentityPool> {
  return async (props) => {
    const cached = loadCachedCredentials(idToken);
    if (cached) {
      return cached;
    }
    const credentials = await provider(props);
    saveCachedCredentials(idToken, credentials);
    return credentials;
  };
}

export function createPagesS3Client(config: WebConfig, session: AuthSession): S3Client {
  return new S3Client({
    region: config.region,
    // 書き込みの直後に一覧を取り直すので、ブラウザのキャッシュに載せない。
    // S3 の応答は Cache-Control を持たず、同じ URL の GET が
    // メモリキャッシュから返ると変更前のメタデータが見えてしまう
    requestHandler: { cache: 'no-store' },
    credentials: withSessionCredentialsCache(
      session.idToken,
      fromCognitoIdentityPool({
        clientConfig: { region: config.region },
        identityPoolId: config.identityPoolId,
        // GetId の結果（identityId）を SDK 既定のブラウザストレージにユーザー単位でキャッシュさせる。
        // 未指定だと logins を渡した時点でキャッシュ自体が無効になり、リロードのたびに GetId が走る
        userIdentifier: session.email,
        logins: {
          [cognitoLoginKey(config)]: session.idToken,
        },
      }),
    ),
  });
}
