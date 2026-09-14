import { describe, expect, it, vi } from 'vitest';
import { runList } from '../src/commands/list.js';
import { metadataObjectKey } from '../src/page/s3-keys.js';
import { listPages } from '../src/upload-client.js';
import { FakeS3Store, makeIdToken, TEST_CONFIG, TEST_EMAIL } from './fake-s3.js';

describe('runList', () => {
  it('metadata 付きページを一覧表示する', async () => {
    const store = new FakeS3Store();
    store.objects.set(metadataObjectKey(TEST_EMAIL, 'alpha'), {
      body: Buffer.from(
        JSON.stringify({
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-02-01T00:00:00.000Z',
        }),
      ),
      contentType: 'application/json',
    });
    store.objects.set(metadataObjectKey(TEST_EMAIL, 'beta'), {
      body: Buffer.from(
        JSON.stringify({
          createdAt: '2026-01-02T00:00:00.000Z',
          expiresAt: null,
        }),
      ),
      contentType: 'application/json',
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runList({
      resolveConfig: async () => TEST_CONFIG,
      ensureIdToken: async () => makeIdToken(TEST_EMAIL),
      createS3Client: () => store.asClient(),
      listPages,
    });

    expect(result.exitCode).toBe(0);
    const output = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('alpha');
    expect(output).toContain('beta');
    expect(output).toContain('permanent');
    log.mockRestore();
  });

  it('ページが無いときメッセージを出す', async () => {
    const store = new FakeS3Store();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runList({
      resolveConfig: async () => TEST_CONFIG,
      ensureIdToken: async () => makeIdToken(TEST_EMAIL),
      createS3Client: () => store.asClient(),
      listPages,
    });

    expect(result.exitCode).toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain('ページはありません');
    log.mockRestore();
  });
});
