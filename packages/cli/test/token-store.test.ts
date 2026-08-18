import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearTokens, loadTokens, saveTokens } from '../src/token-store.js';

describe('token-store', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    dirs.length = 0;
  });

  async function makeTokenPath(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'share-html-tokens-'));
    dirs.push(dir);
    return join(dir, 'tokens.json');
  }

  const sampleConfig = {
    issuer: 'https://issuer.example',
    clientId: 'client-abc',
  };

  const sampleTokens = {
    refreshToken: 'refresh-value',
    idToken: 'id-token-value',
    expiresAt: Date.now() + 3600_000,
    obtainedAt: Date.now(),
    issuer: sampleConfig.issuer,
    clientId: sampleConfig.clientId,
  };

  it('保存して読み戻せる', async () => {
    const tokenPath = await makeTokenPath();
    await saveTokens(sampleTokens, { tokenPath });

    const loaded = await loadTokens(sampleConfig, { tokenPath });
    expect(loaded).toEqual(sampleTokens);
  });

  it('ディレクトリが 0700、ファイルが 0600 になる', async () => {
    const tokenPath = await makeTokenPath();
    await saveTokens(sampleTokens, { tokenPath });

    const dirStat = await stat(dirname(tokenPath));
    const fileStat = await stat(tokenPath);

    expect(dirStat.mode & 0o777).toBe(0o700);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it('既存ファイルを上書きしても 0600 のまま', async () => {
    const tokenPath = await makeTokenPath();
    await mkdir(dirname(tokenPath), { recursive: true });
    await writeFile(tokenPath, '{}', { mode: 0o644 });

    await saveTokens(sampleTokens, { tokenPath });

    const fileStat = await stat(tokenPath);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it('issuer / clientId が変わったトークンは無効', async () => {
    const tokenPath = await makeTokenPath();
    await saveTokens(sampleTokens, { tokenPath });

    const loaded = await loadTokens(
      { issuer: 'https://other.example', clientId: sampleConfig.clientId },
      { tokenPath },
    );
    expect(loaded).toBeNull();

    const loaded2 = await loadTokens(
      { issuer: sampleConfig.issuer, clientId: 'other-client' },
      { tokenPath },
    );
    expect(loaded2).toBeNull();
  });

  it('clearTokens で削除できる', async () => {
    const tokenPath = await makeTokenPath();
    await saveTokens(sampleTokens, { tokenPath });
    await clearTokens({ tokenPath });

    const loaded = await loadTokens(sampleConfig, { tokenPath });
    expect(loaded).toBeNull();
  });
});
