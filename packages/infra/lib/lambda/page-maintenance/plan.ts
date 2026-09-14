import type { DiffPlan } from './types.js';

/**
 * 「あるべき状態」と「実際のKVS」を突き合わせて差分を決める純粋関数。15分毎の全件reconcileで使う
 * (S3イベント駆動のページ単位の投影は、この関数を使わずページごとに直接put/deleteする)。
 *
 * KVSのキーはprefixから決まるtagなので、旧仕様(share-idがキー)のような
 * 墓標・hijack判定・辞書順の先勝ちは不要になった。あるprefixのtagは常にそのprefixだけが使う
 *
 * desired: tag -> シリアライズ済みの値。shareが無効(無し・期限切れ・検証失敗など)ならnull
 * actual: KVSの実際の tag -> 生JSON文字列
 */
export function computeDiff(
  desired: Map<string, string | null>,
  actual: Map<string, string>,
): DiffPlan {
  const puts: DiffPlan['puts'] = [];
  const deletes: string[] = [];

  for (const [tag, value] of desired) {
    if (value === null) {
      if (actual.has(tag)) {
        deletes.push(tag);
      }
      continue;
    }
    if (actual.get(tag) !== value) {
      puts.push({ key: tag, value });
    }
  }

  // desiredに現れないtag(metadata自体が無くなったprefix)も削除対象にする
  for (const tag of actual.keys()) {
    if (!desired.has(tag)) {
      deletes.push(tag);
    }
  }

  return { puts, deletes };
}
