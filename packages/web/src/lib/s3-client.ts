import type { S3Client as S3ClientType } from '@aws-sdk/client-s3';
import type { fromCognitoIdentityPool as FromCognitoIdentityPoolType } from '@aws-sdk/credential-providers';
import type { PageStore } from '@okibasho/core/page-store';

import type { AuthSession } from '~/auth/user-manager';
import type { WebConfig } from '~/config/env';

export function cognitoLoginKey(config: WebConfig): string {
  return `cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

/**
 * S3・Cognito の SDK チャンクの読み込みだけを先に始める。ページを開いたらすぐ、
 * 一覧取得（getPageStore 経由でどのみち読み込む）を待たずに呼び、並行させる
 */
export function preloadPagesSdk(): void {
  void import('@aws-sdk/client-s3');
  void import('@aws-sdk/credential-providers');
  void import('@okibasho/core/page-store');
}

let cached: { idToken: string; clientPromise: Promise<S3ClientType> } | null = null;

/**
 * 同じ idToken なら同じクライアントを使い回す。
 * S3Client の中で Cognito の一時認証情報がキャッシュされるため、
 * 操作のたびに作り直すと毎回 GetCredentialsForIdentity を往復することになる。
 * config はビルド時に固定なので鍵に含めない。
 * Promise の段階でキャッシュに載せ、同時呼び出しが同じ Promise を共有するようにする
 * （await 後に載せると、待っている間の呼び出しがそれぞれ作り直してしまう）。失敗時はキャッシュから外す
 */
export async function getPagesS3Client(
  config: WebConfig,
  session: AuthSession,
): Promise<S3ClientType> {
  if (cached?.idToken !== session.idToken) {
    const clientPromise = createPagesS3Client(config, session);
    cached = { idToken: session.idToken, clientPromise };
    clientPromise.catch(() => {
      if (cached?.clientPromise === clientPromise) {
        cached = null;
      }
    });
  }
  return cached.clientPromise;
}

/** ログイン中のユーザーのページに対する S3 操作 */
export async function getPageStore(config: WebConfig, session: AuthSession): Promise<PageStore> {
  const [{ createPageStore }, s3] = await Promise.all([
    import('@okibasho/core/page-store'),
    getPagesS3Client(config, session),
  ]);
  return createPageStore({ s3, bucket: config.pagesBucket, email: session.email });
}

const CREDENTIALS_STORAGE_KEY = 'okibasho:pages-credentials';
/** これを切ったら使い回さず GetCredentialsForIdentity を取り直す */
const CREDENTIALS_MIN_REMAINING_MS = 5 * 60 * 1000;

type PagesCredentials = Awaited<ReturnType<ReturnType<typeof FromCognitoIdentityPoolType>>>;

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

/** ログアウト時、sessionStorage の一時クレデンシャルと S3Client の使い回し（cached）をまとめて消す */
export function clearPagesCredentialsCache(): void {
  try {
    window.sessionStorage.removeItem(CREDENTIALS_STORAGE_KEY);
  } catch {
    // 消せなくても次回 GetCredentialsForIdentity するだけなので致命的ではない
  }
  cached = null;
}

function withSessionCredentialsCache(
  idToken: string,
  provider: ReturnType<typeof FromCognitoIdentityPoolType>,
): ReturnType<typeof FromCognitoIdentityPoolType> {
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

export async function createPagesS3Client(
  config: WebConfig,
  session: AuthSession,
): Promise<S3ClientType> {
  const [{ S3Client }, { fromCognitoIdentityPool }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/credential-providers'),
  ]);

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
