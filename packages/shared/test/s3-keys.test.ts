import { describe, expect, it } from 'vitest';
import {
  META_PREFIX,
  PAGES_PREFIX,
  USERS_PREFIX,
  metaObjectKey,
  pageObjectKey,
  pagePrefix,
  pageViewPath,
  userIndexObjectKey,
} from '../src/s3-keys.js';

describe('s3-keys', () => {
  it('prefix 定数', () => {
    expect(PAGES_PREFIX).toBe('pages/');
    expect(META_PREFIX).toBe('meta/');
    expect(USERS_PREFIX).toBe('users/');
  });

  it('pageObjectKey', () => {
    expect(pageObjectKey('my-slug', 'index.html')).toBe('pages/my-slug/index.html');
    expect(pageObjectKey('my-slug', 'assets/app.js')).toBe('pages/my-slug/assets/app.js');
  });

  it('pagePrefix', () => {
    expect(pagePrefix('my-slug')).toBe('pages/my-slug/');
  });

  it('metaObjectKey', () => {
    expect(metaObjectKey('my-slug')).toBe('meta/my-slug.json');
  });

  it('userIndexObjectKey', () => {
    expect(userIndexObjectKey('sub-123', 'my-slug')).toBe('users/sub-123/my-slug.json');
  });
});

describe('pageViewPath', () => {
  it('閲覧パスは /p/<slug>/ になる', () => {
    expect(pageViewPath('my-page')).toBe('/p/my-page/');
  });
});
