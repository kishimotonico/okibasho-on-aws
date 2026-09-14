import { applyPlan, listAllActualEntries, redactId } from './kvs-client.js';
import { computeDiff } from './plan.js';
import { getMetadataJson, listAllMetadataKeys } from './s3-client.js';
import type { DesiredEntry, DiffPlan } from './types.js';
import { buildDesiredEntry, prefixFromMetadataKey } from './validate.js';

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
 * S3イベント(.metadata.jsonの作成・削除)と15分ごとの安全網スケジュールの両方から起動される。
 * イベントの中身は使わず、常にpages/配下の全.metadata.jsonとKVS全件を突き合わせる。
 * トリガー種別だけはログに出す(アラームを持たないため、イベントが届いているかをLogsで追えるようにする)
 */
export async function handler(event: unknown): Promise<void> {
  console.log(`trigger=${describeTrigger(event)}`);
  await handleReconcile();
}

function describeTrigger(event: unknown): string {
  if (
    typeof event === 'object' &&
    event !== null &&
    'Records' in event &&
    Array.isArray((event as { Records?: unknown }).Records)
  ) {
    const records = (event as { Records: unknown[] }).Records;
    const isS3Records = records.every(
      (record) => typeof record === 'object' && record !== null && 's3' in record,
    );
    if (isS3Records) {
      return `s3 records=${records.length}`;
    }
  }
  return 'schedule';
}

async function handleReconcile(): Promise<void> {
  const now = new Date();
  const metadataKeys = await listAllMetadataKeys(PAGES_BUCKET);

  const prefixes = [...new Set(metadataKeys.map(prefixFromMetadataKey).filter((p) => p !== null))];
  // reconcile 1回の所要時間がそのまま反映の待ち時間になるので、独立な読み取りは並列にする
  const desiredEntries = await mapWithConcurrency(prefixes, 8, (prefix) =>
    resolveDesiredForPrefix(prefix, now),
  );

  const desiredByPrefix = new Map<string, DesiredEntry | null>();
  for (let i = 0; i < prefixes.length; i++) {
    desiredByPrefix.set(prefixes[i]!, desiredEntries[i]!);
  }

  const actual = await listAllActualEntries(KVS_ARN);
  // metadataが無くなった(pageごと削除された)prefixも対象に含める。
  // 墓標(t)のprefixも同様に含めることで、期限切れ・削除後もidの再利用防止(墓標化)を維持する
  for (const entry of actual) {
    if (entry.prefix !== undefined && !desiredByPrefix.has(entry.prefix)) {
      desiredByPrefix.set(entry.prefix, null);
    }
  }

  const plan = computeDiff(desiredByPrefix, actual);
  await applyPlan(KVS_ARN, plan);
  logPlan(plan);
}

async function resolveDesiredForPrefix(prefix: string, now: Date): Promise<DesiredEntry | null> {
  const metadataKey = `${prefix}.metadata.json`;
  const metadata = await getMetadataJson(PAGES_BUCKET, metadataKey);
  return buildDesiredEntry(metadata, prefix, now);
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
    `share-projector: puts=${plan.puts.length} deletes=${plan.deletes.length} hijackWarnings=${plan.hijackWarnings.length}`,
  );
  for (const put of plan.puts) {
    const { prefix, isTombstone } = describePutValue(put.value);
    console.log(
      `${isTombstone ? '墓標化' : 'put'}: prefix=${prefix ?? '(不明)'} id=${redactId(put.key)}`,
    );
  }
  for (const del of plan.deletes) {
    console.log(`delete(不正なエントリ): id=${redactId(del)}`);
  }
  // hijack警告はapplyPlan側(kvs-client.ts)で書き込み前にログ済み
}

function describePutValue(rawValue: string): { prefix: string | undefined; isTombstone: boolean } {
  try {
    const parsed = JSON.parse(rawValue) as { p?: unknown; t?: unknown };
    if (typeof parsed.p === 'string') {
      return { prefix: parsed.p, isTombstone: false };
    }
    if (typeof parsed.t === 'string') {
      return { prefix: parsed.t, isTombstone: true };
    }
    return { prefix: undefined, isTombstone: false };
  } catch {
    return { prefix: undefined, isTombstone: false };
  }
}
