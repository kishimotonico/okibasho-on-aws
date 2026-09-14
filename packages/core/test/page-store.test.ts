import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPageStore } from '../src/page-store.js';
import { computeExpiresAt } from '../src/page/retention.js';
import { metadataObjectKey, pageObjectKey } from '../src/page/s3-keys.js';
import { FakeS3Store } from './fake-s3.js';

const email = 'tanaka@example.jp';
const now = '2026-08-26T00:00:00.000Z';
const share = { id: 'a'.repeat(22), allowedCidrs: ['203.0.113.0/24'] };

function setup() {
  const fake = new FakeS3Store();
  const store = createPageStore({ s3: fake.asClient(), bucket: 'pages-bucket', email });
  return { fake, store };
}

function html(body = '<html></html>') {
  return { path: 'index.html', body: Buffer.from(body) };
}

describe('createPageStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('新規アップロードでファイルと metadata を書く。Blob と Buffer のどちらも受ける', async () => {
    const { fake, store } = setup();
    const progress: Array<[number, number]> = [];

    const metadata = await store.upload(
      'q3-report',
      [html(), { path: 'style.css', body: new Blob(['body{}'], { type: 'text/css' }) }],
      { retention: 'temporary', existing: null, onProgress: (c, t) => progress.push([c, t]) },
    );

    expect(metadata).toEqual({ createdAt: now, expiresAt: computeExpiresAt('temporary', now) });
    expect(fake.getJson(metadataObjectKey(email, 'q3-report'))).toEqual(metadata);
    expect(fake.objects.get(pageObjectKey(email, 'q3-report', 'index.html'))?.contentType).toBe(
      'text/html',
    );
    const css = fake.objects.get(pageObjectKey(email, 'q3-report', 'style.css'));
    expect(css?.body.toString('utf8')).toBe('body{}');
    expect(css?.contentType).toBe('text/css');
    // total に metadata は含めない
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('再アップロードで古いオブジェクトを消し、createdAt と share を引き継いで期限を数え直す', async () => {
    const { fake, store } = setup();
    const staleKey = pageObjectKey(email, 'q3-report', 'old.css');
    fake.objects.set(staleKey, { body: Buffer.from('old') });
    const existing = {
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-08-31T00:00:00.000Z',
      share,
    };

    const metadata = await store.upload('q3-report', [html()], {
      retention: 'temporary',
      existing,
    });

    expect(fake.objects.has(staleKey)).toBe(false);
    expect(fake.objects.has(pageObjectKey(email, 'q3-report', 'index.html'))).toBe(true);
    expect(metadata).toEqual({
      createdAt: existing.createdAt,
      expiresAt: computeExpiresAt('temporary', now),
      share,
    });
  });

  it('permanent 化済みページは temporary 指定で再アップロードしても無期限のまま', async () => {
    const { store } = setup();

    const metadata = await store.upload('q3-report', [html()], {
      retention: 'temporary',
      existing: { createdAt: '2026-08-01T00:00:00.000Z', expiresAt: null },
    });

    expect(metadata.expiresAt).toBeNull();
  });

  it('share を渡したときだけ既存の share を差し替える', async () => {
    const { store } = setup();
    const next = { id: 'b'.repeat(22) };

    const metadata = await store.upload('q3-report', [html()], {
      retention: 'permanent',
      existing: { createdAt: '2026-08-01T00:00:00.000Z', expiresAt: null, share },
      share: next,
    });

    expect(metadata.share).toEqual(next);
  });

  it('保存期間の変更は作成時刻から数え、share を引き継ぐ', async () => {
    const { fake, store } = setup();
    const createdAt = '2026-08-01T00:00:00.000Z';
    fake.putJson(metadataObjectKey(email, 'q3-report'), { createdAt, expiresAt: null, share });

    const metadata = await store.setRetention('q3-report', 'temporary');

    expect(metadata).toEqual({
      createdAt,
      expiresAt: computeExpiresAt('temporary', createdAt),
      share,
    });
    expect(fake.getJson(metadataObjectKey(email, 'q3-report'))).toEqual(metadata);
  });

  it('共有設定は share だけを差し替え、null で外す。無いページはエラー', async () => {
    const { fake, store } = setup();
    fake.putJson(metadataObjectKey(email, 'q3-report'), {
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
    });

    expect((await store.setShare('q3-report', share)).share).toEqual(share);
    expect(await store.getMetadata('q3-report')).toMatchObject({ expiresAt: null, share });

    await store.setShare('q3-report', null);
    expect(await store.getMetadata('q3-report')).not.toHaveProperty('share');

    await expect(store.setShare('missing', null)).rejects.toThrow('ページが見つかりません');
  });

  it('一覧は meta/ のキーから slug を取り、壊れた metadata を除く', async () => {
    const { fake, store } = setup();
    const alpha = { createdAt: '2026-08-01T00:00:00.000Z', expiresAt: null };
    fake.putJson(metadataObjectKey(email, 'alpha'), alpha);
    fake.objects.set(metadataObjectKey(email, 'broken'), { body: Buffer.from('{') });

    expect(await store.list()).toEqual([{ slug: 'alpha', metadata: alpha }]);
  });

  it('削除は成果物と metadata をまとめて消す', async () => {
    const { fake, store } = setup();
    await store.upload('q3-report', [html()], { retention: 'temporary', existing: null });

    await store.remove('q3-report');

    expect(fake.objects.size).toBe(0);
  });
});
