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
  metadataObjectKey,
  ownerPrefix,
  pageObjectKey,
  pagePrefix,
  pageViewPath,
  type PageMetadata,
} from '@cli/page';

export type Retention = 'temporary' | 'permanent';

export interface ListedPage {
  slug: string;
  owner: string;
  createdAt: string;
  expiresAt: string | null;
  retention: Retention;
  viewUrl: string;
}

export interface UploadFileInput {
  path: string;
  file: Blob;
}

const UPLOAD_CONCURRENCY = 4;

function retentionFromExpiresAt(expiresAt: string | null): Retention {
  return expiresAt === null ? 'permanent' : 'temporary';
}

export function computeExpiresAtForNewUpload(retention: Retention, createdAt: Date): string | null {
  if (retention === 'permanent') {
    return null;
  }
  const expires = new Date(createdAt);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
}

export function computeExpiresAtForRetentionChange(
  retention: Retention,
  createdAt: string,
): string | null {
  if (retention === 'permanent') {
    return null;
  }
  const created = new Date(createdAt);
  const expires = new Date(created);
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_RETENTION_DAYS);
  return expires.toISOString();
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
  const prefix = ownerPrefix(email);
  const listResult = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: '/',
    }),
  );

  const slugs = (listResult.CommonPrefixes ?? [])
    .map((entry) => entry.Prefix)
    .filter((value): value is string => typeof value === 'string')
    .map((entry) => entry.slice(prefix.length).replace(/\/$/, ''))
    .filter((slug) => slug.length > 0);

  const base = pagesBaseUrl.replace(/\/$/, '');
  const pages = await Promise.all(
    slugs.map(async (slug) => {
      const metadata = await getPageMetadata(client, bucket, email, slug);
      if (!metadata) {
        return null;
      }
      return {
        slug: metadata.slug,
        owner: metadata.owner,
        createdAt: metadata.createdAt,
        expiresAt: metadata.expiresAt,
        retention: retentionFromExpiresAt(metadata.expiresAt),
        viewUrl: `${base}${pageViewPath(emailLocalPart(email), slug)}`,
      };
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
          Body: entry.file,
          ContentType: contentTypeFromPath(entry.path),
        }),
      );
      completed++;
      onProgress?.(completed, files.length + 1);
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
  const metadataKey = metadataObjectKey(email, slug);
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
      if (!object.Key || object.Key === metadataKey) {
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
        slug,
        owner: email,
      }
    : {
        slug,
        owner: email,
        createdAt: now.toISOString(),
        expiresAt: computeExpiresAtForNewUpload(options.retention, now),
      };

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metadataObjectKey(email, slug),
      Body: JSON.stringify(metadata),
      ContentType: 'application/json',
    }),
  );
  onProgress?.(files.length + 1, files.length + 1);

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
    expiresAt: computeExpiresAtForRetentionChange(retention, existing.createdAt),
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
