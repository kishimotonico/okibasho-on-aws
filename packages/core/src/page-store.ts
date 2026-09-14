import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import { contentTypeFromPath } from './page/content-type.js';
import {
  buildUploadMetadata,
  parsePageMetadata,
  withRetention,
  withShare,
  type PageMetadata,
  type UploadMetadataInput,
} from './page/metadata.js';
import type { Retention } from './page/retention.js';
import {
  metaOwnerPrefix,
  metadataObjectKey,
  pageObjectKey,
  pagePrefix,
  slugFromMetadataKey,
} from './page/s3-keys.js';
import type { PageShare } from './page/share.js';

/** アップロードする 1 ファイル。body は web の File / Blob、CLI の Buffer のどちらでもよい */
export interface PageFile {
  /** ページ内相対パス（validateUploadPath 済み） */
  path: string;
  body: Blob | Uint8Array;
}

/** 一覧の 1 件。slug は metadata のキー由来 */
export interface StoredPage {
  slug: string;
  metadata: PageMetadata;
}

export interface UploadPageOptions extends UploadMetadataInput {
  /**
   * 差し替えのとき引き継ぐ既存 metadata。新規なら null。
   * web は一覧が持っている値を渡し、CLI は getMetadata で読んでから渡す
   */
  existing: PageMetadata | null;
  /** ページ成果物の Put が 1 件終わるたびに呼ぶ。total に metadata は含めない */
  onProgress?: (completed: number, total: number) => void;
}

/** 1 ユーザーのページに対する S3 操作。書き込んだ metadata を返すので、呼び出し側は S3 を読み直さなくてよい */
export interface PageStore {
  list(): Promise<StoredPage[]>;
  getMetadata(slug: string): Promise<PageMetadata | null>;
  /** ページ成果物の並列 Put、今回含まれないオブジェクトの差分削除、metadata の書き込みを行う */
  upload(
    slug: string,
    files: readonly PageFile[],
    options: UploadPageOptions,
  ): Promise<PageMetadata>;
  setRetention(slug: string, retention: Retention): Promise<PageMetadata>;
  /** null で共有解除 */
  setShare(slug: string, share: PageShare | null): Promise<PageMetadata>;
  /** 存在しない slug でも成功する */
  remove(slug: string): Promise<void>;
}

export interface PageStoreTarget {
  s3: S3Client;
  bucket: string;
  email: string;
}

const UPLOAD_CONCURRENCY = 4;

export function createPageStore({ s3, bucket, email }: PageStoreTarget): PageStore {
  async function listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key) {
          keys.push(item.Key);
        }
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  /** 1 ページのファイル数は MAX_FILE_COUNT（200）以下なので、DeleteObjects の 1000 件上限で分けない */
  async function deleteKeys(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }

  async function getMetadata(slug: string): Promise<PageMetadata | null> {
    try {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: metadataObjectKey(email, slug),
        }),
      );
      if (!response.Body) {
        return null;
      }
      return parsePageMetadata(await response.Body.transformToString());
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async function putMetadata(slug: string, metadata: PageMetadata): Promise<void> {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: metadataObjectKey(email, slug),
        Body: JSON.stringify(metadata),
        ContentType: 'application/json',
      }),
    );
  }

  /** 既存 metadata を読み、update で作った metadata を書き戻す */
  async function updateMetadata(
    slug: string,
    update: (existing: PageMetadata) => PageMetadata,
  ): Promise<PageMetadata> {
    const existing = await getMetadata(slug);
    if (!existing) {
      throw new Error(`ページが見つかりません: ${slug}`);
    }
    const metadata = update(existing);
    await putMetadata(slug, metadata);
    return metadata;
  }

  async function putFiles(
    slug: string,
    files: readonly PageFile[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    let nextIndex = 0;
    let completed = 0;

    async function worker(): Promise<void> {
      while (nextIndex < files.length) {
        const file = files[nextIndex++];
        if (!file) {
          return;
        }

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: pageObjectKey(email, slug, file.path),
            // Blob のまま渡すと、ブラウザで SDK のチェックサム計算が ReadableStream として読もうとして失敗する。
            // 1 件ずつ Put の直前に読むので、全ファイルを同時にメモリへ載せない
            Body:
              file.body instanceof Blob ? new Uint8Array(await file.body.arrayBuffer()) : file.body,
            ContentType: contentTypeFromPath(file.path),
          }),
        );
        completed++;
        onProgress?.(completed, files.length);
      }
    }

    const workerCount = Math.min(UPLOAD_CONCURRENCY, files.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  return {
    async list() {
      const metadataKeys = await listKeys(metaOwnerPrefix(email));

      // metadata の Get は直列だと件数分待たされるので並列にする
      const pages = await Promise.all(
        metadataKeys.map(async (key): Promise<StoredPage | null> => {
          const slug = slugFromMetadataKey(email, key);
          if (!slug) {
            return null;
          }
          const metadata = await getMetadata(slug);
          return metadata ? { slug, metadata } : null;
        }),
      );

      return pages.filter((page): page is StoredPage => page !== null);
    },

    getMetadata,

    async upload(slug, files, options) {
      // ページ成果物 → 差分削除 → metadata の順に書く。途中で失敗しても一覧は前の状態のまま。
      // 新規で metadata まで届かなかった prefix は PageMaintenance が孤児として回収する
      await putFiles(slug, files, options.onProgress);

      const uploadedKeys = new Set(files.map((file) => pageObjectKey(email, slug, file.path)));
      const existingKeys = await listKeys(pagePrefix(email, slug));
      await deleteKeys(existingKeys.filter((key) => !uploadedKeys.has(key)));

      const metadata = buildUploadMetadata(options.existing, options, new Date());
      await putMetadata(slug, metadata);
      return metadata;
    },

    setRetention: (slug, retention) =>
      updateMetadata(slug, (existing) => withRetention(existing, retention)),

    setShare: (slug, share) => updateMetadata(slug, (existing) => withShare(existing, share)),

    async remove(slug) {
      await deleteKeys(await listKeys(pagePrefix(email, slug)));
      // ページ成果物を消してから metadata を消す。途中で失敗しても一覧に残るので再実行できる
      await deleteKeys([metadataObjectKey(email, slug)]);
    },
  };
}

function isNoSuchKeyError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NoSuchKey' || name === 'NotFound';
}
