import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    dirs.length = 0;
  });

  async function makeConfigDir(): Promise<{ dir: string; configPath: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'share-html-config-'));
    dirs.push(dir);
    const configPath = join(dir, 'config.json');
    return { dir, configPath };
  }

  it('環境変数が設定ファイルより優先される', async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        apiUrl: 'https://file-api.example',
        issuer: 'https://file-issuer.example',
        clientId: 'file-client',
      }),
    );

    const config = await resolveConfig({
      env: {
        SHARE_HTML_API_URL: 'https://env-api.example',
        SHARE_HTML_ISSUER: 'https://env-issuer.example',
        SHARE_HTML_CLIENT_ID: 'env-client',
      },
      configPath,
    });

    expect(config).toEqual({
      apiUrl: 'https://env-api.example',
      issuer: 'https://env-issuer.example',
      clientId: 'env-client',
    });
  });

  it('不足している項目があるとき分かりやすいエラーになる', async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        apiUrl: 'https://api.example',
      }),
    );

    await expect(
      resolveConfig({
        env: {},
        configPath,
      }),
    ).rejects.toMatchObject({
      name: 'ConfigError',
      message: expect.stringContaining('issuer'),
    });

    try {
      await resolveConfig({ env: {}, configPath });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as ConfigError).message;
      expect(message).toContain('SHARE_HTML_ISSUER');
      expect(message).toContain('OidcIssuerUrl');
      expect(message).toContain('SHARE_HTML_CLIENT_ID');
      expect(message).toContain('CliAppClientId');
      expect(message).toContain('CfnOutput');
    }
  });

  it('XDG_CONFIG_HOME 配下の設定ファイルを読める', async () => {
    const xdgRoot = await mkdtemp(join(tmpdir(), 'xdg-config-'));
    dirs.push(xdgRoot);
    const shareDir = join(xdgRoot, 'share-html');
    await mkdir(shareDir, { recursive: true });
    const configPath = join(shareDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        apiUrl: 'https://api.example',
        issuer: 'https://issuer.example',
        clientId: 'client-id',
      }),
    );

    const config = await resolveConfig({
      env: {
        XDG_CONFIG_HOME: xdgRoot,
      },
      configPath,
    });

    expect(config.apiUrl).toBe('https://api.example');
  });
});
