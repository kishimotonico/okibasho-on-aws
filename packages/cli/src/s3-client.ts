import { S3Client } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import type { ResolvedConfig } from './config.js';

export function createS3Client(config: ResolvedConfig, idToken: string): S3Client {
  return new S3Client({
    region: config.region,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: config.region },
      identityPoolId: config.identityPoolId,
      logins: {
        [`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`]: idToken,
      },
    }),
  });
}
