import { applyPlan, listAllActualEntries, redactId } from './kvs-client.js';
import { computeDiff } from './plan.js';
import { computeShareTag } from './tag.js';
import { getMetadataJson, listAllMetadataKeys } from './s3-client.js';
import type { DiffPlan } from './types.js';
import {
  buildDesiredEntry,
  decodeS3EventKey,
  prefixFromMetadataKey,
  serializeKvsValue,
} from './validate.js';

const KVS_ARN = requireEnv('KVS_ARN');
const PAGES_BUCKET = requireEnv('PAGES_BUCKET');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が未設定です`);
  }
  return value;
}

interface S3EventRecordLike {
  s3?: { object?: { key?: string } };
}

/**
 * S3イベント(meta/配下のJSONの作成・削除)と15分ごとの安全網スケジュールの両方から起動される。
 * S3イベントはそのページだけを投影し(ページ単位でUpdateKeysを呼ぶ。all-or-nothingで
 * 他ページを巻き込まないため)、スケジュールだけがmeta/全件とKVS全件を突き合わせる
 */
export async function handler(event: unknown): Promise<void> {
  const records = extractS3Records(event);
  if (records) {
    console.log(`trigger=s3 records=${records.length}`);
    await handleS3Records(records);
    return;
  }
  console.log('trigger=schedule');
  await handleReconcile();
}

function extractS3Records(event: unknown): S3EventRecordLike[] | null {
  if (typeof event !== 'object' || event === null || !('Records' in event)) {
    return null;
  }
  const records = (event as { Records?: unknown }).Records;
  if (!Array.isArray(records)) {
    return null;
  }
  const isS3Records = records.every(
    (record) => typeof record === 'object' && record !== null && 's3' in record,
  );
  return isS3Records ? (records as S3EventRecordLike[]) : null;
}

/** イベントのキーをデコードしてprefixを導出し、重複を除いてページ単位で処理する */
async function handleS3Records(records: S3EventRecordLike[]): Promise<void> {
  const metadataKeyByPrefix = new Map<string, string>();
  for (const record of records) {
    const rawKey = record.s3?.object?.key;
    if (!rawKey) {
      continue;
    }
    const decodedKey = decodeS3EventKey(rawKey);
    const prefix = prefixFromMetadataKey(decodedKey);
    if (prefix) {
      metadataKeyByPrefix.set(prefix, decodedKey);
    }
  }

  const now = new Date();
  for (const [prefix, metadataKey] of metadataKeyByPrefix) {
    await projectPage(prefix, metadataKey, now);
  }
}

/**
 * 1ページ分のmetadataを読み、tagのKVSエントリをput/deleteする。
 * 既存値は読まない(putは常に上書き、deleteは存在確認なしで発行し、無ければkvs-client側で成功扱いになる)
 */
async function projectPage(prefix: string, metadataKey: string, now: Date): Promise<void> {
  const tag = await computeShareTag(prefix);
  const metadataRaw = await getMetadataJson(PAGES_BUCKET, metadataKey);
  const desired = buildDesiredEntry(metadataRaw, prefix, now);
  // buildDesiredEntry は1KB超過(serializeKvsValueがnullになるケース)も既にnull扱いにしている
  const serialized = desired ? serializeKvsValue(desired.value) : null;

  const plan: DiffPlan = serialized
    ? { puts: [{ key: tag, value: serialized }], deletes: [] }
    : { puts: [], deletes: [tag] };

  await applyPlan(KVS_ARN, plan);
  console.log(`project: prefix=${prefix} ${serialized ? 'put' : 'delete'} tag=${redactId(tag)}`);
}

async function handleReconcile(): Promise<void> {
  const now = new Date();
  const metadataKeys = await listAllMetadataKeys(PAGES_BUCKET);

  const entries = metadataKeys
    .map((key) => ({ key, prefix: prefixFromMetadataKey(key) }))
    .filter((entry): entry is { key: string; prefix: string } => entry.prefix !== null);

  // reconcile 1回の所要時間がそのまま反映の待ち時間になるので、独立な読み取りは並列にする
  const desiredEntries = await mapWithConcurrency(entries, 8, async ({ key, prefix }) => {
    const tag = await computeShareTag(prefix);
    const metadataRaw = await getMetadataJson(PAGES_BUCKET, key);
    const desired = buildDesiredEntry(metadataRaw, prefix, now);
    const value = desired ? serializeKvsValue(desired.value) : null;
    return [tag, value] as const;
  });

  const desired = new Map(desiredEntries);
  const actual = await listAllActualEntries(KVS_ARN);

  const plan = computeDiff(desired, actual);
  await applyPlan(KVS_ARN, plan);
  logPlan(plan);
}

/** items を同時実行数 limit で mapper に通す。結果の並び順は items と一致する */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function logPlan(plan: DiffPlan): void {
  console.log(`share-projector reconcile: puts=${plan.puts.length} deletes=${plan.deletes.length}`);
}
