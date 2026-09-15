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
export function getPagesS3Client(config: WebConfig, idToken: string): S3Client {
  if (cached?.idToken !== idToken) {
    cached = { idToken, client: createPagesS3Client(config, idToken) };
  }
  return cached.client;
}

/** ログイン中のユーザーのページに対する S3 操作 */
export function getPageStore(config: WebConfig, session: AuthSession): PageStore {
  return createPageStore({
    s3: getPagesS3Client(config, session.idToken),
    bucket: config.pagesBucket,
    email: session.email,
  });
}

export function createPagesS3Client(config: WebConfig, idToken: string): S3Client {
  return new S3Client({
    region: config.region,
    // 書き込みの直後に一覧を取り直すので、ブラウザのキャッシュに載せない。
    // S3 の応答は Cache-Control を持たず、同じ URL の GET が
    // メモリキャッシュから返ると変更前のメタデータが見えてしまう
    requestHandler: { cache: 'no-store' },
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: config.region },
      identityPoolId: config.identityPoolId,
      logins: {
        [cognitoLoginKey(config)]: idToken,
      },
    }),
  });
}
