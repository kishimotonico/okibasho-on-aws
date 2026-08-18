import { createServer, type Server } from 'node:http';
import { CLI_CALLBACK_PORTS } from './callback-ports.js';

export class PortsInUseError extends Error {
  readonly ports: readonly number[];

  constructor(ports: readonly number[]) {
    super(
      `コールバック用ポート ${ports.join(', ')} がすべて使用中です。\n` +
        '該当ポートを使っているプロセスを停止してから、もう一度 login を実行してください。',
    );
    this.name = 'PortsInUseError';
    this.ports = ports;
  }
}

function isAddrInUse(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

/**
 * 127.0.0.1 に限定して待ち受ける。0.0.0.0 にすると認可コードを受け取る口が
 * LANに開いてしまうため、ここを広げないこと。
 *
 * リダイレクト先が 127.0.0.1 ではなく localhost なのは、Cognitoが
 * コールバックURLにHTTPを許すのが localhost だけだから。localhost が ::1 に
 * 解決された場合はIPv6側の接続が即座に拒否され、ブラウザがIPv4へフォールバックする。
 */
function tryListen(port: number, host = '127.0.0.1'): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (err) => {
      server.close();
      reject(err);
    });
    server.listen(port, host, () => {
      resolve(server);
    });
  });
}

export interface CallbackServer {
  port: number;
  server: Server;
}

/**
 * Cognitoに登録済みのポートのうち、空いているものでリッスンする。
 */
export async function createCallbackServer(
  ports: readonly number[] = CLI_CALLBACK_PORTS,
): Promise<CallbackServer> {
  for (const port of ports) {
    try {
      const server = await tryListen(port);
      return { port, server };
    } catch (err) {
      if (isAddrInUse(err)) {
        continue;
      }
      throw err;
    }
  }

  throw new PortsInUseError(ports);
}

/**
 * テスト用: 指定ポートが使用中かどうかを確認する（サーバーは閉じる）。
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const server = await tryListen(port);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    return true;
  } catch (err) {
    if (isAddrInUse(err)) {
      return false;
    }
    throw err;
  }
}
