/**
 * users/<sub>/ 配下のマーカーと meta/ の整合性を手動で直すスクリプト。
 * インフラを足さず、おかしいと思ったときに叩く想定。既定は dry-run。
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { PageMetadata, UserPageIndexEntry } from '@page-share/shared';
import { META_PREFIX, metaObjectKey, USERS_PREFIX, userIndexObjectKey } from '@page-share/shared';

interface ReconcilePlan {
  createMarkers: Array<{ key: string; entry: UserPageIndexEntry }>;
  deleteMarkers: string[];
}

function printUsage(): void {
  console.log(
    'Usage: reconcile-user-index.ts [--apply] [--bucket <name>]\n\n' +
      '  PAGES_BUCKET  バケット名（--bucket 未指定時）\n' +
      '  --apply       実際に書き換える（既定は dry-run）\n' +
      '  --bucket      バケット名\n' +
      '  --help        この説明を表示',
  );
}

function parseArgs(argv: string[]): {
  apply: boolean;
  bucket: string | null;
  help: boolean;
  explicitHelp: boolean;
} {
  let apply = false;
  let bucket: string | null = process.env['PAGES_BUCKET'] ?? null;
  let help = false;
  let explicitHelp = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      explicitHelp = true;
      continue;
    }
    if (arg === '--bucket') {
      bucket = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    help = true;
  }

  return { apply, bucket, help, explicitHelp };
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
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) {
    return null;
  }
  return {
    ownerSub: rest.slice(0, slash),
    slug: rest.slice(slash + 1),
  };
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
    (metadata['retention'] === 'temporary' || metadata['retention'] === 'permanent') &&
    typeof metadata['createdAt'] === 'string' &&
    (metadata['expiresAt'] === null || typeof metadata['expiresAt'] === 'string') &&
    typeof metadata['fileCount'] === 'number' &&
    typeof metadata['totalSize'] === 'number'
  );
}

async function listKeys(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
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

    for (const item of result.Contents ?? []) {
      if (item.Key !== undefined) {
        keys.push(item.Key);
      }
    }

    continuationToken = result.NextContinuationToken;
  } while (continuationToken !== undefined);

  return keys;
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
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'NoSuchKey'
    ) {
      return null;
    }
    throw error;
  }
}

async function buildPlan(client: S3Client, bucket: string): Promise<ReconcilePlan> {
  const metaKeys = await listKeys(client, bucket, META_PREFIX);
  const markerKeys = await listKeys(client, bucket, USERS_PREFIX);

  const expectedMarkerKeys = new Set<string>();
  const createMarkers: ReconcilePlan['createMarkers'] = [];

  for (const metaKey of metaKeys) {
    const slug = slugFromMetaKey(metaKey);
    if (slug === null) {
      continue;
    }

    const raw = await getJson<unknown>(client, bucket, metaKey);
    if (!isPageMetadata(raw)) {
      console.log('reconcile_skip_invalid_meta', { metaKey });
      continue;
    }

    const markerKey = userIndexObjectKey(raw.ownerSub, slug);
    expectedMarkerKeys.add(markerKey);

    const existingMarker = await getJson<unknown>(client, bucket, markerKey);
    if (existingMarker === null) {
      createMarkers.push({
        key: markerKey,
        entry: { slug, createdAt: raw.createdAt },
      });
    }
  }

  const deleteMarkers: string[] = [];
  for (const markerKey of markerKeys) {
    const parsed = parseMarkerKey(markerKey);
    if (parsed === null) {
      continue;
    }

    if (!expectedMarkerKeys.has(markerKey)) {
      deleteMarkers.push(markerKey);
      continue;
    }

    const metaKey = metaObjectKey(parsed.slug);
    const meta = await getJson<unknown>(client, bucket, metaKey);
    if (!isPageMetadata(meta) || meta.ownerSub !== parsed.ownerSub) {
      deleteMarkers.push(markerKey);
    }
  }

  return { createMarkers, deleteMarkers };
}

async function applyPlan(client: S3Client, bucket: string, plan: ReconcilePlan): Promise<void> {
  for (const { key, entry } of plan.createMarkers) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(entry),
        ContentType: 'application/json',
      }),
    );
    console.log('reconcile_marker_created', { key });
  }

  if (plan.deleteMarkers.length > 0) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: plan.deleteMarkers.map((key) => ({ Key: key })),
          Quiet: true,
        },
      }),
    );
    for (const key of plan.deleteMarkers) {
      console.log('reconcile_marker_deleted', { key });
    }
  }
}

async function main(): Promise<void> {
  const { apply, bucket, help, explicitHelp } = parseArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    process.exit(explicitHelp ? 0 : 1);
  }

  if (bucket === null || bucket.length === 0) {
    console.error('バケット名が必要です。PAGES_BUCKET または --bucket を指定してください。');
    printUsage();
    process.exit(1);
  }

  const client = new S3Client({});
  const plan = await buildPlan(client, bucket);

  console.log('reconcile_plan', {
    mode: apply ? 'apply' : 'dry-run',
    bucket,
    markersToCreate: plan.createMarkers.length,
    markersToDelete: plan.deleteMarkers.length,
  });

  for (const { key, entry } of plan.createMarkers) {
    console.log('reconcile_would_create_marker', { key, entry });
  }
  for (const key of plan.deleteMarkers) {
    console.log('reconcile_would_delete_marker', { key });
  }

  if (apply) {
    await applyPlan(client, bucket, plan);
    console.log('reconcile_applied');
  } else if (plan.createMarkers.length === 0 && plan.deleteMarkers.length === 0) {
    console.log('reconcile_no_changes');
  }
}

main().catch((error) => {
  console.error('reconcile_failed', error);
  process.exit(1);
});
