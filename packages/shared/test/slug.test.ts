import { describe, expect, it } from 'vitest';
import { generateSlug, isValidSlug, SLUG_PATTERN } from '../src/slug.js';

describe('isValidSlug', () => {
  it('1文字の有効な slug を許可する', () => {
    expect(isValidSlug('a')).toBe(true);
    expect(isValidSlug('0')).toBe(true);
  });

  it('64文字の有効な slug を許可する', () => {
    const slug = 'a' + 'b'.repeat(63);
    expect(slug.length).toBe(64);
    expect(isValidSlug(slug)).toBe(true);
  });

  it('65文字は拒否する', () => {
    const slug = 'a' + 'b'.repeat(64);
    expect(slug.length).toBe(65);
    expect(isValidSlug(slug)).toBe(false);
  });

  it('先頭ハイフンは拒否する', () => {
    expect(isValidSlug('-abc')).toBe(false);
  });

  it('大文字は正規化せず拒否する', () => {
    expect(isValidSlug('Abc')).toBe(false);
    expect(isValidSlug('abcD')).toBe(false);
  });

  it('日本語は拒否する', () => {
    expect(isValidSlug('あいう')).toBe(false);
  });

  it('空文字は拒否する', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('ドットのみは拒否する', () => {
    expect(isValidSlug('.')).toBe(false);
  });

  it('二重ドットは拒否する', () => {
    expect(isValidSlug('..')).toBe(false);
  });

  it('パターン定数と一致する', () => {
    expect(SLUG_PATTERN.test('my-page-1')).toBe(true);
  });
});

describe('generateSlug', () => {
  it('生成結果が isValidSlug を満たす', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidSlug(generateSlug())).toBe(true);
    }
  });

  it('12文字を返す', () => {
    expect(generateSlug()).toHaveLength(12);
  });

  it('多数回生成して重複しない', () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 500; i++) {
      slugs.add(generateSlug());
    }
    expect(slugs.size).toBe(500);
  });
});
