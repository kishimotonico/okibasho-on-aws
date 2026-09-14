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
 * EventBridge Ruleから5分ごとに起動される。S3イベントには依存せず、常に
 * pages/配下の全.metadata.jsonとKVS全件を突き合わせる全件reconcileだけを行う
 */
export async function handler(): Promise<void> {
  await handleReconcile();
}

async function handleReconcile(): Promise<void> {
  const now = new Date();
  const metadataKeys = await listAllMetadataKeys(PAGES_BUCKET);

  const desiredByPrefix = new Map<string, DesiredEntry | null>();
  for (const key of metadataKeys) {
    const prefix = prefixFromMetadataKey(key);
    if (!prefix) {
      continue;
    }
    desiredByPrefix.set(prefix, await resolveDesiredForPrefix(prefix, now));
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
