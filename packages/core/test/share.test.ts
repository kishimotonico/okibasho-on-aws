import { describe, expect, it } from 'vitest';
import {
  buildShareViewPath,
  generateShareId,
  generateSharePassword,
  isValidShareId,
  SHARE_ID_PATTERN,
} from '../src/page/share.js';

const SHARE_PASSWORD_PATTERN =
  /^[abcdefghjkmnpqrstuvwxyz23456789]{4}(-[abcdefghjkmnpqrstuvwxyz23456789]{4}){3}$/;

describe('generateShareId', () => {
  it('22文字の base64url を生成する', () => {
    const id = generateShareId();
    expect(id).toMatch(SHARE_ID_PATTERN);
    expect(id).toHaveLength(22);
  });

  it('複数回呼んでも重複しない', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateShareId()));
    expect(ids.size).toBe(50);
  });
});

describe('generateSharePassword', () => {
  it('4文字×4組をハイフンでつないだ形式になる', () => {
    const password = generateSharePassword();
    expect(password).toMatch(SHARE_PASSWORD_PATTERN);
    expect(password).toHaveLength(19);
  });

  it('紛らわしい文字（0 O o 1 l I）を含まない', () => {
    for (let i = 0; i < 20; i++) {
      const password = generateSharePassword();
      expect(password).not.toMatch(/[0oO1lI]/);
    }
  });

  it('毎回違う値を生成する', () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generateSharePassword()));
    expect(passwords.size).toBe(50);
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

describe('buildShareViewPath', () => {
  it('/s/<tag><id>/ を返す', () => {
    const tag = 'b'.repeat(11);
    expect(buildShareViewPath(tag, 'a'.repeat(22))).toBe(`/s/${tag}${'a'.repeat(22)}/`);
  });
});
