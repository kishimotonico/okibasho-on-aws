import { clearTokens } from '../token-store.js';

export async function runLogout(): Promise<void> {
  await clearTokens();
  console.log('ログアウトしました。');
}
