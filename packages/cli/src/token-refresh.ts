import { discovery, None, refreshTokenGrant } from 'openid-client';
import type { ResolvedConfig } from './config.js';
import { loadTokens, saveTokens, type StoredTokens } from './token-store.js';

export class TokenRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenRefreshError';
  }
}

export interface EnsureIdTokenOptions {
  now?: () => number;
}

/**
 * 有効な ID トークンを返す。期限切れなら refresh token で更新して保存する。
 */
export async function ensureIdToken(
  config: ResolvedConfig,
  options: EnsureIdTokenOptions = {},
): Promise<string> {
  const now = options.now ?? Date.now;
  const stored = await loadTokens(config);
  if (!stored) {
    throw new TokenRefreshError('先に `share-html login` を実行してください。');
  }

  if (now() < stored.expiresAt) {
    return stored.idToken;
  }

  try {
    const refreshed = await refreshStoredTokens(config, stored, now);
    return refreshed.idToken;
  } catch {
    throw new TokenRefreshError(
      'トークンの更新に失敗しました。もう一度 `share-html login` を実行してください。',
    );
  }
}

async function refreshStoredTokens(
  config: ResolvedConfig,
  stored: StoredTokens,
  now: () => number,
): Promise<StoredTokens> {
  const oidcConfig = await discovery(new URL(config.issuer), config.clientId, undefined, None());
  const tokens = await refreshTokenGrant(oidcConfig, stored.refreshToken);

  const idToken = tokens.id_token;
  if (!idToken) {
    throw new TokenRefreshError('トークン応答に id_token が含まれていません。');
  }

  const obtainedAt = now();
  const expiresIn = tokens.expiresIn();
  const expiresAt =
    expiresIn !== undefined ? obtainedAt + expiresIn * 1000 : obtainedAt + 3600 * 1000;

  const updated: StoredTokens = {
    refreshToken: tokens.refresh_token ?? stored.refreshToken,
    idToken,
    expiresAt,
    obtainedAt,
    issuer: config.issuer,
    clientId: config.clientId,
  };

  await saveTokens(updated);
  return updated;
}
