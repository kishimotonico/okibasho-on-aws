/**
 * 戻り先として受け付けるのは、pages と同じ origin の https で /p/ 始まりの URL だけ。
 * それ以外は open redirect になるので null
 */
export function parsePagesReturnUrl(value: unknown, pagesBaseUrl: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const pagesOrigin = new URL(pagesBaseUrl).origin;
  if (url.protocol !== 'https:' || url.origin !== pagesOrigin || !url.pathname.startsWith('/p/')) {
    return null;
  }
  return url.href;
}

/**
 * 内部ページ閲覧用の Signed Cookie を app の /auth/pages-cookie から受け取る。
 * Lambda OAC は Authorization を上書きするので id_token はボディで渡し、ボディのハッシュを添える
 */
export async function requestPagesCookie(idToken: string): Promise<void> {
  const body = JSON.stringify({ idToken });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  const response = await fetch('/auth/pages-cookie', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-amz-content-sha256': hash },
    body,
  });
  if (!response.ok) {
    throw new Error(`Signed Cookie の発行に失敗しました (${response.status})`);
  }
}
