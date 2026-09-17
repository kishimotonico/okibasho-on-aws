import { describe, expect, it } from 'vitest';

import type { WebConfig } from '../src/config/env';
import { cognitoLoginKey } from '../src/lib/s3-client';

const config: WebConfig = {
  hostedUiBaseUrl: 'https://auth.example.com',
  oidcIssuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool-id',
  webAppClientId: 'client-id',
  identityPoolId: 'ap-northeast-1:identity-pool-id',
  userPoolId: 'ap-northeast-1_userPoolId',
  region: 'ap-northeast-1',
  pagesBucket: 'pages-bucket',
  pagesBaseUrl: 'https://pages.example.com',
  appBaseUrl: 'https://app.example.com',
};

describe('cognitoLoginKey', () => {
  it('Cognito User Pool の login キーを組み立てる', () => {
    expect(cognitoLoginKey(config)).toBe(
      'cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_userPoolId',
    );
  });
});
