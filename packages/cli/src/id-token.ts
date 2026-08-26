/**
 * ログイン済み id_token から email を取り出す。署名検証はログイン時に済んでいる前提。
 */
export function emailFromIdToken(idToken: string): string {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('id_token の形式が不正です。');
  }

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(parts[1]!, 'base64url').toString('utf8');
  } catch {
    throw new Error('id_token の payload をデコードできません。');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error('id_token の payload が JSON ではありません。');
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('id_token に email クレームがありません。');
  }

  const email = (payload as Record<string, unknown>)['email'];
  if (typeof email !== 'string' || email.trim() === '') {
    throw new Error('id_token に email クレームがありません。');
  }

  return email.trim().toLowerCase();
}
