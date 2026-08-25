import { describe, expect, it } from 'vitest';
import {
  INTERNAL_PAGES_PREFIX,
  META_PREFIX,
  SHARED_PAGES_PREFIX,
  USERS_PREFIX,
  metaObjectKey,
  pageObjectKey,
  pagePrefix,
  pagesPrefix,
  pageViewPath,
  userIndexObjectKey,
  versionPrefix,
} from '../src/s3-keys.js';

describe('s3-keys', () => {
  it('prefix 定数', () => {
    expect(INTERNAL_PAGES_PREFIX).toBe('internal-pages/');
    expect(SHARED_PAGES_PREFIX).toBe('shared-pages/');
    expect(META_PREFIX).toBe('meta/');
    expect(USERS_PREFIX).toBe('users/');
  });

  it('pagesPrefix', () => {
    expect(pagesPrefix('internal')).toBe('internal-pages/');
    expect(pagesPrefix('shared')).toBe('shared-pages/');
  });

  it('pageObjectKey', () => {
    expect(pageObjectKey('internal', 'abcdefghijklmnop', '0123456789abcdef', 'index.html')).toBe(
      'internal-pages/abcdefghijklmnop/0123456789abcdef/index.html',
    );
    expect(pageObjectKey('shared', 'abcdefghijklmnop', '0123456789abcdef', 'assets/app.js')).toBe(
      'shared-pages/abcdefghijklmnop/0123456789abcdef/assets/app.js',
    );
  });

  it('versionPrefix', () => {
    expect(versionPrefix('internal', 'abcdefghijklmnop', '0123456789abcdef')).toBe(
      'internal-pages/abcdefghijklmnop/0123456789abcdef/',
    );
  });

  it('pagePrefix', () => {
    expect(pagePrefix('shared', 'abcdefghijklmnop')).toBe('shared-pages/abcdefghijklmnop/');
  });

  it('metaObjectKey', () => {
    expect(metaObjectKey('abcdefghijklmnop')).toBe('meta/abcdefghijklmnop.json');
  });

  it('userIndexObjectKey', () => {
    expect(userIndexObjectKey('sub-123', 'abcdefghijklmnop')).toBe(
      'users/sub-123/abcdefghijklmnop.json',
    );
  });
});

describe('pageViewPath', () => {
  it('閲覧パスは /<slug>/ になる', () => {
    expect(pageViewPath('abcdefghijklmnop')).toBe('/abcdefghijklmnop/');
  });
});
