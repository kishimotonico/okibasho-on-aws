import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getTokenFilePath, type PathEnv } from './paths.js';
import type { ResolvedConfig } from './config.js';

/**
 * OS Credential Store は native module か外部コマンドが要り、
 * 依存を単一JSにバンドルして npx で動かす方針と噛み合わない。
 * そのためファイル保存を選ぶ。
 */
export interface StoredTokens {
  refreshToken: string;
  idToken: string;
  /** IDトークン等の有効期限 (Unix ms) */
  expiresAt: number;
  /** トークン取得時刻 (Unix ms) */
  obtainedAt: number;
  issuer: string;
  clientId: string;
}

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

async function ensureTokenDir(tokenPath: string): Promise<void> {
  await mkdir(dirname(tokenPath), { recursive: true, mode: DIR_MODE });
}

export interface TokenStoreOptions {
  env?: PathEnv;
  tokenPath?: string;
}

export async function saveTokens(
  tokens: StoredTokens,
  options: TokenStoreOptions = {},
): Promise<void> {
  const tokenPath = options.tokenPath ?? getTokenFilePath(options.env);
  await ensureTokenDir(tokenPath);
  await writeFile(tokenPath, `${JSON.stringify(tokens, null, 2)}\n`, {
    encoding: 'utf8',
    mode: FILE_MODE,
    flag: 'w',
  });
  await chmod(tokenPath, FILE_MODE);
}

/**
 * トークンファイルを読み、形式だけ検証して返す。issuer / clientId の一致は見ない。
 * ログアウト時の revoke はトークンファイルに記録された issuer 宛てに行うため、
 * 現在の config と一致しないトークンも扱えるようにこの関数を分けている。
 */
export async function readStoredTokens(
  options: TokenStoreOptions = {},
): Promise<StoredTokens | null> {
  const tokenPath = options.tokenPath ?? getTokenFilePath(options.env);

  let raw: string;
  try {
    raw = await readFile(tokenPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const refreshToken = record['refreshToken'];
  const idToken = record['idToken'];
  const expiresAt = record['expiresAt'];
  const obtainedAt = record['obtainedAt'];
  const issuer = record['issuer'];
  const clientId = record['clientId'];

  if (
    typeof refreshToken !== 'string' ||
    typeof idToken !== 'string' ||
    typeof expiresAt !== 'number' ||
    typeof obtainedAt !== 'number' ||
    typeof issuer !== 'string' ||
    typeof clientId !== 'string'
  ) {
    return null;
  }

  return {
    refreshToken,
    idToken,
    expiresAt,
    obtainedAt,
    issuer,
    clientId,
  };
}

export async function loadTokens(
  config: Pick<ResolvedConfig, 'issuer' | 'clientId'>,
  options: TokenStoreOptions = {},
): Promise<StoredTokens | null> {
  const stored = await readStoredTokens(options);
  if (!stored) {
    return null;
  }

  if (stored.issuer !== config.issuer || stored.clientId !== config.clientId) {
    return null;
  }

  return stored;
}

export async function clearTokens(options: TokenStoreOptions = {}): Promise<void> {
  const tokenPath = options.tokenPath ?? getTokenFilePath(options.env);
  try {
    await unlink(tokenPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return;
    }
    throw err;
  }
}
