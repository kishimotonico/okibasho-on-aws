import { describe, expect, it } from 'vitest';

import { getExpirationStatus } from '../src/lib/expiration-status';

describe('getExpirationStatus', () => {
  const now = new Date('2026-08-18T12:00:00.000Z');

  it('expiresAt が null のとき無期限', () => {
    expect(getExpirationStatus(null, now)).toEqual({
      kind: 'permanent',
      label: '無期限',
    });
  });

  it('未来のとき日本時間の絶対日時と残日数を返す', () => {
    const status = getExpirationStatus('2026-08-20T12:00:00.000Z', now);
    expect(status).toEqual({
      kind: 'active',
      label: '2026/8/20 21:00 まで（あと2日）',
      daysRemaining: 2,
      expiresAt: '2026-08-20T12:00:00.000Z',
    });
  });

  it('24時間未満でも未来ならあと1日', () => {
    const status = getExpirationStatus('2026-08-18T18:00:00.000Z', now);
    expect(status).toEqual({
      kind: 'active',
      label: '2026/8/19 03:00 まで（あと1日）',
      daysRemaining: 1,
      expiresAt: '2026-08-18T18:00:00.000Z',
    });
  });

  it('過去のとき期限切れ日付を返す', () => {
    expect(getExpirationStatus('2026-08-17T12:00:00.000Z', now)).toEqual({
      kind: 'expired',
      label: '期限切れ（2026/8/17）',
      expiresAt: '2026-08-17T12:00:00.000Z',
    });
  });

  it('ちょうど今のとき期限切れ', () => {
    expect(getExpirationStatus('2026-08-18T12:00:00.000Z', now)).toEqual({
      kind: 'expired',
      label: '期限切れ（2026/8/18）',
      expiresAt: '2026-08-18T12:00:00.000Z',
    });
  });
});
