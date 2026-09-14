import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { pagePrefixFromObjectKey, parseMetadataJson } from './validate.js';

const client = new S3Client({});

const META_PREFIX = 'meta/';
const PAGES_PREFIX = 'pages/';
/** DeleteObjects は1回のリクエストで1000件まで */
const DELETE_CHUNK_SIZE = 1000;

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

/** prefix配下の全キーを列挙する(ページネーション) */
export async function listAllKeysUnderPrefix(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
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

/** meta/ 配下の全 metadata キーを列挙する(全件reconcile用) */
export async function listAllMetadataKeys(bucket: string): Promise<string[]> {
  return listAllKeysUnderPrefix(bucket, META_PREFIX);
}

/**
 * pages/ 配下の全オブジェクトを走査し、ページ(email/slug)単位でグループ化して
 * 最新の LastModified を返す(孤児回収の走査用)。キー自体は保持せず集約だけ持つ
 */
export async function listPagePrefixesWithLastModified(bucket: string): Promise<Map<string, Date>> {
  const latest = new Map<string, Date>();
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
      if (!object.Key || !object.LastModified) {
        continue;
      }
      const pagePrefix = pagePrefixFromObjectKey(object.Key);
      if (!pagePrefix) {
        continue;
      }
      const current = latest.get(pagePrefix);
      if (!current || object.LastModified > current) {
        latest.set(pagePrefix, object.LastModified);
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return latest;
}

/** keys を1000件ずつのチャンクに分けて DeleteObjects する */
export async function deleteObjectsChunked(bucket: string, keys: readonly string[]): Promise<void> {
  for (let offset = 0; offset < keys.length; offset += DELETE_CHUNK_SIZE) {
    const chunk = keys.slice(offset, offset + DELETE_CHUNK_SIZE);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/** prefix配下のオブジェクトを全て削除する(ページ成果物の削除に使う。空なら何もしない) */
export async function deletePagePrefix(bucket: string, prefix: string): Promise<void> {
  const keys = await listAllKeysUnderPrefix(bucket, prefix);
  await deleteObjectsChunked(bucket, keys);
}
