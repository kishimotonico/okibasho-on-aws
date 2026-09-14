import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({});

const PAGES_PREFIX = 'pages/';
const METADATA_SUFFIX = '/.metadata.json';

/** .metadata.json を読む。無ければ null(=共有無しとして扱う入力になる) */
export async function getMetadataJson(bucket: string, key: string): Promise<unknown | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await result.Body?.transformToString('utf-8');
    if (!body) {
      return null;
    }
    return JSON.parse(body);
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

/** pages/ 配下の全 .metadata.json キーを列挙する(全件reconcile用) */
export async function listAllMetadataKeys(bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PAGES_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of result.Contents ?? []) {
      if (object.Key && object.Key.endsWith(METADATA_SUFFIX)) {
        keys.push(object.Key);
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}
