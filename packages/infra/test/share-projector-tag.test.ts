import { describe, expect, it } from 'vitest';
import { computeShareTag } from '../lib/lambda/share-projector/tag.js';

/**
 * 固定テストベクター。cli(packages/cli/test/tag.test.ts) / web と同じ値であることを確認する。
 * tag = base64url(SHA-256(UTF-8("pages/<email>/<slug>/")))の先頭11文字
 */
const VECTORS: Array<{ prefix: string; tag: string }> = [
  { prefix: 'pages/alice@example.com/hello/', tag: 'prgdKq0F-Hu' },
  { prefix: 'pages/tanaka@example.jp/q3-report/', tag: 'XLCXXgKt3re' },
];

describe('computeShareTag', () => {
  it.each(VECTORS)('固定ベクター: $prefix -> $tag', async ({ prefix, tag }) => {
    expect(await computeShareTag(prefix)).toBe(tag);
  });
});
