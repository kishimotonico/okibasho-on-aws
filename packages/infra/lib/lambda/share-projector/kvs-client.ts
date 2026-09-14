// SigV4A(マルチリージョン署名)のJS実装を有効化する副作用import。
// CloudFrontKeyValueStoreClient はKVS ARNを渡すとendpointルールセットが
// signingRegionSet:["*"] のsigv4aを要求するため、これが無いと呼び出しが例外になる。
// ネイティブの @aws-sdk/signature-v4-crt を入れない代わりに、こちらの純JS実装を読み込む
import '@aws-sdk/signature-v4a';

import {
  CloudFrontKeyValueStoreClient,
  ConflictException,
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import type { ActualEntry, DiffPlan } from './types.js';

const client = new CloudFrontKeyValueStoreClient({});

const MAX_CONFLICT_RETRIES = 5;
const MAX_KEYS_PER_UPDATE = 50;

/** shareIdをログに出すときは先頭4文字だけにする */
export function redactId(id: string): string {
  return `${id.slice(0, 4)}…`;
}

export async function listAllActualEntries(kvsArn: string): Promise<ActualEntry[]> {
  const entries: ActualEntry[] = [];
  let nextToken: string | undefined;

  do {
    const result = await client.send(
      // MaxResults の API 上限は 50
      new ListKeysCommand({ KvsARN: kvsArn, NextToken: nextToken, MaxResults: 50 }),
    );
    for (const item of result.Items ?? []) {
      if (!item.Key || item.Value === undefined) {
        continue;
      }
      const parsed = parseEntryValue(item.Value);
      entries.push({
        id: item.Key,
        prefix: parsed.prefix,
        isTombstone: parsed.isTombstone,
        rawValue: item.Value,
      });
    }
    nextToken = result.NextToken;
  } while (nextToken);

  return entries;
}

/**
 * KVSの値をパースして所有prefixと墓標かどうかを判定する。
 * 生きている値は{"p": prefix, ...}、墓標は{"t": prefix}。
 * JSON不正・どちらのフィールドも無い場合はprefix未定(=削除対象)として扱う
 */
function parseEntryValue(rawValue: string): { prefix: string | undefined; isTombstone: boolean } {
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

/**
 * 差分をUpdateKeysで適用する。IfMatchはDescribeKeyValueStoreのETag。
 * ConflictException(他の実行との競合)はETagを取り直してリトライする
 */
export async function applyPlan(kvsArn: string, plan: DiffPlan): Promise<void> {
  for (const warning of plan.hijackWarnings) {
    console.warn(
      `share-id衝突のため書き込みをスキップ: prefix=${warning.prefix} id=${redactId(warning.id)} occupiedBy=${warning.occupiedByPrefix}`,
    );
  }

  for (const chunk of chunkPlan(plan)) {
    await applyChunk(kvsArn, chunk);
  }
}

/** UpdateKeys は 1 リクエスト 50 キーまで。puts と deletes の合計で分割する */
export function chunkPlan(
  plan: Pick<DiffPlan, 'puts' | 'deletes'>,
): Array<Pick<DiffPlan, 'puts' | 'deletes'>> {
  const ops = [
    ...plan.deletes.map((key) => ({ kind: 'delete' as const, key })),
    ...plan.puts.map((put) => ({ kind: 'put' as const, put })),
  ];
  const chunks: Array<Pick<DiffPlan, 'puts' | 'deletes'>> = [];
  for (let i = 0; i < ops.length; i += MAX_KEYS_PER_UPDATE) {
    const slice = ops.slice(i, i + MAX_KEYS_PER_UPDATE);
    chunks.push({
      puts: slice.flatMap((op) => (op.kind === 'put' ? [op.put] : [])),
      deletes: slice.flatMap((op) => (op.kind === 'delete' ? [op.key] : [])),
    });
  }
  return chunks;
}

async function applyChunk(kvsArn: string, plan: Pick<DiffPlan, 'puts' | 'deletes'>): Promise<void> {
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const describe = await client.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
    if (!describe.ETag) {
      throw new Error('DescribeKeyValueStoreCommand が ETag を返さなかった');
    }

    try {
      await client.send(
        new UpdateKeysCommand({
          KvsARN: kvsArn,
          IfMatch: describe.ETag,
          Puts: plan.puts.map((p) => ({ Key: p.key, Value: p.value })),
          Deletes: plan.deletes.map((key) => ({ Key: key })),
        }),
      );
      return;
    } catch (err) {
      if (err instanceof ConflictException && attempt < MAX_CONFLICT_RETRIES - 1) {
        console.warn(`UpdateKeysCommand が競合。取り直してリトライする (attempt=${attempt + 1})`);
        continue;
      }
      throw err;
    }
  }
}
