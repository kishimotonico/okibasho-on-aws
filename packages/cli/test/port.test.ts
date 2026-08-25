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

  it('コールバックポート 8976 でリッスンする', async () => {
    const { port, server } = await createCallbackServer();
    servers.push(server);
    expect(port).toBe(8976);
    expect(CLI_CALLBACK_PORTS).toEqual([8976]);
  });

  it('ポートが塞がれていればエラー', async () => {
    const blockedPort = CLI_CALLBACK_PORTS[0];
    const blocker = createServer();
    servers.push(blocker);

    await new Promise<void>((resolve) => {
      blocker.listen(blockedPort, '127.0.0.1', () => resolve());
    });

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
