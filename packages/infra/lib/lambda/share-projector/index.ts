import { extractS3Records, type S3EventRecordLike } from './dispatch.js';
import { applyPlan, listAllActualEntries, redactId } from './kvs-client.js';
import { computeDiff } from './plan.js';
import { computeShareTag } from './tag.js';
import {
  deleteObjectsChunked,
  deletePagePrefix,
  getMetadataJson,
  listAllMetadataKeys,
  listPagePrefixesWithLastModified,
} from './s3-client.js';
import type { DiffPlan } from './types.js';
import {
  buildDesiredEntry,
  decodeS3EventKey,
  isExpired,
  isPastOrphanGracePeriod,
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
 * S3イベント(meta/配下のJSONの作成・削除)と1時間ごとのスケジュールの両方から起動される。
 * S3イベントはそのページだけを投影し(ページ単位でUpdateKeysを呼ぶ。all-or-nothingで
 * 他ページを巻き込まないため)、スケジュールは「期限切れページの削除」「孤児の回収」
 * 「meta/全件とKVS全件の突き合わせ」の3つを順に行う(定期処理をcleanupと統合したもの)
 */
export async function handler(event: unknown): Promise<void> {
  const records = extractS3Records(event);
  if (records) {
    console.log(`trigger=s3 records=${records.length}`);
    await handleS3Records(records);
    return;
  }
  console.log('trigger=schedule');
  await handleSchedule();
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

interface MetaEntry {
  key: string;
  prefix: string;
  tag: string;
  metadataRaw: unknown;
}

/**
 * 1時間ごとのスケジュール処理。
 * 1. 期限切れページの削除(成果物 → metadataの順)
 * 2. 孤児(成果物はあるがmetadataが無い prefix。猶予24時間)の回収
 * 3. meta/全件とKVS全件の突き合わせ
 *
 * 期限切れページの削除を先に行うが、KVSの突き合わせに使う desired は
 * (削除前に読んだ)metadataから buildDesiredEntry で計算するため、期限切れ分は
 * どのみち null(=削除対象)になる。物理削除の順序に関わらず同じ実行内で整合する
 */
async function handleSchedule(): Promise<void> {
  const now = new Date();
  const metadataKeys = await listAllMetadataKeys(PAGES_BUCKET);

  const entries = metadataKeys
    .map((key) => ({ key, prefix: prefixFromMetadataKey(key) }))
    .filter((entry): entry is { key: string; prefix: string } => entry.prefix !== null);

  // reconcile 1回の所要時間がそのまま反映の待ち時間になるので、独立な読み取りは並列にする
  const metaEntries: MetaEntry[] = await mapWithConcurrency(entries, 8, async ({ key, prefix }) => {
    const tag = await computeShareTag(prefix);
    const metadataRaw = await getMetadataJson(PAGES_BUCKET, key);
    return { key, prefix, tag, metadataRaw };
  });

  await deleteExpiredPages(metaEntries, now);
  await reclaimOrphanPages(metaEntries, now);
  await reconcileKvs(metaEntries, now);
}

/** expiresAtを過ぎているページを削除する。ページ成果物 → metadataの順(web/CLIの削除と同じ順) */
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

/**
 * 孤児(pages/配下にオブジェクトはあるがmeta/配下にmetadataが無いprefix)を回収する。
 * アップロードは成果物 → metadataの順に書くため、アップロード中のページを誤って消さないよう
 * そのprefix配下の最新更新から24時間経っているものだけを対象にする
 */
async function reclaimOrphanPages(metaEntries: MetaEntry[], now: Date): Promise<void> {
  const metadataPrefixes = new Set(metaEntries.map((entry) => entry.prefix));
  const pagePrefixes = await listPagePrefixesWithLastModified(PAGES_BUCKET);

  for (const [prefix, lastModified] of pagePrefixes) {
    if (metadataPrefixes.has(prefix)) {
      continue;
    }
    if (!isPastOrphanGracePeriod(lastModified, now)) {
      continue;
    }
    await deletePagePrefix(PAGES_BUCKET, prefix);
    console.log(`cleanup: orphan prefix=${prefix}`);
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
  console.log(`share-projector reconcile: puts=${plan.puts.length} deletes=${plan.deletes.length}`);
}
