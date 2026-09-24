import { describe, expect, it, vi } from 'vitest';
import * as tokenRefreshModule from '../src/token-refresh.js';
import * as tokenStoreModule from '../src/token-store.js';
import { runLogout } from '../src/commands/logout.js';

const sampleTokens = {
  refreshToken: 'refresh-value',
  idToken: 'id-token-value',
  expiresAt: Date.now() + 3600_000,
  obtainedAt: Date.now(),
  issuer: 'https://issuer.example',
  clientId: 'client-abc',
};

describe('runLogout', () => {
  it('保存済みトークンがあれば失効させてから削除する', async () => {
    const readSpy = vi.spyOn(tokenStoreModule, 'readStoredTokens').mockResolvedValue(sampleTokens);
    const revokeSpy = vi
      .spyOn(tokenRefreshModule, 'revokeRefreshToken')
      .mockResolvedValue(undefined);
    const clearSpy = vi.spyOn(tokenStoreModule, 'clearTokens').mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runLogout();

    expect(revokeSpy).toHaveBeenCalledWith(sampleTokens);
    expect(clearSpy).toHaveBeenCalled();
    expect(log.mock.calls[0]?.[0]).toContain('ログアウト');

    readSpy.mockRestore();
    revokeSpy.mockRestore();
    clearSpy.mockRestore();
    log.mockRestore();
  });

  it('保存済みトークンが無ければ失効させずに削除だけする', async () => {
    const readSpy = vi.spyOn(tokenStoreModule, 'readStoredTokens').mockResolvedValue(null);
    const revokeSpy = vi
      .spyOn(tokenRefreshModule, 'revokeRefreshToken')
      .mockResolvedValue(undefined);
    const clearSpy = vi.spyOn(tokenStoreModule, 'clearTokens').mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runLogout();

    expect(revokeSpy).not.toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();

    readSpy.mockRestore();
    revokeSpy.mockRestore();
    clearSpy.mockRestore();
    log.mockRestore();
  });

  it('失効に失敗したらローカルのトークンを残したままエラーを投げる', async () => {
    const readSpy = vi.spyOn(tokenStoreModule, 'readStoredTokens').mockResolvedValue(sampleTokens);
    const revokeSpy = vi
      .spyOn(tokenRefreshModule, 'revokeRefreshToken')
      .mockRejectedValue(new Error('revoke failed'));
    const clearSpy = vi.spyOn(tokenStoreModule, 'clearTokens').mockResolvedValue(undefined);

    await expect(runLogout()).rejects.toThrow('revoke failed');
    expect(clearSpy).not.toHaveBeenCalled();

    readSpy.mockRestore();
    revokeSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
