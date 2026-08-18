import { describe, expect, it } from 'vitest';

import { shouldWarnImmediateExpiryOnTemporary } from '../src/lib/retention-warning';

describe('shouldWarnImmediateExpiryOnTemporary', () => {
  it('作成から30日未満なら警告不要', () => {
    const createdAt = '2026-08-01T00:00:00.000Z';
    const now = new Date('2026-08-18T00:00:00.000Z');
    expect(shouldWarnImmediateExpiryOnTemporary(createdAt, now)).toBe(false);
  });

  it('作成からちょうど30日なら警告する', () => {
    const createdAt = '2026-07-19T00:00:00.000Z';
    const now = new Date('2026-08-18T00:00:00.000Z');
    expect(shouldWarnImmediateExpiryOnTemporary(createdAt, now)).toBe(true);
  });

  it('作成から30日以上なら警告する', () => {
    const createdAt = '2026-07-01T00:00:00.000Z';
    const now = new Date('2026-08-18T00:00:00.000Z');
    expect(shouldWarnImmediateExpiryOnTemporary(createdAt, now)).toBe(true);
  });
});
