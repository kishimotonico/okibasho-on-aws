import { readFile } from 'node:fs/promises';
import { getConfigFilePath, type PathEnv } from './paths.js';

export interface ResolvedConfig {
  apiUrl: string;
  issuer: string;
  clientId: string;
}

interface ConfigFile {
  apiUrl?: string;
  issuer?: string;
  clientId?: string;
}

const CONFIG_FIELDS = [
  {
    key: 'apiUrl' as const,
    envVar: 'SHARE_HTML_API_URL',
    cfnOutput: 'ApiEndpointUrl',
    configKey: 'apiUrl' as const,
  },
  {
    key: 'issuer' as const,
    envVar: 'SHARE_HTML_ISSUER',
    cfnOutput: 'OidcIssuerUrl',
    configKey: 'issuer' as const,
  },
  {
    key: 'clientId' as const,
    envVar: 'SHARE_HTML_CLIENT_ID',
    cfnOutput: 'CliAppClientId',
    configKey: 'clientId' as const,
  },
] as const;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

async function readConfigFile(configPath: string): Promise<ConfigFile> {
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ConfigError(`設定ファイルの形式が不正です: ${configPath}`);
    }
    return parsed as ConfigFile;
  } catch (err) {
    if (err instanceof ConfigError) {
      throw err;
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return {};
    }
    throw new ConfigError(
      `設定ファイルを読み込めませんでした: ${configPath}\n内容を確認するか、環境変数で値を指定してください。`,
    );
  }
}

export interface ResolveConfigOptions {
  env?: PathEnv;
  configPath?: string;
}

/**
 * 環境変数を設定ファイルより優先して接続先を解決する。
 */
export async function resolveConfig(options: ResolveConfigOptions = {}): Promise<ResolvedConfig> {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? getConfigFilePath(env);
  const file = await readConfigFile(configPath);

  const resolved: Partial<ResolvedConfig> = {};
  const missing: Array<(typeof CONFIG_FIELDS)[number]> = [];

  for (const field of CONFIG_FIELDS) {
    const fromEnv = env[field.envVar]?.trim();
    const fromFile = file[field.configKey]?.trim();
    const value = fromEnv || fromFile;
    if (value) {
      resolved[field.key] = value;
    } else {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    const lines = [
      'CLIの接続先が未設定です。次の項目を環境変数か設定ファイルで指定してください。',
      '',
      `設定ファイル: ${configPath}`,
      '',
      ...missing.map(
        (f) =>
          `  - ${f.key}\n` +
          `      環境変数: ${f.envVar}\n` +
          `      CDKの CfnOutput: ${f.cfnOutput}\n` +
          `      設定ファイルのキー: "${f.configKey}"`,
      ),
      '',
      'デプロイ直後は `cdk deploy` の出力から CfnOutput の値をコピーし、',
      '環境変数に設定するか、上記パスに config.json を作成してください。',
      '',
      '例:',
      '{',
      '  "apiUrl": "https://...",',
      '  "issuer": "https://cognito-idp....amazonaws.com/...",',
      '  "clientId": "..."',
      '}',
    ];
    throw new ConfigError(lines.join('\n'));
  }

  return resolved as ResolvedConfig;
}
