import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

export interface StoredObject {
  body: Buffer;
  contentType?: string;
}

/** PutObject / GetObject / ListObjectsV2 / DeleteObjects だけを持つメモリ上の S3 */
export class FakeS3Store {
  readonly objects = new Map<string, StoredObject>();

  /** JSON を metadata などとして置く */
  putJson(key: string, value: unknown): void {
    this.objects.set(key, {
      body: Buffer.from(JSON.stringify(value)),
      contentType: 'application/json',
    });
  }

  getJson(key: string): unknown {
    const stored = this.objects.get(key);
    return stored ? JSON.parse(stored.body.toString('utf8')) : undefined;
  }

  asClient(): S3Client {
    const store = this;
    return {
      send(command: unknown) {
        if (command instanceof PutObjectCommand) {
          const { Key, Body, ContentType } = command.input;
          if (!Key) {
            throw new Error('PutObject requires Key');
          }
          store.objects.set(Key, {
            body: typeof Body === 'string' ? Buffer.from(Body) : Buffer.from(Body as Uint8Array),
            contentType: ContentType,
          });
          return Promise.resolve({});
        }

        if (command instanceof GetObjectCommand) {
          const key = command.input.Key;
          if (!key || !store.objects.has(key)) {
            const err = new Error('NoSuchKey');
            err.name = 'NoSuchKey';
            return Promise.reject(err);
          }
          const stored = store.objects.get(key)!;
          return Promise.resolve({
            Body: {
              transformToString: async () => stored.body.toString('utf8'),
            },
          });
        }

        if (command instanceof ListObjectsV2Command) {
          const prefix = command.input.Prefix ?? '';
          const keys = [...store.objects.keys()].filter((key) => key.startsWith(prefix));
          return Promise.resolve({
            Contents: keys.map((Key) => ({ Key })),
            IsTruncated: false,
          });
        }

        if (command instanceof DeleteObjectsCommand) {
          for (const entry of command.input.Delete?.Objects ?? []) {
            if (entry.Key) {
              store.objects.delete(entry.Key);
            }
          }
          return Promise.resolve({});
        }

        throw new Error(`Unsupported command: ${String(command)}`);
      },
    } as S3Client;
  }
}
