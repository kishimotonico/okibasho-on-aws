import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PathEnv {
  readonly XDG_CONFIG_HOME?: string;
  readonly XDG_STATE_HOME?: string;
  readonly HOME?: string;
  readonly SHARE_HTML_API_URL?: string;
  readonly SHARE_HTML_ISSUER?: string;
  readonly SHARE_HTML_CLIENT_ID?: string;
}

function homeDir(env: PathEnv): string {
  return env.HOME ?? homedir();
}

/** 設定ファイルを置くディレクトリ (~/.config/share-html または XDG_CONFIG_HOME) */
export function getConfigDir(env: PathEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) {
    return join(xdg, 'share-html');
  }
  return join(homeDir(env), '.config', 'share-html');
}

/** トークンなど実行時状態を置くディレクトリ (~/.local/state/share-html または XDG_STATE_HOME) */
export function getStateDir(env: PathEnv = process.env): string {
  const xdg = env.XDG_STATE_HOME;
  if (xdg) {
    return join(xdg, 'share-html');
  }
  return join(homeDir(env), '.local', 'state', 'share-html');
}

export function getConfigFilePath(env: PathEnv = process.env): string {
  return join(getConfigDir(env), 'config.json');
}

export function getTokenFilePath(env: PathEnv = process.env): string {
  return join(getStateDir(env), 'tokens.json');
}
