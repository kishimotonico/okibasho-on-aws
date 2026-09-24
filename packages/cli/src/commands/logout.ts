import { clearTokens, readStoredTokens } from '../token-store.js';
import { revokeRefreshToken } from '../token-refresh.js';

export async function runLogout(): Promise<void> {
  const stored = await readStoredTokens();
  if (stored) {
    await revokeRefreshToken(stored);
  }
  await clearTokens();
  console.log('ログアウトしました。');
}
