import { describe, expect, it } from 'vitest';
import {
  buildShareBasic,
  buildShareViewPath,
  generateShareId,
  generateShareSalt,
  hashSharePassword,
  isValidShareId,
  SHARE_ID_PATTERN,
  validateAndNormalizeCidrs,
  validateSharePassword,
  validateShareUsername,
} from '../src/page/share.js';

describe('generateShareId / generateShareSalt', () => {
  it('22文字の base64url を生成する', () => {
    const id = generateShareId();
    expect(id).toMatch(SHARE_ID_PATTERN);
    expect(id).toHaveLength(22);

    const salt = generateShareSalt();
    expect(salt).toMatch(SHARE_ID_PATTERN);
    expect(salt).toHaveLength(22);
  });

  it('複数回呼んでも重複しない', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateShareId()));
    expect(ids.size).toBe(50);
  });
});

describe('isValidShareId', () => {
  it('形式を検証する', () => {
    expect(isValidShareId('a'.repeat(22))).toBe(true);
    expect(isValidShareId('a'.repeat(21))).toBe(false);
    expect(isValidShareId('a'.repeat(23))).toBe(false);
    expect(isValidShareId('!'.repeat(22))).toBe(false);
    expect(isValidShareId(123)).toBe(false);
  });
});

describe('hashSharePassword', () => {
  it('salt:username:password の sha256 hex を返す', async () => {
    const hash = await hashSharePassword('salt1', 'guest', 'password1234');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const same = await hashSharePassword('salt1', 'guest', 'password1234');
    expect(same).toBe(hash);

    const different = await hashSharePassword('salt2', 'guest', 'password1234');
    expect(different).not.toBe(hash);
  });
});

describe('validateShareUsername', () => {
  it('空・長すぎ・コロン・制御文字を拒否する', () => {
    expect(validateShareUsername('guest')).toEqual([]);
    expect(validateShareUsername('')).not.toEqual([]);
    expect(validateShareUsername('a'.repeat(65))).not.toEqual([]);
    expect(validateShareUsername('gu:est')).not.toEqual([]);
    expect(validateShareUsername('gu\x00est')).not.toEqual([]);
  });
});

describe('validateSharePassword', () => {
  it('8文字未満・128文字超を拒否する', () => {
    expect(validateSharePassword('password')).toEqual([]);
    expect(validateSharePassword('short1')).not.toEqual([]);
    expect(validateSharePassword('a'.repeat(129))).not.toEqual([]);
  });
});

describe('buildShareBasic', () => {
  it('妥当な入力から basic を組み立てる', async () => {
    const result = await buildShareBasic('guest', 'password1234');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.username).toBe('guest');
      expect(result.value.salt).toHaveLength(22);
      expect(result.value.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('不正な入力はエラーを返す', async () => {
    const result = await buildShareBasic('', 'short');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('validateAndNormalizeCidrs', () => {
  it('単一 IP に /32 を補う', () => {
    const result = validateAndNormalizeCidrs(['203.0.113.5']);
    expect(result).toEqual({ ok: true, value: ['203.0.113.5/32'] });
  });

  it('CIDR 表記はそのまま正規化する', () => {
    const result = validateAndNormalizeCidrs(['203.0.113.0/24', ' 10.0.0.0/8 ']);
    expect(result).toEqual({ ok: true, value: ['203.0.113.0/24', '10.0.0.0/8'] });
  });

  it('空行は無視する', () => {
    const result = validateAndNormalizeCidrs(['203.0.113.5', '', '  ']);
    expect(result).toEqual({ ok: true, value: ['203.0.113.5/32'] });
  });

  it('0件はエラー', () => {
    const result = validateAndNormalizeCidrs([]);
    expect(result.ok).toBe(false);
  });

  it('21件以上はエラー', () => {
    const lines = Array.from({ length: 21 }, (_, i) => `10.0.0.${i}/32`);
    const result = validateAndNormalizeCidrs(lines);
    expect(result.ok).toBe(false);
  });

  it('不正な IPv4 はエラー', () => {
    expect(validateAndNormalizeCidrs(['999.0.0.1']).ok).toBe(false);
    expect(validateAndNormalizeCidrs(['not-an-ip']).ok).toBe(false);
    expect(validateAndNormalizeCidrs(['203.0.113.0/33']).ok).toBe(false);
    expect(validateAndNormalizeCidrs(['203.0.113.0/abc']).ok).toBe(false);
    expect(validateAndNormalizeCidrs(['203.0.113.0/24/1']).ok).toBe(false);
  });
});

describe('buildShareViewPath', () => {
  it('/s/<id>/ を返す', () => {
    expect(buildShareViewPath('a'.repeat(22))).toBe(`/s/${'a'.repeat(22)}/`);
  });
});
