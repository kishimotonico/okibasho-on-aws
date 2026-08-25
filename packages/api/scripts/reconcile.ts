/**
 * meta/ を正として KVS / users マーカー / 孤児バージョンを整合させるスクリプト。
 * 既定は dry-run。--apply で実行する。
 */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import type { PageMetadata, UserPageIndexEntry } from '@page-share/shared';
import {
  expiresAtEpochSeconds,
  kvsKey,
  META_PREFIX,
  pagePrefix,
  serializePageAliasValue,
  USERS_PREFIX,
  userIndexObjectKey,
} from '@page-share/shared';
import { ORPHAN_RECLAIM_MIN_AGE_MS, versionIdFromObjectKey } from '../src/version-reclaim.js';

interface ReconcilePlan {
  kvsPuts: Array<{ key: string; value: string }>;
  kvsDeletes: string[];
  markerCreates: Array<{ key: string; body: UserPageIndexEntry }>;
  markerDeletes: string[];
  orphanVersionDeletes: string[];
}

function printUsage(): void {
  console.log('Usage: reconcile [--apply]');
  console.log('  env: PAGES_BUCKET, KVS_ARN');
}

function parseArgs(argv: string[]): { apply: boolean } {
  const apply = argv.includes('--apply');
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    printUsage();
    process.exit(0);
  }
  return { apply };
}

function slugFromMetaKey(key: string): string | null {
  if (!key.startsWith(META_PREFIX) || !key.endsWith('.json')) {
    return null;
  }
  const slug = key.slice(META_PREFIX.length, -'.json'.length);
  return slug.length > 0 ? slug : null;
}

function parseMarkerKey(key: string): { ownerSub: string; slug: string } | null {
  if (!key.startsWith(USERS_PREFIX) || !key.endsWith('.json')) {
    return null;
  }
  const rest = key.slice(USERS_PREFIX.length, -'.json'.length);
  const slashIndex = rest.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }
  const ownerSub = rest.slice(0, slashIndex);
  const slug = rest.slice(slashIndex + 1);
  if (ownerSub.length === 0 || slug.length === 0) {
    return null;
  }
  return { ownerSub, slug };
}

function isPageMetadata(value: unknown): value is PageMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata['slug'] === 'string' &&
    typeof metadata['ownerSub'] === 'string' &&
    typeof metadata['ownerEmail'] === 'string' &&
    (metadata['visibility'] === 'internal' || metadata['visibility'] === 'shared') &&
    (metadata['retention'] === 'temporary' || metadata['retention'] === 'permanent') &&
    typeof metadata['createdAt'] === 'string' &&
    typeof metadata['contentUpdatedAt'] === 'string' &&
    typeof metadata['version'] === 'number' &&
    typeof metadata['activeVersionId'] === 'string'
  );
}

async function listObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<Array<{ key: string; lastModifiedMs: number }>> {
  const objects: Array<{ key: string; lastModifiedMs: number }> = [];
  let continuationToken: string | undefined;

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
        objects.push({
          key: item.Key,
          lastModifiedMs: item.LastModified?.getTime() ?? 0,
        });
      }
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken !== undefined);

  return objects;
}

async function listKeys(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const objects = await listObjects(client, bucket, prefix);
  return objects.map((object) => object.key);
}

async function getJson<T>(client: S3Client, bucket: string, key: string): Promise<T | null> {
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const body = await result.Body?.transformToString();
    if (body === undefined || body.length === 0) {
      return null;
    }
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

async function buildPlan(client: S3Client, bucket: string): Promise<ReconcilePlan> {
  const plan: ReconcilePlan = {
    kvsPuts: [],
    kvsDeletes: [],
    markerCreates: [],
    markerDeletes: [],
    orphanVersionDeletes: [],
  };

  const metaKeys = await listKeys(client, bucket, META_PREFIX);
  const markerKeys = await listKeys(client, bucket, USERS_PREFIX);
  const metaBySlug = new Map<string, PageMetadata>();

  for (const metaKey of metaKeys) {
    const slug = slugFromMetaKey(metaKey);
    if (slug === null) {
      continue;
    }
    const metadata = await getJson<PageMetadata>(client, bucket, metaKey);
    if (!isPageMetadata(metadata)) {
      continue;
    }
    metaBySlug.set(slug, metadata);

    const aliasKey = kvsKey(metadata.visibility, slug);
    const aliasValue = serializePageAliasValue({
      v: metadata.activeVersionId,
      e: expiresAtEpochSeconds(metadata.retention, new Date(metadata.contentUpdatedAt)),
    });
    plan.kvsPuts.push({ key: aliasKey, value: aliasValue });

    const markerKey = userIndexObjectKey(metadata.ownerSub, slug);
    const marker = await getJson<UserPageIndexEntry>(client, bucket, markerKey);
    if (marker === null) {
      plan.markerCreates.push({
        key: markerKey,
        body: { slug, createdAt: metadata.createdAt },
      });
    }

    const prefix = pagePrefix(metadata.visibility, slug);
    const objectInfos = await listObjects(client, bucket, prefix);
    const versionLastModified = new Map<string, number>();
    for (const object of objectInfos) {
      const versionId = versionIdFromObjectKey(metadata.visibility, slug, object.key);
      if (versionId === null) {
        continue;
      }
      const current = versionLastModified.get(versionId) ?? 0;
      versionLastModified.set(versionId, Math.max(current, object.lastModifiedMs));
    }

    const cutoff = Date.now() - ORPHAN_RECLAIM_MIN_AGE_MS;
    for (const object of objectInfos) {
      const versionId = versionIdFromObjectKey(metadata.visibility, slug, object.key);
      if (versionId === null || versionId === metadata.activeVersionId) {
        continue;
      }
      const lastModified = versionLastModified.get(versionId) ?? 0;
      if (lastModified <= cutoff) {
        plan.orphanVersionDeletes.push(object.key);
      }
    }
  }

  for (const markerKey of markerKeys) {
    const parsed = parseMarkerKey(markerKey);
    if (parsed === null) {
      continue;
    }
    if (!metaBySlug.has(parsed.slug)) {
      plan.markerDeletes.push(markerKey);
    }
  }

  console.log(
    'KVS 削除対象の自動検出は未実装です。meta に無いキーが残っている場合は手動で確認してください。',
  );

  return plan;
}

async function applyKvsChanges(kvsArn: string, plan: ReconcilePlan): Promise<void> {
  if (plan.kvsPuts.length === 0) {
    return;
  }

  const client = new CloudFrontKeyValueStoreClient({ region: 'us-east-1' });
  const describe = await client.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
  const etag = describe.ETag;
  if (etag === undefined) {
    throw new Error('KeyValueStore の ETag を取得できませんでした');
  }

  await client.send(
    new UpdateKeysCommand({
      KvsARN: kvsArn,
      IfMatch: etag,
      Puts: plan.kvsPuts.map((entry) => ({ Key: entry.key, Value: entry.value })),
      Deletes: plan.kvsDeletes.map((key) => ({ Key: key })),
    }),
  );
}

async function applyPlan(
  s3: S3Client,
  bucket: string,
  kvsArn: string,
  plan: ReconcilePlan,
): Promise<void> {
  for (const marker of plan.markerCreates) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: marker.key,
        Body: JSON.stringify(marker.body),
        ContentType: 'application/json',
      }),
    );
  }

  const deleteKeys = [...plan.markerDeletes, ...plan.orphanVersionDeletes];
  if (deleteKeys.length > 0) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: deleteKeys.map((key) => ({ Key: key })),
          Quiet: true,
        },
      }),
    );
  }

  await applyKvsChanges(kvsArn, plan);
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const bucket = process.env['PAGES_BUCKET'];
  const kvsArn = process.env['KVS_ARN'];
  if (!bucket || !kvsArn) {
    console.error('PAGES_BUCKET と KVS_ARN を設定してください');
    process.exit(1);
  }

  const s3 = new S3Client({});
  const plan = await buildPlan(s3, bucket);

  console.log('reconcile plan', {
    kvsPuts: plan.kvsPuts.length,
    kvsDeletes: plan.kvsDeletes.length,
    markerCreates: plan.markerCreates.length,
    markerDeletes: plan.markerDeletes.length,
    orphanVersionDeletes: plan.orphanVersionDeletes.length,
    apply,
  });

  if (!apply) {
    console.log('dry-run のため変更は適用しませんでした。適用するには --apply を付けてください。');
    return;
  }

  await applyPlan(s3, bucket, kvsArn, plan);
  console.log('reconcile applied');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

