import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { parseMetadataJson } from './validate.js';

const client = new S3Client({});

const META_PREFIX = 'meta/';

/**
 * metadata を読む。無い・JSON不正なら null(=共有無し)。
 * S3の取得エラー(NotFound以外)だけ再送出する。1件の壊れたmetadataで全体のreconcileを止めないため
 */
export async function getMetadataJson(bucket: string, key: string): Promise<unknown | null> {
  const body = await getMetadataBody(bucket, key);
  if (body === null) {
    return null;
  }
  const parsed = parseMetadataJson(body);
  if (parsed === null) {
    console.warn(`metadataのJSONパースに失敗した(共有無し扱いにする): key=${key}`);
  }
  return parsed;
}

async function getMetadataBody(bucket: string, key: string): Promise<string | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await result.Body?.transformToString('utf-8');
    return body ?? null;
  } catch (err) {
    if (isNotFound(err)) {
      return null;
    }
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name;
  return name === 'NoSuchKey' || name === 'NotFound';
}

/** meta/ 配下の全 metadata キーを列挙する(全件reconcile用) */
export async function listAllMetadataKeys(bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: META_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of result.Contents ?? []) {
      if (object.Key) {
        keys.push(object.Key);
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}
