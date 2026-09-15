import { describe, expect, it } from 'vitest';
import { SHARE_TAG_LENGTH, computeShareTag } from '../src/page/tag.js';

/**
 * 固定テストベクター。infra(page-maintenance) の同名テストと同じ値であることを確認する。
 * tag = base64url(SHA-256(UTF-8("pages/<email>/<slug>/")))の先頭11文字
 */
const VECTORS: Array<{ email: string; slug: string; tag: string }> = [
  { email: 'alice@example.com', slug: 'hello', tag: 'prgdKq0F-Hu' },
  { email: 'tanaka@example.jp', slug: 'q3-report', tag: 'XLCXXgKt3re' },
];

describe('computeShareTag', () => {
  it(`${SHARE_TAG_LENGTH}文字のtagを返す`, async () => {
    const tag = await computeShareTag('alice@example.com', 'hello');
    expect(tag).toHaveLength(SHARE_TAG_LENGTH);
    expect(tag).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(VECTORS)('固定ベクター: $email / $slug -> $tag', async ({ email, slug, tag }) => {
    expect(await computeShareTag(email, slug)).toBe(tag);
  });
});
