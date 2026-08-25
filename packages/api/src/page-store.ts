import {
  DeleteObjectTaggingCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { USERS_PREFIX } from '@page-share/shared';

const PRESIGN_EXPIRES_SECONDS = 60 * 60;

export type GetJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_json' };

export interface ListUserIndexKeysResult {
  keys: string[];
  truncated: boolean;
}

export interface ListKeysResult {
  keys: string[];
  truncated: boolean;
}

export interface ObjectInfo {
  key: string;
  lastModified: Date;
}

export interface ListObjectInfosResult {
  objects: ObjectInfo[];
  truncated: boolean;
}

export interface PageStore {
  /** キーが存在しないときだけ JSON を書く。既存なら false を返す */
  putJsonIfAbsent(key: string, body: unknown): Promise<boolean>;
  putJson(key: string, body: unknown): Promise<void>;
  presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    tagging?: string | null,
  ): Promise<string>;
  /** users/<sub>/ 配下のインデックスキーを列挙する */
  listUserIndexKeys(ownerSub: string): Promise<ListUserIndexKeysResult>;
  /** 任意の prefix 配下のキーを列挙する */
  listKeys(prefix: string): Promise<ListKeysResult>;
  /** 任意の prefix 配下のオブジェクト情報を列挙する */
  listObjectInfos(prefix: string): Promise<ListObjectInfosResult>;
  getJson<T>(key: string): Promise<GetJsonResult<T>>;
  exists(key: string): Promise<boolean>;
  getObjectTags(key: string): Promise<Record<string, string>>;
  deleteObjects(keys: string[]): Promise<void>;
  /** タグを上書きする。空オブジェクトならタグをすべて外す */
  setObjectTags(key: string, tags: Record<string, string>): Promise<void>;
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'PreconditionFailed'
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'NotFound'
  );
}

/** 本番用の S3 実装 */
export function createPageStore(bucket: string, client: S3Client = new S3Client({})): PageStore {
  return {
    async putJsonIfAbsent(key, body) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: JSON.stringify(body),
            ContentType: 'application/json',
            IfNoneMatch: '*',
          }),
        );
        return true;
      } catch (error) {
        if (isPreconditionFailed(error)) {
          return false;
        }
        throw error;
      }
    },

    async putJson(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(body),
          ContentType: 'application/json',
        }),
      );
    },

    async presignPut(key, contentType, contentLength, tagging) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
        ...(tagging ? { Tagging: tagging } : {}),
      });
      const signableHeaders = new Set(['content-type', 'content-length']);
      if (tagging) {
        signableHeaders.add('x-amz-tagging');
      }
      return getSignedUrl(client, command, {
        expiresIn: PRESIGN_EXPIRES_SECONDS,
        signableHeaders,
      });
    },

    async listUserIndexKeys(ownerSub) {
      return listKeysUnderPrefix(client, bucket, `${USERS_PREFIX}${ownerSub}/`);
    },

    async listKeys(prefix) {
      return listKeysUnderPrefix(client, bucket, prefix);
    },

    async listObjectInfos(prefix) {
      return listObjectInfosUnderPrefix(client, bucket, prefix);
    },

    async exists(key) {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        return true;
      } catch (error) {
        if (isNotFound(error)) {
          return false;
        }
        throw error;
      }
    },

    async getObjectTags(key) {
      try {
        const result = await client.send(
          new GetObjectTaggingCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        const tags: Record<string, string> = {};
        for (const tag of result.TagSet ?? []) {
          if (tag.Key !== undefined && tag.Value !== undefined) {
            tags[tag.Key] = tag.Value;
          }
        }
        return tags;
      } catch (error) {
        if (isNotFound(error)) {
          return {};
        }
        throw error;
      }
    },

    async deleteObjects(keys) {
      if (keys.length === 0) {
        return;
      }

      const batchSize = 1000;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: batch.map((key) => ({ Key: key })),
              Quiet: true,
            },
          }),
        );
      }
    },

    async setObjectTags(key, tags) {
      const tagEntries = Object.entries(tags);
      if (tagEntries.length === 0) {
        try {
          await client.send(
            new DeleteObjectTaggingCommand({
              Bucket: bucket,
              Key: key,
            }),
          );
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
        return;
      }

      await client.send(
        new PutObjectTaggingCommand({
          Bucket: bucket,
          Key: key,
          Tagging: {
            TagSet: tagEntries.map(([tagKey, value]) => ({ Key: tagKey, Value: value })),
          },
        }),
      );
    },

    async getJson<T>(key: string): Promise<GetJsonResult<T>> {
      try {
        const result = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        const body = await result.Body?.transformToString();
        if (body === undefined || body.length === 0) {
          return { ok: false, reason: 'not_found' };
        }
        try {
          return { ok: true, data: JSON.parse(body) as T };
        } catch {
          return { ok: false, reason: 'invalid_json' };
        }
      } catch (error) {
        if (isNotFound(error)) {
          return { ok: false, reason: 'not_found' };
        }
        throw error;
      }
    },
  };
}

async function listKeysUnderPrefix(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<ListKeysResult> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  let truncated = false;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of result.Contents ?? []) {
      if (item.Key !== undefined) {
        keys.push(item.Key);
      }
    }

    truncated = result.IsTruncated ?? false;
    continuationToken = result.NextContinuationToken;
  } while (continuationToken !== undefined);

  return { keys, truncated };
}

async function listObjectInfosUnderPrefix(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<ListObjectInfosResult> {
  const objects: ObjectInfo[] = [];
  let continuationToken: string | undefined;
  let truncated = false;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of result.Contents ?? []) {
      if (item.Key !== undefined && item.LastModified !== undefined) {
        objects.push({ key: item.Key, lastModified: item.LastModified });
      }
    }

    truncated = result.IsTruncated ?? false;
    continuationToken = result.NextContinuationToken;
  } while (continuationToken !== undefined);

  return { objects, truncated };
}
