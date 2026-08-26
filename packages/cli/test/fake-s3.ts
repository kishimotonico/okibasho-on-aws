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

export class FakeS3Store {
  readonly objects = new Map<string, StoredObject>();

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
            body: Buffer.isBuffer(Body) ? Body : Buffer.from(Body as Uint8Array),
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
              transformToByteArray: async () => Uint8Array.from(stored.body),
            },
          });
        }

        if (command instanceof ListObjectsV2Command) {
          const prefix = command.input.Prefix ?? '';
          const delimiter = command.input.Delimiter;
          const keys = [...store.objects.keys()].filter((key) => key.startsWith(prefix));

          if (delimiter) {
            const prefixes = new Set<string>();
            for (const key of keys) {
              const rest = key.slice(prefix.length);
              const slash = rest.indexOf(delimiter);
              if (slash === -1) {
                continue;
              }
              prefixes.add(`${prefix}${rest.slice(0, slash + 1)}`);
            }
            return Promise.resolve({
              CommonPrefixes: [...prefixes].map((Prefix) => ({ Prefix })),
              IsTruncated: false,
            });
          }

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

export function makeIdToken(email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ email })).toString('base64url');
  return `${header}.${payload}.sig`;
}

export const TEST_CONFIG = {
  issuer: 'https://issuer.example.test',
  clientId: 'cli-client',
  identityPoolId: 'ap-northeast-1:pool-id',
  userPoolId: 'ap-northeast-1_pool',
  region: 'ap-northeast-1',
  bucket: 'pages-bucket',
  pagesBaseUrl: 'https://pages.example.test',
} as const;

export const TEST_EMAIL = 'tanaka@example.jp';
