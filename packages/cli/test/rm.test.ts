import { describe, expect, it, vi } from 'vitest';
import { metadataObjectKey, pageObjectKey } from '@okibasho/core';
import { runRm } from '../src/commands/rm.js';
import { FakeS3Store, makeIdToken, TEST_CONFIG, TEST_EMAIL } from './fake-s3.js';

describe('runRm', () => {
  it('prefix 配下を削除する', async () => {
    const store = new FakeS3Store();
    store.objects.set(pageObjectKey(TEST_EMAIL, 'demo', 'index.html'), {
      body: Buffer.from('<html></html>'),
    });
    store.objects.set(metadataObjectKey(TEST_EMAIL, 'demo'), {
      body: Buffer.from('{}'),
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runRm('demo', {
      resolveConfig: async () => TEST_CONFIG,
      ensureIdToken: async () => makeIdToken(TEST_EMAIL),
      createS3Client: () => store.asClient(),
    });

    expect(result.exitCode).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain('demo');
    log.mockRestore();
  });

  it('存在しない slug でも成功する', async () => {
    const store = new FakeS3Store();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runRm('missing', {
      resolveConfig: async () => TEST_CONFIG,
      ensureIdToken: async () => makeIdToken(TEST_EMAIL),
      createS3Client: () => store.asClient(),
    });

    expect(result.exitCode).toBe(0);
    log.mockRestore();
  });

  it('無効な slug は拒否する', async () => {
    const store = new FakeS3Store();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runRm('Bad', {
      resolveConfig: async () => TEST_CONFIG,
      ensureIdToken: async () => makeIdToken(TEST_EMAIL),
      createS3Client: () => store.asClient(),
    });

    expect(result.exitCode).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain('無効な slug');
    error.mockRestore();
  });
});
