import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { CLI_CALLBACK_PORTS } from '../src/callback-ports.js';
import { createCallbackServer, isPortAvailable, PortsInUseError } from '../src/port.js';

describe('createCallbackServer', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (s) =>
          new Promise<void>((resolve) => {
            s.close(() => resolve());
          }),
      ),
    );
    servers.length = 0;
  });

  it('空いている最初のコールバックポートでリッスンする', async () => {
    const { port, server } = await createCallbackServer();
    servers.push(server);
    expect(CLI_CALLBACK_PORTS).toContain(port);
    expect(port).toBe(8976);
  });

  it('先頭ポートが塞がれていれば次の候補を使う', async () => {
    const blockedPort = CLI_CALLBACK_PORTS[0];
    const blocker = createServer();
    servers.push(blocker);

    await new Promise<void>((resolve) => {
      blocker.listen(blockedPort, '127.0.0.1', () => resolve());
    });

    const { port, server } = await createCallbackServer();
    servers.push(server);
    expect(port).toBe(CLI_CALLBACK_PORTS[1]);
  });

  it('全ポートが塞がれていればエラー', async () => {
    for (const blockedPort of CLI_CALLBACK_PORTS) {
      const blocker = createServer();
      servers.push(blocker);
      await new Promise<void>((resolve) => {
        blocker.listen(blockedPort, '127.0.0.1', () => resolve());
      });
    }

    await expect(createCallbackServer()).rejects.toBeInstanceOf(PortsInUseError);
  });
});

describe('isPortAvailable', () => {
  it('使用中のポートは false', async () => {
    const port = CLI_CALLBACK_PORTS[0];
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(port, '127.0.0.1', () => resolve());
    });

    await expect(isPortAvailable(port)).resolves.toBe(false);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});
