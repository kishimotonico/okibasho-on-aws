import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PRESIGN_EXPIRES_SECONDS = 60 * 60;

export interface PageStore {
  /** キーが存在しないときだけ JSON を書く。既存なら false を返す */
  putJsonIfAbsent(key: string, body: unknown): Promise<boolean>;
  putJson(key: string, body: unknown): Promise<void>;
  presignPut(key: string, contentType: string, contentLength: number): Promise<string>;
}

function isPreconditionFailed(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === 'PreconditionFailed' || err.$metadata?.httpStatusCode === 412;
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
            // 存在チェックと書き込みを分けると同時リクエストで後勝ち上書きになる。
            // IfNoneMatch で原子的に予約し、HeadObject を省く。
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

    async presignPut(key, contentType, contentLength) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      });
      return getSignedUrl(client, command, {
        expiresIn: PRESIGN_EXPIRES_SECONDS,
        // presigned PUT には POST policy の content-length-range が無い。
        // 宣言サイズを署名対象ヘッダに含め、S3 がちょうどそのサイズだけ受け付けるようにする。
        signableHeaders: new Set(['content-type', 'content-length']),
      });
    },
  };
}
