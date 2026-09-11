import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PathEnv {
  readonly XDG_CONFIG_HOME?: string;
  readonly XDG_STATE_HOME?: string;
  readonly HOME?: string;
  readonly OKIBA_ISSUER?: string;
  readonly OKIBA_CLIENT_ID?: string;
  readonly OKIBA_IDENTITY_POOL_ID?: string;
  readonly OKIBA_USER_POOL_ID?: string;
  readonly OKIBA_REGION?: string;
  readonly OKIBA_BUCKET?: string;
  readonly OKIBA_PAGES_BASE_URL?: string;
}

function homeDir(env: PathEnv): string {
  return env.HOME ?? homedir();
}

/** 設定ファイルを置くディレクトリ (~/.config/okibasho または XDG_CONFIG_HOME) */
export function getConfigDir(env: PathEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) {
    return join(xdg, 'okibasho');
  }
  return join(homeDir(env), '.config', 'okibasho');
}

/** トークンなど実行時状態を置くディレクトリ (~/.local/state/okibasho または XDG_STATE_HOME) */
export function getStateDir(env: PathEnv = process.env): string {
  const xdg = env.XDG_STATE_HOME;
  if (xdg) {
    return join(xdg, 'okibasho');
  }
  return join(homeDir(env), '.local', 'state', 'okibasho');
}

export function getConfigFilePath(env: PathEnv = process.env): string {
  return join(getConfigDir(env), 'config.json');
}

export function getTokenFilePath(env: PathEnv = process.env): string {
  return join(getStateDir(env), 'tokens.json');
}
