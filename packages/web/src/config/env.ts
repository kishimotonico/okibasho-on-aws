export interface WebConfig {
  hostedUiBaseUrl: string;
  /** OIDC issuer。Cognitoのdiscovery documentはHosted UIドメインではなくこちらにある */
  oidcIssuer: string;
  webAppClientId: string;
  /** 常に同一 origin の /api。開発時は Vite proxy が転送する */
  apiBaseUrl: '/api';
}

export interface WebConfigEnv {
  readonly VITE_HOSTED_UI_BASE_URL?: string;
  readonly VITE_OIDC_ISSUER?: string;
  readonly VITE_WEB_APP_CLIENT_ID?: string;
  readonly VITE_API_BASE_URL?: string;
}

export class WebConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebConfigError';
  }
}

const REQUIRED_FIELDS = [
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
    // 本番・開発ともブラウザからは同一 origin の /api を叩く。
    // 開発時の実 API 先は vite.config.ts の proxy が VITE_API_BASE_URL へ転送する。
    apiBaseUrl: '/api',
  };
}

/** ビルド時に埋め込まれた環境変数から接続先を読み出す */
export function getWebConfig(): WebConfig {
  return resolveWebConfig(import.meta.env);
}
