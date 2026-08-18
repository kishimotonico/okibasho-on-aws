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

  it('未来のとき残日数を返す', () => {
    const status = getExpirationStatus('2026-08-20T12:00:00.000Z', now);
    expect(status).toEqual({
      kind: 'active',
      label: 'あと 2 日',
      daysRemaining: 2,
    });
  });

  it('24時間未満でも未来ならあと1日', () => {
    const status = getExpirationStatus('2026-08-18T18:00:00.000Z', now);
    expect(status).toEqual({
      kind: 'active',
      label: 'あと 1 日',
      daysRemaining: 1,
    });
  });

  it('過去のとき期限切れ', () => {
    expect(getExpirationStatus('2026-08-17T12:00:00.000Z', now)).toEqual({
      kind: 'expired',
      label: '期限切れ',
    });
  });

  it('ちょうど今のとき期限切れ', () => {
    expect(getExpirationStatus('2026-08-18T12:00:00.000Z', now)).toEqual({
      kind: 'expired',
      label: '期限切れ',
    });
  });
});
