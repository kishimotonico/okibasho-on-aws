import { classifyEvent, type S3EventRecordLike } from './dispatch.js';
import { applyPlan, deleteKeyIfPresent, listAllActualEntries, redactId } from './kvs-client.js';
import { computeDiff } from './plan.js';
import { computeShareTag } from './tag.js';
import {
  deleteObjectsChunked,
  deletePagePrefix,
  getMetadataJson,
  listAllMetadataKeys,
} from './s3-client.js';
import type { DiffPlan } from './types.js';
import {
  buildDesiredEntry,
  decodeS3EventKey,
  isExpired,
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

/**
 * S3イベント(meta/配下のJSONの作成・削除)と、2本のスケジュールから起動される。
 * S3イベントはそのページだけを投影する(ページ単位でUpdateKeysを呼ぶ。all-or-nothingで
 * 他ページを巻き込まないため)。スケジュールは cleanup(期限切れページの削除)と
 * reconcile(meta/全件とKVS全件の突き合わせ)で、どちらも冪等
 */
export async function handler(event: unknown): Promise<void> {
  const maintenanceEvent = classifyEvent(event);

  switch (maintenanceEvent.kind) {
    case 's3':
      console.log(`trigger=s3 records=${maintenanceEvent.records.length}`);
      await handleS3Records(maintenanceEvent.records);
      return;
    case 'cleanup':
      console.log('trigger=schedule task=cleanup');
      await deleteExpiredPages(await loadMetaEntries(), new Date());
      return;
    case 'reconcile':
      console.log('trigger=schedule task=reconcile');
      await reconcileKvs(await loadMetaEntries(), new Date());
      return;
  }
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
 * putのとき既存値は読まない(常に上書きする)
 */
async function projectPage(prefix: string, metadataKey: string, now: Date): Promise<void> {
  const tag = await computeShareTag(prefix);
  const metadataRaw = await getMetadataJson(PAGES_BUCKET, metadataKey);
  const desired = buildDesiredEntry(metadataRaw, prefix, now);
  // buildDesiredEntry は1KB超過(serializeKvsValueがnullになるケース)も既にnull扱いにしている
  const serialized = desired ? serializeKvsValue(desired.value) : null;

  if (!serialized) {
    // 共有していないページの作成・更新でもこのイベントは飛ぶ。その大半はKVSにキーが無いので、
    // 先に有無を見てDescribe + UpdateKeysの2回を省く
    const deleted = await deleteKeyIfPresent(KVS_ARN, tag);
    console.log(`project: prefix=${prefix} ${deleted ? 'delete' : 'skip'} tag=${redactId(tag)}`);
    return;
  }

  await applyPlan(KVS_ARN, { puts: [{ key: tag, value: serialized }], deletes: [] });
  console.log(`project: prefix=${prefix} put tag=${redactId(tag)}`);
}

interface MetaEntry {
  key: string;
  prefix: string;
  tag: string;
  metadataRaw: unknown;
}

/** meta/全件を読み、prefixとtagを添えて返す。cleanupとreconcileの共通の下ごしらえ */
async function loadMetaEntries(): Promise<MetaEntry[]> {
  const metadataKeys = await listAllMetadataKeys(PAGES_BUCKET);

  const entries = metadataKeys
    .map((key) => ({ key, prefix: prefixFromMetadataKey(key) }))
    .filter((entry): entry is { key: string; prefix: string } => entry.prefix !== null);

  // 1回の所要時間がそのまま反映の待ち時間になるので、独立な読み取りは並列にする
  return mapWithConcurrency(entries, 8, async ({ key, prefix }) => {
    const tag = await computeShareTag(prefix);
    const metadataRaw = await getMetadataJson(PAGES_BUCKET, key);
    return { key, prefix, tag, metadataRaw };
  });
}

/**
 * expiresAtを過ぎているページを削除する。ページ成果物 → metadataの順(web/CLIの削除と同じ順)。
 * metadataを消すとS3イベントが飛ぶので、KVSのエントリはreconcileを待たずに消える
 */
async function deleteExpiredPages(metaEntries: MetaEntry[], now: Date): Promise<void> {
  const expired = metaEntries.filter((entry) => {
    const metadata = entry.metadataRaw;
    const expiresAt =
      typeof metadata === 'object' && metadata !== null
        ? (metadata as Record<string, unknown>).expiresAt
        : undefined;
    return isExpired(expiresAt, now);
  });

  for (const entry of expired) {
    await deletePagePrefix(PAGES_BUCKET, entry.prefix);
    await deleteObjectsChunked(PAGES_BUCKET, [entry.key]);
    console.log(`cleanup: expired prefix=${entry.prefix}`);
  }
}

/** meta/全件から求めた「あるべき状態」とKVS全件を突き合わせる */
async function reconcileKvs(metaEntries: MetaEntry[], now: Date): Promise<void> {
  const desired = new Map(
    metaEntries.map((entry) => {
      const built = buildDesiredEntry(entry.metadataRaw, entry.prefix, now);
      const value = built ? serializeKvsValue(built.value) : null;
      return [entry.tag, value] as const;
    }),
  );
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
  console.log(
    `page-maintenance reconcile: puts=${plan.puts.length} deletes=${plan.deletes.length}`,
  );
}
