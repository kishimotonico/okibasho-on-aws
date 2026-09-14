/** ユーザー指定 slug。ユーザー単位で一意。S3 キーと URL パスに載る */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

const RANDOM_SLUG_LENGTH = 10;
const RANDOM_SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * slug 省略時に使う乱数 slug を生成する。小文字英数字 10 文字で isValidSlug を必ず満たす。
 * Node 20+ とブラウザの両方で動かすため node:crypto は使わず globalThis.crypto を使う。
 */
export function generateRandomSlug(): string {
  const bytes = new Uint8Array(RANDOM_SLUG_LENGTH);
  globalThis.crypto.getRandomValues(bytes);

  let slug = '';
  for (const byte of bytes) {
    slug += RANDOM_SLUG_CHARS[byte % RANDOM_SLUG_CHARS.length];
  }

  return slug;
}
