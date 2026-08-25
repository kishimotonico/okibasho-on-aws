/** slug / versionId の許可パターン（ちょうど16文字、[a-z0-9] のみ） */
export const ID_LENGTH = 16;
export const ID_PATTERN = /^[a-z0-9]{16}$/;
export const SLUG_PATTERN = ID_PATTERN;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** 剰余バイアスを避けるため、256 を文字集合サイズで割り切れる上限までしか採用しない */
const ID_RANDOM_REJECTION = Math.floor(256 / ID_ALPHABET.length) * ID_ALPHABET.length;

/**
 * slug と versionId は同じ形。ユーザーは指定できず、作成後も変更できない。
 * 推測できないことが capability になるため、ハイフン付きの人が読める名前は使わない。
 */
export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export const isValidSlug = isValidId;
export const isValidVersionId = isValidId;

/** [a-z0-9] から ID_LENGTH 文字を、Web Crypto で偏りなく生成する */
export function generateId(): string {
  let id = '';
  while (id.length < ID_LENGTH) {
    id += randomIdChar();
  }
  return id;
}

export const generateSlug = generateId;
export const generateVersionId = generateId;

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

function randomIdChar(): string {
  const bytes = new Uint8Array(1);
  while (true) {
    webCrypto.getRandomValues(bytes);
    const byte = bytes[0]!;
    if (byte < ID_RANDOM_REJECTION) {
      return ID_ALPHABET[byte % ID_ALPHABET.length]!;
    }
  }
}
