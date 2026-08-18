import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * ブラウザ起動はプラットフォーム標準コマンドに任せ、失敗してもログイン自体は続行する。
 */
export async function tryOpenBrowser(url: string): Promise<void> {
  const os = platform();
  try {
    if (os === 'darwin') {
      await execFileAsync('open', [url]);
    } else if (os === 'win32') {
      await execFileAsync('cmd', ['/c', 'start', '', url]);
    } else {
      await execFileAsync('xdg-open', [url]);
    }
  } catch {
    // SSH越しなどブラウザを開けない環境ではURL表示だけで足りる
  }
}
