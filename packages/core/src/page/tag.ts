import { toBase64Url } from './base64url.js';
import { pagePrefix } from './s3-keys.js';

/** 外部共有 URL の tag の文字数 */
export const SHARE_TAG_LENGTH = 11;

/**
 * 外部共有 URL の tag を計算する。 `base64url(SHA-256(UTF-8(pagePrefix(email, slug)))) の先頭11文字`。
 * 入力はページ成果物の prefix（末尾 `/` あり）そのもの。小文字化・正規化はしない。
 *
 * KVS のキーはこの tag にする。prefix から一意に決まるので、共有の再発行・停止・削除のたびに
 * 全件走査で衝突を確認する必要がなくなる。
 *
 * globalThis.crypto.subtle のみ使用（Node 22 / ブラウザ両対応）。digest が非同期なため Promise を返す
 */
export async function computeShareTag(email: string, slug: string): Promise<string> {
  const data = new TextEncoder().encode(pagePrefix(email, slug));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return toBase64Url(new Uint8Array(digest)).slice(0, SHARE_TAG_LENGTH);
}
