import { describe, expect, it, vi } from 'vitest';
import * as configModule from '../src/config.js';
import { runCli } from '../src/cli.js';

describe('runCli', () => {
  it('--help を表示する', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain('share-html login');
    expect(log.mock.calls[0]?.[0]).toContain('SHARE_HTML_API_URL');
    log.mockRestore();
  });

  it('-h を表示する', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await runCli(['-h']);
    expect(result.exitCode).toBe(0);
    log.mockRestore();
  });

  it('--version を表示する', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await runCli(['--version']);
    expect(result.exitCode).toBe(0);
    expect(log.mock.calls[0]?.[0]).toBe('0.0.0');
    log.mockRestore();
  });

  it('login サブコマンドに振り分ける', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resolveSpy = vi
      .spyOn(configModule, 'resolveConfig')
      .mockRejectedValue(new configModule.ConfigError('CLIの接続先が未設定です。'));
    const result = await runCli(['login']);
    expect(result.exitCode).toBe(1);
    expect(error.mock.calls.some((c) => String(c[0]).includes('未設定'))).toBe(true);
    resolveSpy.mockRestore();
    error.mockRestore();
  });

  it('logout サブコマンドに振り分ける', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await runCli(['logout']);
    expect(result.exitCode).toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain('ログアウト');
    log.mockRestore();
  });

  it('パス指定はアップロードに振り分ける', async () => {
    const uploadModule = await import('../src/commands/upload.js');
    const uploadSpy = vi.spyOn(uploadModule, 'runUpload').mockResolvedValue({ exitCode: 0 });
    const result = await runCli(['./index.html', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(uploadSpy).toHaveBeenCalledWith('./index.html', {
      name: undefined,
      retention: undefined,
      dryRun: true,
    });
    uploadSpy.mockRestore();
  });

  it('未知のオプションでエラーになる', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runCli(['--unknown']);
    expect(result.exitCode).toBe(1);
    const messages = error.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('Unknown option'))).toBe(true);
    error.mockRestore();
  });

  it('引数なしでエラーになる', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runCli([]);
    expect(result.exitCode).toBe(1);
    error.mockRestore();
  });
});
