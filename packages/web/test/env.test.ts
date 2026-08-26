import { describe, expect, it } from 'vitest';

import { resolveWebConfig, WebConfigError } from '../src/config/env';

const validEnv = {
  VITE_HOSTED_UI_BASE_URL: 'https://auth.example.com',
  VITE_OIDC_ISSUER: 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool-id',
  VITE_WEB_APP_CLIENT_ID: 'client-id',
  VITE_IDENTITY_POOL_ID: 'ap-northeast-1:identity-pool-id',
  VITE_USER_POOL_ID: 'ap-northeast-1_userPoolId',
  VITE_REGION: 'ap-northeast-1',
  VITE_PAGES_BUCKET: 'pages-bucket',
  VITE_PAGES_BASE_URL: 'https://pages.example.com',
};

describe('resolveWebConfig', () => {
  it('必須の環境変数が揃っていれば設定を返す', () => {
    const config = resolveWebConfig(validEnv);

    expect(config).toEqual({
      hostedUiBaseUrl: 'https://auth.example.com',
      oidcIssuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool-id',
      webAppClientId: 'client-id',
      identityPoolId: 'ap-northeast-1:identity-pool-id',
      userPoolId: 'ap-northeast-1_userPoolId',
      region: 'ap-northeast-1',
      pagesBucket: 'pages-bucket',
      pagesBaseUrl: 'https://pages.example.com',
    });
  });

  it('必須項目が欠けていれば CfnOutput 名付きで落ちる', () => {
    expect(() => resolveWebConfig({})).toThrow(WebConfigError);
    try {
      resolveWebConfig({});
    } catch (err) {
      const message = (err as WebConfigError).message;
      expect(message).toContain('VITE_HOSTED_UI_BASE_URL');
      expect(message).toContain('HostedUiBaseUrl');
      expect(message).toContain('VITE_OIDC_ISSUER');
      expect(message).toContain('OidcIssuerUrl');
      expect(message).toContain('VITE_WEB_APP_CLIENT_ID');
      expect(message).toContain('WebAppClientId');
      expect(message).toContain('VITE_IDENTITY_POOL_ID');
      expect(message).toContain('IdentityPoolId');
      expect(message).toContain('VITE_USER_POOL_ID');
      expect(message).toContain('UserPoolId');
      expect(message).toContain('VITE_REGION');
      expect(message).toContain('Region');
      expect(message).toContain('VITE_PAGES_BUCKET');
      expect(message).toContain('PagesBucketName');
      expect(message).toContain('VITE_PAGES_BASE_URL');
      expect(message).toContain('PagesBaseUrl');
    }
  });
});
