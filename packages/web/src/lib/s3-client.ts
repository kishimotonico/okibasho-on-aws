import { S3Client } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';

import type { WebConfig } from '~/config/env';

export function cognitoLoginKey(config: WebConfig): string {
  return `cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

export function createPagesS3Client(config: WebConfig, idToken: string): S3Client {
  return new S3Client({
    region: config.region,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: config.region },
      identityPoolId: config.identityPoolId,
      logins: {
        [cognitoLoginKey(config)]: idToken,
      },
    }),
  });
}
