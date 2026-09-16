import { createHash } from 'node:crypto';

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

/** ETag は本文からその場で計算する（S3 同様、保存時ではなく応答のたびに決まる値として扱う） */
function etagFor(body: Buffer): string {
  return `"${createHash('md5').update(body).digest('hex')}"`;
}

/** PutObject / GetObject / ListObjectsV2 / DeleteObjects だけを持つメモリ上の S3 */
export class FakeS3Store {
  readonly objects = new Map<string, StoredObject>();
  /** list() の差分取得のテスト用。GetObject が呼ばれた回数 */
  getObjectCount = 0;

  /** JSON を metadata などとして置く */
  putJson(key: string, value: unknown): void {
    this.objects.set(key, {
      body: Buffer.from(JSON.stringify(value)),
      contentType: 'application/json',
    });
  }

  /** ある時点で置いた object の ETag。差分取得テストの期待値づくりに使う */
  etagOf(key: string): string | undefined {
    const stored = this.objects.get(key);
    return stored ? etagFor(stored.body) : undefined;
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
          const body =
            typeof Body === 'string' ? Buffer.from(Body) : Buffer.from(Body as Uint8Array);
          store.objects.set(Key, { body, contentType: ContentType });
          return Promise.resolve({ ETag: etagFor(body) });
        }

        if (command instanceof GetObjectCommand) {
          const key = command.input.Key;
          if (!key || !store.objects.has(key)) {
            const err = new Error('NoSuchKey');
            err.name = 'NoSuchKey';
            return Promise.reject(err);
          }
          store.getObjectCount++;
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
            Contents: keys.map((Key) => ({ Key, ETag: etagFor(store.objects.get(Key)!.body) })),
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
