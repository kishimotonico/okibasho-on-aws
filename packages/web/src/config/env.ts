export interface WebConfig {
  hostedUiBaseUrl: string;
  /** OIDC issuer。Cognitoのdiscovery documentはHosted UIドメインではなくこちらにある */
  oidcIssuer: string;
  webAppClientId: string;
  identityPoolId: string;
  userPoolId: string;
  region: string;
  pagesBucket: string;
  pagesBaseUrl: string;
  appBaseUrl: string;
}

export interface WebConfigEnv {
  readonly VITE_HOSTED_UI_BASE_URL?: string;
  readonly VITE_OIDC_ISSUER?: string;
  readonly VITE_WEB_APP_CLIENT_ID?: string;
  readonly VITE_IDENTITY_POOL_ID?: string;
  readonly VITE_USER_POOL_ID?: string;
  readonly VITE_REGION?: string;
  readonly VITE_PAGES_BUCKET?: string;
  readonly VITE_PAGES_BASE_URL?: string;
  readonly VITE_APP_BASE_URL?: string;
}

export class WebConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebConfigError';
  }
}

export const REQUIRED_FIELDS = [
  {
    key: 'hostedUiBaseUrl' as const,
    envVar: 'VITE_HOSTED_UI_BASE_URL',
    cfnOutput: 'HostedUiBaseUrl',
  },
  {
    key: 'oidcIssuer' as const,
    envVar: 'VITE_OIDC_ISSUER',
    cfnOutput: 'OidcIssuerUrl',
  },
  {
    key: 'webAppClientId' as const,
    envVar: 'VITE_WEB_APP_CLIENT_ID',
    cfnOutput: 'WebAppClientId',
  },
  {
    key: 'identityPoolId' as const,
    envVar: 'VITE_IDENTITY_POOL_ID',
    cfnOutput: 'IdentityPoolId',
  },
  {
    key: 'userPoolId' as const,
    envVar: 'VITE_USER_POOL_ID',
    cfnOutput: 'UserPoolId',
  },
  {
    key: 'region' as const,
    envVar: 'VITE_REGION',
    cfnOutput: 'Region',
  },
  {
    key: 'pagesBucket' as const,
    envVar: 'VITE_PAGES_BUCKET',
    cfnOutput: 'PagesBucketName',
  },
  {
    key: 'pagesBaseUrl' as const,
    envVar: 'VITE_PAGES_BASE_URL',
    cfnOutput: 'PagesBaseUrl',
  },
  {
    key: 'appBaseUrl' as const,
    envVar: 'VITE_APP_BASE_URL',
    cfnOutput: 'AppUrl',
  },
] as const;

export function resolveWebConfig(env: WebConfigEnv): WebConfig {
  const missing: Array<(typeof REQUIRED_FIELDS)[number]> = [];
  const values: Partial<Record<(typeof REQUIRED_FIELDS)[number]['key'], string>> = {};

  for (const field of REQUIRED_FIELDS) {
    const value = env[field.envVar]?.trim();
    if (value) {
      values[field.key] = value;
    } else {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    const lines = [
      'Web UIの接続先が未設定です。次の項目をビルド時の環境変数で指定してください。',
      '',
      ...missing.map(
        (field) => `  - ${field.envVar}\n` + `      CDKの CfnOutput: ${field.cfnOutput}`,
      ),
      '',
      'デプロイ直後は `cdk deploy` の出力から CfnOutput の値をコピーし、',
      '.env または CI の環境変数に設定してください。',
    ];
    throw new WebConfigError(lines.join('\n'));
  }

  return {
    hostedUiBaseUrl: values.hostedUiBaseUrl!,
    oidcIssuer: values.oidcIssuer!,
    webAppClientId: values.webAppClientId!,
    identityPoolId: values.identityPoolId!,
    userPoolId: values.userPoolId!,
    region: values.region!,
    pagesBucket: values.pagesBucket!,
    pagesBaseUrl: values.pagesBaseUrl!,
    appBaseUrl: values.appBaseUrl!,
  };
}

/** ビルド時に埋め込まれた環境変数から接続先を読み出す */
export function getWebConfig(): WebConfig {
  return resolveWebConfig(import.meta.env);
}
