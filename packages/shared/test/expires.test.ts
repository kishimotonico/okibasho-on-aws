import { describe, expect, it } from 'vitest';
import { computeExpiresAt, expiresAtEpochSeconds } from '../src/expires.js';

describe('computeExpiresAt', () => {
  it('permanent は null', () => {
    expect(computeExpiresAt('permanent', new Date('2026-01-01T00:00:00.000Z'))).toBeNull();
  });

  it('temporary は contentUpdatedAt から30日後', () => {
    expect(computeExpiresAt('temporary', new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '2026-01-31T00:00:00.000Z',
    );
  });
});

describe('expiresAtEpochSeconds', () => {
  it('permanent は undefined', () => {
    expect(expiresAtEpochSeconds('permanent', new Date('2026-01-01T00:00:00.000Z'))).toBeUndefined();
  });

  it('temporary は epoch 秒', () => {
    expect(expiresAtEpochSeconds('temporary', new Date('2026-01-01T00:00:00.000Z'))).toBe(
      Math.floor(Date.parse('2026-01-31T00:00:00.000Z') / 1000),
    );
  });
});
