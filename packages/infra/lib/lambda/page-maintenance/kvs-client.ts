// SigV4A(マルチリージョン署名)のJS実装を有効化する副作用import。
// CloudFrontKeyValueStoreClient はKVS ARNを渡すとendpointルールセットが
// signingRegionSet:["*"] のsigv4aを要求するため、これが無いと呼び出しが例外になる。
// ネイティブの @aws-sdk/signature-v4-crt を入れない代わりに、こちらの純JS実装を読み込む
import '@aws-sdk/signature-v4a';

import {
  CloudFrontKeyValueStoreClient,
  ConflictException,
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  ListKeysCommand,
  ResourceNotFoundException,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import type { DiffPlan } from './types.js';

const client = new CloudFrontKeyValueStoreClient({});

const MAX_CONFLICT_RETRIES = 5;
const MAX_KEYS_PER_UPDATE = 50;

/** tag(KVSのkey)をログに出すときは先頭4文字だけにする */
export function redactId(id: string): string {
  return `${id.slice(0, 4)}…`;
}

/**
 * KVS全件を tag -> 生JSON文字列 で返す(1時間毎の全件reconcile用)。
 * tagはprefixから決まるので、値の中身を解釈する必要はなく、文字列としてそのまま突き合わせられる
 */
export async function listAllActualEntries(kvsArn: string): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  let nextToken: string | undefined;

  do {
    const result = await client.send(
      // MaxResults の API 上限は 50
      new ListKeysCommand({ KvsARN: kvsArn, NextToken: nextToken, MaxResults: 50 }),
    );
    for (const item of result.Items ?? []) {
      if (item.Key && item.Value !== undefined) {
        entries.set(item.Key, item.Value);
      }
    }
    nextToken = result.NextToken;
  } while (nextToken);

  return entries;
}

/** UpdateKeys は 1 リクエスト 50 キーまで。puts と deletes の合計で分割する */
export function chunkPlan(plan: DiffPlan): DiffPlan[] {
  const ops = [
    ...plan.deletes.map((key) => ({ kind: 'delete' as const, key })),
    ...plan.puts.map((put) => ({ kind: 'put' as const, put })),
  ];
  const chunks: DiffPlan[] = [];
  for (let i = 0; i < ops.length; i += MAX_KEYS_PER_UPDATE) {
    const slice = ops.slice(i, i + MAX_KEYS_PER_UPDATE);
    chunks.push({
      puts: slice.flatMap((op) => (op.kind === 'put' ? [op.put] : [])),
      deletes: slice.flatMap((op) => (op.kind === 'delete' ? [op.key] : [])),
    });
  }
  return chunks;
}

/** 差分をUpdateKeysで適用する。50件を超える場合はチャンクに分けて順に適用する */
export async function applyPlan(kvsArn: string, plan: DiffPlan): Promise<void> {
  for (const chunk of chunkPlan(plan)) {
    await applyChunk(kvsArn, chunk);
  }
}

async function keyExists(kvsArn: string, key: string): Promise<boolean> {
  try {
    await client.send(new GetKeyCommand({ KvsARN: kvsArn, Key: key }));
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return false;
    }
    throw err;
  }
}

/**
 * IfMatchはDescribeKeyValueStoreのETag。
 * ConflictException(他の実行との競合)はETagを取り直してリトライする。
 *
 * 存在しないキーのdeleteをUpdateKeysに渡したときの挙動は公式ドキュメントで未確定
 * (ResourceNotFoundExceptionになる可能性がある)。1件だけのdelete(put無し)でそれが起きたときだけ、
 * GetKeyでそのキーが実際に無いことを確かめて成功扱いにする。あれば別の理由のエラーなので再送出する
 */
async function applyChunk(kvsArn: string, plan: DiffPlan): Promise<void> {
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
      if (
        err instanceof ResourceNotFoundException &&
        plan.deletes.length === 1 &&
        plan.puts.length === 0
      ) {
        const exists = await keyExists(kvsArn, plan.deletes[0]!);
        if (!exists) {
          return;
        }
      }
      throw err;
    }
  }
}
