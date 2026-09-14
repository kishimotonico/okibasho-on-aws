import { serializeKvsValue, serializeTombstoneValue } from './validate.js';
import type { ActualEntry, DesiredEntry, DiffPlan } from './types.js';

/**
 * 「あるべき状態」と「実際のKVS」を突き合わせて差分を決める純粋関数。
 *
 * desiredByPrefix はこの呼び出しが責任を持つprefix集合そのもの(全件reconcileでは
 * 「metadataが存在するprefix」と「actualEntriesに現れるprefix」の和集合)。
 *
 * KVSの値には2種類ある:
 *   - 生きている共有: {"p": prefix, ...}
 *   - 墓標:           {"t": prefix} (share-idの再利用を防ぐため消さずに残す)
 *
 * ルール(share-spec-v2.md 4節):
 *   - 各エントリの所有prefixは p または t。どちらも無い・JSON不正なエントリは削除する
 *   - 同じprefixの生きているエントリは複数ありうる。全部見る
 *   - desiredがnull: そのprefixの生きているエントリを全部墓標に置き換える
 *   - あるべきidが既に別prefixのエントリ(生き/墓標問わず)として存在する: 書かない(hijack警告)。
 *     このprefixの生きているエントリでidが違うものは墓標にする
 *   - それ以外: このprefixの生きているエントリでidがdesiredと違うものを墓標にし、desiredをput
 *     (同じprefixの墓標なら復活してよい)。値が同じなら書かない
 *   - 同じidを複数のprefixが同時にdesireし、どちらも既存エントリが無い場合は
 *     prefixの辞書順で先の1つだけ採用し、残りはhijack警告にする
 *   - 墓標は消さない
 */
export function computeDiff(
  desiredByPrefix: Map<string, DesiredEntry | null>,
  actualEntries: ActualEntry[],
): DiffPlan {
  const entryById = new Map(actualEntries.map((entry) => [entry.id, entry]));

  // 所有prefixを決められない(JSON不正・p/tどちらも無い)エントリは無条件で削除する
  const deletes: string[] = actualEntries
    .filter((entry) => entry.prefix === undefined)
    .map((entry) => entry.id);

  // 生きているエントリをprefix単位でグルーピングする(同じprefixに複数ありうる)
  const liveByPrefix = new Map<string, ActualEntry[]>();
  for (const entry of actualEntries) {
    if (!entry.isTombstone && entry.prefix !== undefined) {
      const list = liveByPrefix.get(entry.prefix) ?? [];
      list.push(entry);
      liveByPrefix.set(entry.prefix, list);
    }
  }

  // 既存エントリの無いidを複数prefixが同時に狙っているケースを先に解決する(辞書順で先勝ち)
  const contendersById = new Map<string, string[]>();
  for (const [prefix, desired] of desiredByPrefix) {
    if (desired === null || entryById.has(desired.id)) {
      continue;
    }
    const list = contendersById.get(desired.id) ?? [];
    list.push(prefix);
    contendersById.set(desired.id, list);
  }
  const virtualOwnerById = new Map<string, string>();
  for (const [id, prefixes] of contendersById) {
    if (prefixes.length > 1) {
      virtualOwnerById.set(id, [...prefixes].sort()[0]!);
    }
  }

  const puts: DiffPlan['puts'] = [];
  const hijackWarnings: DiffPlan['hijackWarnings'] = [];

  for (const [prefix, desired] of desiredByPrefix) {
    const liveEntries = liveByPrefix.get(prefix) ?? [];

    if (desired === null) {
      for (const live of liveEntries) {
        puts.push({ key: live.id, value: serializeTombstoneValue(prefix) });
      }
      continue;
    }

    const occupant = entryById.get(desired.id);
    const occupiedByPrefix = occupant ? occupant.prefix : virtualOwnerById.get(desired.id);

    if (occupiedByPrefix !== undefined && occupiedByPrefix !== prefix) {
      hijackWarnings.push({ prefix, id: desired.id, occupiedByPrefix });
      for (const live of liveEntries) {
        if (live.id !== desired.id) {
          puts.push({ key: live.id, value: serializeTombstoneValue(prefix) });
        }
      }
      continue;
    }

    // このprefixの古いエントリ(別id)は墓標にする。再発行や、複数の生きたエントリの整理がこれにあたる
    for (const live of liveEntries) {
      if (live.id !== desired.id) {
        puts.push({ key: live.id, value: serializeTombstoneValue(prefix) });
      }
    }

    const serialized = serializeKvsValue(desired.value);
    if (serialized === null) {
      // ここに来る前にbuildDesiredEntryで弾かれているはずだが、念のため
      continue;
    }

    if (occupant && !occupant.isTombstone && occupant.rawValue === serialized) {
      continue; // 値が同じなら書かない
    }

    puts.push({ key: desired.id, value: serialized });
  }

  // 壊れたエントリと同じidを正当に put する場合は、put の上書きだけで足りる。
  // 1 回の UpdateKeys に同じ Key の delete と put を並べない
  const putKeys = new Set(puts.map((put) => put.key));
  return { puts, deletes: deletes.filter((id) => !putKeys.has(id)), hijackWarnings };
}
