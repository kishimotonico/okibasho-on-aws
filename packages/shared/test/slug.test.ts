import { describe, expect, it } from 'vitest';
import { generateSlug, generateVersionId, isValidSlug, isValidVersionId, SLUG_PATTERN } from '../src/slug.js';

describe('isValidSlug', () => {
  it('16文字の [a-z0-9] を許可する', () => {
    expect(isValidSlug('abcdefghijklmnop')).toBe(true);
    expect(isValidSlug('0123456789abcdef')).toBe(true);
  });

  it('15文字は拒否する', () => {
    expect(isValidSlug('abcdefghijklmno')).toBe(false);
  });

  it('17文字は拒否する', () => {
    expect(isValidSlug('abcdefghijklmnopq')).toBe(false);
  });

  it('ハイフンは拒否する', () => {
    expect(isValidSlug('abcd-efghijklmnop')).toBe(false);
    expect(isValidSlug('my-page-1')).toBe(false);
  });

  it('大文字は正規化せず拒否する', () => {
    expect(isValidSlug('Abcdefghijklmnop')).toBe(false);
  });

  it('日本語は拒否する', () => {
    expect(isValidSlug('あいうえおかきくけこさしすせそた')).toBe(false);
  });

  it('空文字は拒否する', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('パターン定数と一致する', () => {
    expect(SLUG_PATTERN.test('abcdefghijklmnop')).toBe(true);
    expect(SLUG_PATTERN.test('my-page-1')).toBe(false);
  });
});

describe('generateSlug', () => {
  it('生成結果が isValidSlug を満たす', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidSlug(generateSlug())).toBe(true);
    }
  });

  it('16文字を返す', () => {
    expect(generateSlug()).toHaveLength(16);
  });

  it('多数回生成して重複しない', () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 500; i++) {
      slugs.add(generateSlug());
    }
    expect(slugs.size).toBe(500);
  });
});

describe('generateVersionId', () => {
  it('slug と同じ規則の16文字を返す', () => {
    const versionId = generateVersionId();
    expect(versionId).toHaveLength(16);
    expect(isValidVersionId(versionId)).toBe(true);
  });
});
