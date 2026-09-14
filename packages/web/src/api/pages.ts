import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  contentTypeFromPath,
  DEFAULT_RETENTION_DAYS,
  emailLocalPart,
  isPageMetadata,
  metaOwnerPrefix,
  metadataObjectKey,
  pageObjectKey,
  pagePrefix,
  pageViewPath,
  slugFromMetadataKey,
  type PageMetadata,
  type PageShare,
} from '@cli/page';

export type Retention = 'temporary' | 'permanent';

export interface ListedPage {
  slug: string;
  owner: string;
  createdAt: string;
  expiresAt: string | null;
  retention: Retention;
  viewUrl: string;
  share?: PageShare;
}

export interface UploadFileInput {
  path: string;
  file: Blob;
}

const UPLOAD_CONCURRENCY = 4;

function retentionFromExpiresAt(expiresAt: string | null): Retention {
  return expiresAt === null ? 'permanent' : 'temporary';
}

/**
 * 保存期限。temporary は基準時刻（新規アップロードは公開時刻、保存期間の変更は作成時刻）から
 * 30日後で、permanent は期限なし。新規と変更で計算が違わないようひとつにまとめている。
 */
export function computeExpiresAt(retention: Retention, base: Date | string): string | null {
  if (retention === 'permanent') {
    return null;
  }
  const expires = new Date(base);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

/**
 * 一覧の行から、差し替えアップロードで引き継ぐメタデータを作る。
 * 一覧が同じ内容を持っているので、差し替えのたびに S3 を読み直す必要はない。
 */
export function pageMetadataFromListed(page: ListedPage): PageMetadata {
  return {
    createdAt: page.createdAt,
    expiresAt: page.expiresAt,
    ...(page.share ? { share: page.share } : {}),
  };
}

async function bodyToString(body: unknown): Promise<string> {
  if (!body) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (
    typeof (body as { transformToString?: () => Promise<string> }).transformToString === 'function'
  ) {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

export async function getPageMetadata(
  client: S3Client,
  bucket: string,
  email: string,
  slug: string,
): Promise<PageMetadata | null> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: metadataObjectKey(email, slug),
      }),
    );
    const raw = await bodyToString(response.Body);
    const parsed: unknown = JSON.parse(raw);
    return isPageMetadata(parsed) ? parsed : null;
  } catch (error) {
    if (isNoSuchKeyError(error)) {
      return null;
    }
    throw error;
  }
}

export async function listPages(
  client: S3Client,
  bucket: string,
  email: string,
  pagesBaseUrl: string,
): Promise<ListedPage[]> {
  const metaPrefix = metaOwnerPrefix(email);
  const metadataKeys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const listResult = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: metaPrefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of listResult.Contents ?? []) {
      if (object.Key) {
        metadataKeys.push(object.Key);
      }
    }

    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);

  const pages = await Promise.all(
    metadataKeys.map(async (metadataKey) => {
      const slug = slugFromMetadataKey(email, metadataKey);
      if (!slug) {
        return null;
      }
      const metadata = await getPageMetadata(client, bucket, email, slug);
      if (!metadata) {
        return null;
      }
      const listed: ListedPage = {
        slug,
        owner: email,
        createdAt: metadata.createdAt,
        expiresAt: metadata.expiresAt,
        retention: retentionFromExpiresAt(metadata.expiresAt),
        viewUrl: buildViewUrl(pagesBaseUrl, email, slug),
        ...(metadata.share ? { share: metadata.share } : {}),
      };
      return listed;
    }),
  );

  return pages.filter((page): page is ListedPage => page !== null);
}

async function putFilesWithConcurrency(
  client: S3Client,
  bucket: string,
  email: string,
  slug: string,
  files: readonly UploadFileInput[],
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (nextIndex < files.length) {
      const currentIndex = nextIndex++;
      const entry = files[currentIndex];
      if (!entry) {
        return;
      }

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: pageObjectKey(email, slug, entry.path),
          // Blob のまま渡すと、SDK のチェックサム計算が ReadableStream として読もうとして失敗する
          Body: new Uint8Array(await entry.file.arrayBuffer()),
          ContentType: contentTypeFromPath(entry.path),
        }),
      );
      completed++;
      onProgress?.(completed, files.length);
    }
  }

  const workerCount = Math.min(UPLOAD_CONCURRENCY, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function deleteOrphanObjects(
  client: S3Client,
  bucket: string,
  email: string,
  slug: string,
  uploadedKeys: ReadonlySet<string>,
): Promise<void> {
  const pagePref = pagePrefix(email, slug);
  const keysToDelete: string[] = [];
  let continuationToken: string | undefined;

  do {
    const listResult = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: pagePref,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of listResult.Contents ?? []) {
      if (!object.Key) {
        continue;
      }
      if (!uploadedKeys.has(object.Key)) {
        keysToDelete.push(object.Key);
      }
    }

    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);

  if (keysToDelete.length === 0) {
    return;
  }

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keysToDelete.map((Key) => ({ Key })),
      },
    }),
  );
}

export async function uploadPage(
  client: S3Client,
  bucket: string,
  email: string,
  slug: string,
  files: readonly UploadFileInput[],
  options: {
    retention: Retention;
    existingMetadata?: PageMetadata | null;
    /**
     * 外部共有を新しく設定する場合だけ渡す。渡さなければ既存の share（あれば）をそのまま引き継ぐ。
     * Composer で「外部にも公開」を選んだときに使う
     */
    share?: PageShare;
  },
  onProgress?: (completed: number, total: number) => void,
): Promise<PageMetadata> {
  await putFilesWithConcurrency(client, bucket, email, slug, files, onProgress);

  const uploadedKeys = new Set(files.map((file) => pageObjectKey(email, slug, file.path)));
  await deleteOrphanObjects(client, bucket, email, slug, uploadedKeys);

  const now = new Date();
  const metadata: PageMetadata = options.existingMetadata
    ? {
        ...options.existingMetadata,
        // permanent 化済みページは再アップロードで temporary に戻さない
        expiresAt:
          options.existingMetadata.expiresAt === null
            ? null
            : computeExpiresAt(options.retention, now),
        ...(options.share ? { share: options.share } : {}),
      }
    : {
        createdAt: now.toISOString(),
        expiresAt: computeExpiresAt(options.retention, now),
        ...(options.share ? { share: options.share } : {}),
      };

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metadataObjectKey(email, slug),
      Body: JSON.stringify(metadata),
      ContentType: 'application/json',
    }),
  );

  return metadata;
}

export async function updatePageRetention(
  client: S3Client,
  bucket: string,
  email: string,
  slug: string,
  retention: Retention,
): Promise<PageMetadata> {
  const existing = await getPageMetadata(client, bucket, email, slug);
  if (!existing) {
    throw new Error(`ページが見つかりません: ${slug}`);
  }

  const metadata: PageMetadata = {
    ...existing,
    expiresAt: computeExpiresAt(retention, existing.createdAt),
  };

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metadataObjectKey(email, slug),
      Body: JSON.stringify(metadata),
      ContentType: 'application/json',
    }),
  );

  return metadata;
}

/** 外部共有設定を更新する。既存 metadata を読み、share だけ差し替えて書き戻す。null で共有解除 */
export async function updatePageShare(
  client: S3Client,
  bucket: string,
  email: string,
  slug: string,
  share: PageShare | null,
): Promise<PageMetadata> {
  const existing = await getPageMetadata(client, bucket, email, slug);
  if (!existing) {
    throw new Error(`ページが見つかりません: ${slug}`);
  }

  const metadata: PageMetadata = { ...existing };
  if (share) {
    metadata.share = share;
  } else {
    delete metadata.share;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metadataObjectKey(email, slug),
      Body: JSON.stringify(metadata),
      ContentType: 'application/json',
    }),
  );

  return metadata;
}

export async function deletePage(
  client: S3Client,
  bucket: string,
  email: string,
  slug: string,
): Promise<void> {
  const pagePref = pagePrefix(email, slug);
  const keysToDelete: string[] = [];
  let continuationToken: string | undefined;

  do {
    const listResult = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: pagePref,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of listResult.Contents ?? []) {
      if (object.Key) {
        keysToDelete.push(object.Key);
      }
    }

    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);

  if (keysToDelete.length > 0) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keysToDelete.map((Key) => ({ Key })),
        },
      }),
    );
  }

  // ページ成果物を消してから metadata を消す。途中で失敗しても一覧に残るので再実行できる
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: [{ Key: metadataObjectKey(email, slug) }],
      },
    }),
  );
}

/** 公開URLの固定部分。末尾は `/`（slug 入力の直前） */
export function buildViewUrlPrefix(pagesBaseUrl: string, email: string): string {
  const base = pagesBaseUrl.replace(/\/$/, '');
  return `${base}/p/${emailLocalPart(email)}/`;
}

export function buildViewUrl(pagesBaseUrl: string, email: string, slug: string): string {
  const base = pagesBaseUrl.replace(/\/$/, '');
  return `${base}${pageViewPath(emailLocalPart(email), slug)}`;
}

function isNoSuchKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = (error as { name?: string }).name;
  return name === 'NoSuchKey' || name === 'NotFound';
}
