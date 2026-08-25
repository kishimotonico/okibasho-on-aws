import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import type { PageAliasValue } from '@page-share/shared';
import { serializePageAliasValue } from '@page-share/shared';

const MAX_ETAG_RETRIES = 5;

export interface AliasStore {
  put(key: string, value: PageAliasValue): Promise<void>;
  delete(key: string): Promise<void>;
}

function isPreconditionFailed(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (record.$metadata?.httpStatusCode === 412) {
    return true;
  }
  return typeof record.name === 'string' && record.name.includes('PreconditionFailed');
}

/** CloudFront KeyValueStore の本番実装 */
export function createAliasStore(kvsArn: string): AliasStore {
  const client = new CloudFrontKeyValueStoreClient({ region: 'us-east-1' });

  async function withEtagRetry(run: (etag: string) => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
      const describe = await client.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
      const etag = describe.ETag;
      if (etag === undefined) {
        throw new Error('KeyValueStore の ETag を取得できませんでした');
      }

      try {
        await run(etag);
        return;
      } catch (error) {
        if (isPreconditionFailed(error) && attempt < MAX_ETAG_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
  }

  return {
    async put(key, value) {
      const serialized = serializePageAliasValue(value);
      await withEtagRetry(async (etag) => {
        await client.send(
          new UpdateKeysCommand({
            KvsARN: kvsArn,
            IfMatch: etag,
            Puts: [{ Key: key, Value: serialized }],
          }),
        );
      });
    },

    async delete(key) {
      await withEtagRetry(async (etag) => {
        await client.send(
          new UpdateKeysCommand({
            KvsARN: kvsArn,
            IfMatch: etag,
            Deletes: [{ Key: key }],
          }),
        );
      });
    },
  };
}
