/** slug の許可パターン（1〜64文字、先頭は英数字） */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LENGTH = 12;
/** 剰余バイアスを避けるため、256 を文字集合サイズで割り切れる上限までしか採用しない */
const SLUG_RANDOM_REJECTION = Math.floor(256 / SLUG_ALPHABET.length) * SLUG_ALPHABET.length;

/**
 * slug は作成後に変更できない。大文字を小文字へ正規化すると
 * ユーザーが意図した別の slug（例: Report / report）が確定してしまうため、
 * 区別しない URL 空間と S3 key の不一致事故を防ぐ目的で invalid とする。
 */
export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** [a-z0-9] から SLUG_LENGTH 文字を、Web Crypto で偏りなく生成する */
export function generateSlug(): string {
  let slug = '';
  while (slug.length < SLUG_LENGTH) {
    slug += randomSlugChar();
  }
  return slug;
}

/**
 * Web Crypto はNode 20+ とブラウザの双方でグローバルにあるが、
 * このパッケージのtsconfigは lib に DOM も types に node も入れていない
 * (どちらか一方に寄せると、もう一方の利用側で噛み合わなくなるため)。
 * globalThis を global宣言で拡張すると web 側の DOM の Crypto 型と
 * 衝突するので、ここで必要な1メソッドだけを局所的に型付けする。
 */
const webCrypto = (
  globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }
).crypto;

function randomSlugChar(): string {
  const bytes = new Uint8Array(1);
  while (true) {
    webCrypto.getRandomValues(bytes);
    const byte = bytes[0]!;
    if (byte < SLUG_RANDOM_REJECTION) {
      return SLUG_ALPHABET[byte % SLUG_ALPHABET.length]!;
    }
  }
}
