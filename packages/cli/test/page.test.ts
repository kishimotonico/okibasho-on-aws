import { describe, expect, it } from 'vitest';
import { generateRandomSlug, isValidSlug } from '../src/page/slug.js';
import {
  emailLocalPart,
  metadataObjectKey,
  ownerPrefix,
  pageObjectKey,
  pageViewPath,
} from '../src/page/s3-keys.js';
import { validateUploadPath } from '../src/page/upload-path.js';

describe('isValidSlug', () => {
  it('許可文字を通す', () => {
    expect(isValidSlug('q3-report')).toBe(true);
    expect(isValidSlug('a')).toBe(true);
    expect(isValidSlug('a_b-c012')).toBe(true);
  });

  it('危険な文字を拒否する', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('-starts-hyphen')).toBe(false);
    expect(isValidSlug('HasUpper')).toBe(false);
    expect(isValidSlug('has/slash')).toBe(false);
    expect(isValidSlug('.hidden')).toBe(false);
  });
});

describe('generateRandomSlug', () => {
  it('10 文字の小文字英数字を生成する', () => {
    const slug = generateRandomSlug();
    expect(slug).toHaveLength(10);
    expect(slug).toMatch(/^[a-z0-9]{10}$/);
    expect(isValidSlug(slug)).toBe(true);
  });

  it('複数回呼んでも重複しない', () => {
    const slugs = new Set(Array.from({ length: 50 }, () => generateRandomSlug()));
    expect(slugs.size).toBe(50);
  });
});

describe('s3 keys', () => {
  it('owner prefix を組み立てる', () => {
    expect(ownerPrefix('tanaka@example.jp')).toBe('pages/tanaka@example.jp/');
    expect(pageObjectKey('tanaka@example.jp', 'q3-report', 'index.html')).toBe(
      'pages/tanaka@example.jp/q3-report/index.html',
    );
    expect(metadataObjectKey('tanaka@example.jp', 'q3-report')).toBe(
      'pages/tanaka@example.jp/q3-report/.metadata.json',
    );
    expect(pageViewPath('tanaka', 'q3-report')).toBe('/tanaka/q3-report/');
    expect(emailLocalPart('tanaka@example.jp')).toBe('tanaka');
  });
});

describe('validateUploadPath', () => {
  it('相対パスを通す', () => {
    expect(validateUploadPath('index.html')).toEqual({ ok: true, path: 'index.html' });
    expect(validateUploadPath('assets/style.css')).toEqual({ ok: true, path: 'assets/style.css' });
  });

  it('traversal と metadata を拒否する', () => {
    expect(validateUploadPath('../secret')).toEqual({ ok: false });
    expect(validateUploadPath('/abs')).toEqual({ ok: false });
    expect(validateUploadPath('C:foo')).toEqual({ ok: false });
    expect(validateUploadPath('.metadata.json')).toEqual({ ok: false });
    expect(validateUploadPath('dir/.hidden')).toEqual({ ok: false });
  });
});
