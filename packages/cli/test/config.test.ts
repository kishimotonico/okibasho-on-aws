import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, resolveConfig } from '../src/config.js';

const FULL_CONFIG = {
  issuer: 'https://issuer.example',
  clientId: 'client-id',
  identityPoolId: 'ap-northeast-1:pool',
  userPoolId: 'ap-northeast-1_pool',
  region: 'ap-northeast-1',
  bucket: 'pages-bucket',
  pagesBaseUrl: 'https://pages.example',
};

describe('resolveConfig', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    dirs.length = 0;
  });

  async function makeConfigDir(): Promise<{ dir: string; configPath: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'okibasho-config-'));
    dirs.push(dir);
    const configPath = join(dir, 'config.json');
    return { dir, configPath };
  }

  it('環境変数が設定ファイルより優先される', async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        ...FULL_CONFIG,
        issuer: 'https://file-issuer.example',
        clientId: 'file-client',
      }),
    );

    const config = await resolveConfig({
      env: {
        OKIBA_ISSUER: 'https://env-issuer.example',
        OKIBA_CLIENT_ID: 'env-client',
        OKIBA_IDENTITY_POOL_ID: FULL_CONFIG.identityPoolId,
        OKIBA_USER_POOL_ID: FULL_CONFIG.userPoolId,
        OKIBA_REGION: FULL_CONFIG.region,
        OKIBA_BUCKET: FULL_CONFIG.bucket,
        OKIBA_PAGES_BASE_URL: FULL_CONFIG.pagesBaseUrl,
      },
      configPath,
    });

    expect(config).toEqual({
      ...FULL_CONFIG,
      issuer: 'https://env-issuer.example',
      clientId: 'env-client',
    });
  });

  it('不足している項目があるとき分かりやすいエラーになる', async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        issuer: 'https://issuer.example',
      }),
    );

    await expect(
      resolveConfig({
        env: {},
        configPath,
      }),
    ).rejects.toMatchObject({
      name: 'ConfigError',
      message: expect.stringContaining('clientId'),
    });

    try {
      await resolveConfig({ env: {}, configPath });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as ConfigError).message;
      expect(message).toContain('OKIBA_CLIENT_ID');
      expect(message).toContain('CliAppClientId');
      expect(message).toContain('OKIBA_PAGES_BASE_URL');
      expect(message).toContain('CfnOutput');
    }
  });

  it('XDG_CONFIG_HOME 配下の設定ファイルを読める', async () => {
    const xdgRoot = await mkdtemp(join(tmpdir(), 'xdg-config-'));
    dirs.push(xdgRoot);
    const shareDir = join(xdgRoot, 'okibasho');
    await mkdir(shareDir, { recursive: true });
    const configPath = join(shareDir, 'config.json');
    await writeFile(configPath, JSON.stringify(FULL_CONFIG));

    const config = await resolveConfig({
      env: {
        XDG_CONFIG_HOME: xdgRoot,
      },
      configPath,
    });

    expect(config.pagesBaseUrl).toBe('https://pages.example');
  });
});
