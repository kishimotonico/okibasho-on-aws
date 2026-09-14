import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import type { ResolvedConfig } from './config.js';
import { DEFAULT_RETENTION_DAYS, isPageMetadata, type PageMetadata } from './page/metadata.js';
import {
  emailLocalPart,
  metaOwnerPrefix,
  metadataObjectKey,
  pageObjectKey,
  pagePrefix,
  pageViewPath,
  slugFromMetadataKey,
} from './page/s3-keys.js';

export function createS3Client(config: ResolvedConfig, idToken: string): S3Client {
  return new S3Client({
    region: config.region,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: config.region },
      identityPoolId: config.identityPoolId,
      logins: {
        [`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`]: idToken,
      },
    }),
  });
}

export interface PageFileUpload {
  path: string;
  body: Buffer;
  contentType: string;
}

export interface UploadPageInput {
  email: string;
  slug: string;
  files: PageFileUpload[];
  permanent: boolean;
}

export function buildViewUrl(pagesBaseUrl: string, email: string, slug: string): string {
  const base = pagesBaseUrl.endsWith('/') ? pagesBaseUrl.slice(0, -1) : pagesBaseUrl;
  return `${base}${pageViewPath(emailLocalPart(email), slug)}`;
}

async function readObjectBody(s3: S3Client, bucket: string, key: string): Promise<Buffer | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    if (!response.Body) {
      return null;
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') {
      return null;
    }
    throw err;
  }
}

async function listAllKeys(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
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

async function deleteKeys(s3: S3Client, bucket: string, keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  for (let offset = 0; offset < keys.length; offset += 1000) {
    const chunk = keys.slice(offset, offset + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

function computeExpiresAt(permanent: boolean): string | null {
  if (permanent) {
    return null;
  }
  return new Date(Date.now() + DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function uploadPage(
  s3: S3Client,
  bucket: string,
  pagesBaseUrl: string,
  input: UploadPageInput,
): Promise<{ viewUrl: string; metadata: PageMetadata }> {
  const prefix = pagePrefix(input.email, input.slug);
  const metadataKey = metadataObjectKey(input.email, input.slug);
  const uploadKeys = new Set(
    input.files.map((file) => pageObjectKey(input.email, input.slug, file.path)),
  );

  let createdAt = new Date().toISOString();
  let existingPermanent = false;
  let existingMetadata: PageMetadata | null = null;
  const existingMetadataBody = await readObjectBody(s3, bucket, metadataKey);
  if (existingMetadataBody) {
    try {
      const parsed: unknown = JSON.parse(existingMetadataBody.toString('utf8'));
      if (isPageMetadata(parsed)) {
        existingMetadata = parsed;
        createdAt = parsed.createdAt;
        existingPermanent = parsed.expiresAt === null;
      }
    } catch {
      // 壊れた metadata は上書きする
    }
  }

  for (const file of input.files) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: pageObjectKey(input.email, input.slug, file.path),
        Body: file.body,
        ContentType: file.contentType,
      }),
    );
  }

  const existingKeys = await listAllKeys(s3, bucket, prefix);
  const staleKeys = existingKeys.filter((key) => !uploadKeys.has(key));
  await deleteKeys(s3, bucket, staleKeys);

  const metadata: PageMetadata = {
    ...existingMetadata,
    createdAt,
    // permanent 化済みページは再アップロードで temporary に戻さない
    expiresAt: computeExpiresAt(input.permanent || existingPermanent),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metadataKey,
      Body: JSON.stringify(metadata),
      ContentType: 'application/json',
    }),
  );

  return {
    viewUrl: buildViewUrl(pagesBaseUrl, input.email, input.slug),
    metadata,
  };
}

/** 一覧表示用に、metadata へ S3 キー由来の slug を足したもの */
export type ListedPageMetadata = PageMetadata & { slug: string };

export async function listPages(
  s3: S3Client,
  bucket: string,
  email: string,
): Promise<ListedPageMetadata[]> {
  const metaPrefix = metaOwnerPrefix(email);
  const metadataKeys = await listAllKeys(s3, bucket, metaPrefix);

  const pages: ListedPageMetadata[] = [];
  for (const metadataKey of metadataKeys) {
    const slug = slugFromMetadataKey(email, metadataKey);
    if (!slug) {
      continue;
    }
    const body = await readObjectBody(s3, bucket, metadataKey);
    if (!body) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(body.toString('utf8'));
      if (isPageMetadata(parsed)) {
        pages.push({ ...parsed, slug });
      }
    } catch {
      // 壊れた metadata は一覧から除外
    }
  }

  pages.sort((a, b) => a.slug.localeCompare(b.slug));
  return pages;
}

export async function removePage(
  s3: S3Client,
  bucket: string,
  email: string,
  slug: string,
): Promise<void> {
  const prefix = pagePrefix(email, slug);
  const keys = await listAllKeys(s3, bucket, prefix);
  await deleteKeys(s3, bucket, keys);
  // ページ成果物を消してから metadata を消す。途中で失敗しても一覧に残るので再実行できる
  await deleteKeys(s3, bucket, [metadataObjectKey(email, slug)]);
}
