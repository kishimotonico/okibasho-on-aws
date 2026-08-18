import { describe, expect, it } from 'vitest';

import { resolveWebConfig, WebConfigError } from '../src/config/env';

describe('resolveWebConfig', () => {
  it('必須の環境変数が揃っていれば設定を返す', () => {
    const config = resolveWebConfig({
      VITE_HOSTED_UI_BASE_URL: 'https://auth.example.com',
      VITE_OIDC_ISSUER: 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool-id',
      VITE_WEB_APP_CLIENT_ID: 'client-id',
    });

    expect(config).toEqual({
      hostedUiBaseUrl: 'https://auth.example.com',
      oidcIssuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool-id',
      webAppClientId: 'client-id',
      apiBaseUrl: '/api',
    });
  });

  it('API ベース URL は常に同一 origin の /api', () => {
    const config = resolveWebConfig({
      VITE_HOSTED_UI_BASE_URL: 'https://auth.example.com',
      VITE_OIDC_ISSUER: 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool-id',
      VITE_WEB_APP_CLIENT_ID: 'client-id',
      VITE_API_BASE_URL: 'http://localhost:8787/api',
    });

    expect(config.apiBaseUrl).toBe('/api');
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
    }
  });
});
