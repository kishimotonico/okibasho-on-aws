import { describe, expect, it } from 'vitest';
import { computeDiff } from '../lib/lambda/share-projector/plan.js';
import type { ActualEntry, DesiredEntry } from '../lib/lambda/share-projector/types.js';

const PREFIX_A = 'pages/tanaka@example.jp/a/';
const PREFIX_B = 'pages/suzuki@example.jp/b/';
const ID_A = 'AAAAAAAAAAAAAAAAAAAAAA';
const ID_A2 = 'BBBBBBBBBBBBBBBBBBBBBB';
const ID_B = 'CCCCCCCCCCCCCCCCCCCCCC';

/** 生きているエントリ */
function liveEntry(id: string, prefix: string, extra: Record<string, unknown> = {}): ActualEntry {
  const value = { p: prefix, ...extra };
  return { id, prefix, isTombstone: false, rawValue: JSON.stringify(value) };
}

/** 墓標エントリ */
function tombstoneEntry(id: string, prefix: string): ActualEntry {
  return { id, prefix, isTombstone: true, rawValue: JSON.stringify({ t: prefix }) };
}

/** 所有prefixを決められない壊れたエントリ(JSON不正・p/tどちらも無い) */
function brokenEntry(id: string, rawValue = 'not json'): ActualEntry {
  return { id, prefix: undefined, isTombstone: false, rawValue };
}

function desired(id: string, prefix: string, extra: Record<string, unknown> = {}): DesiredEntry {
  return { id, value: { p: prefix, ...extra } as never };
}

function tombstonePut(id: string, prefix: string) {
  return { key: id, value: JSON.stringify({ t: prefix }) };
}

describe('computeDiff', () => {
  it('新規共有: KVSに無いprefixはputする', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_A, PREFIX_A)]]), []);
    expect(plan.puts).toEqual([{ key: ID_A, value: JSON.stringify({ p: PREFIX_A }) }]);
    expect(plan.deletes).toEqual([]);
    expect(plan.hijackWarnings).toEqual([]);
  });

  it('値の変更: idは同じでも値(CIDRなど)が変わっていればputし直す', () => {
    const plan = computeDiff(
      new Map([[PREFIX_A, desired(ID_A, PREFIX_A, { c: ['203.0.113.0/24'] })]]),
      [liveEntry(ID_A, PREFIX_A)],
    );
    expect(plan.puts).toEqual([
      { key: ID_A, value: JSON.stringify({ p: PREFIX_A, c: ['203.0.113.0/24'] }) },
    ]);
    expect(plan.deletes).toEqual([]);
  });

  it('壊れたエントリと同じidを正当にputするときは、同じKeyのdeleteを並べない', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_A, PREFIX_A)]]), [brokenEntry(ID_A)]);
    expect(plan.puts).toEqual([{ key: ID_A, value: JSON.stringify({ p: PREFIX_A }) }]);
    expect(plan.deletes).toEqual([]);
  });

  it('値が同じならno-op(何も書かない)', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_A, PREFIX_A)]]), [
      liveEntry(ID_A, PREFIX_A),
    ]);
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('停止: desiredがnullなら生きているエントリを墓標に置き換える(削除ではない)', () => {
    const plan = computeDiff(new Map([[PREFIX_A, null]]), [liveEntry(ID_A, PREFIX_A)]);
    expect(plan.puts).toEqual([tombstonePut(ID_A, PREFIX_A)]);
    expect(plan.deletes).toEqual([]);
  });

  it('desiredがnullで既存の生きたエントリも無ければ何もしない', () => {
    const plan = computeDiff(new Map([[PREFIX_A, null]]), []);
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('再発行: 旧idを墓標化し、新idをputする', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_A2, PREFIX_A)]]), [
      liveEntry(ID_A, PREFIX_A),
    ]);
    expect(plan.puts).toEqual(
      expect.arrayContaining([
        tombstonePut(ID_A, PREFIX_A),
        { key: ID_A2, value: JSON.stringify({ p: PREFIX_A }) },
      ]),
    );
    expect(plan.puts).toHaveLength(2);
    expect(plan.deletes).toEqual([]);
  });

  it('ページ削除(metadataが無い) -> 墓標化: reconcile側がdesiredをnullにした前提でも停止と同じ扱いになる', () => {
    const plan = computeDiff(new Map([[PREFIX_A, null]]), [liveEntry(ID_A, PREFIX_A)]);
    expect(plan.puts).toEqual([tombstonePut(ID_A, PREFIX_A)]);
  });

  it('期限切れ -> 墓標化: buildDesiredEntryがnullを返す前提でも停止と同じ扱いになる', () => {
    const plan = computeDiff(new Map([[PREFIX_A, null]]), [liveEntry(ID_A, PREFIX_A)]);
    expect(plan.puts).toEqual([tombstonePut(ID_A, PREFIX_A)]);
    expect(plan.deletes).toEqual([]);
  });

  it('同prefixの墓標の復活: 保存期間を延ばすなどで同じidが再度desiredになれば生きたエントリとしてputし直す', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_A, PREFIX_A)]]), [
      tombstoneEntry(ID_A, PREFIX_A),
    ]);
    expect(plan.puts).toEqual([{ key: ID_A, value: JSON.stringify({ p: PREFIX_A }) }]);
    expect(plan.deletes).toEqual([]);
    expect(plan.hijackWarnings).toEqual([]);
  });

  it('hijack: 別prefixの生きたidを狙っても書かず警告する', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_B, PREFIX_A)]]), [
      liveEntry(ID_B, PREFIX_B),
    ]);
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.hijackWarnings).toEqual([
      { prefix: PREFIX_A, id: ID_B, occupiedByPrefix: PREFIX_B },
    ]);
  });

  it('hijack: 別prefixの墓標のidを狙っても書かず警告する(墓標は消えないため恒久的に守られる)', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_B, PREFIX_A)]]), [
      tombstoneEntry(ID_B, PREFIX_B),
    ]);
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.hijackWarnings).toEqual([
      { prefix: PREFIX_A, id: ID_B, occupiedByPrefix: PREFIX_B },
    ]);
  });

  it('hijack中でも自分のprefixの生きた古いエントリ(別id)は墓標にして掃除する', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_B, PREFIX_A)]]), [
      liveEntry(ID_B, PREFIX_B),
      liveEntry(ID_A, PREFIX_A),
    ]);
    expect(plan.puts).toEqual([tombstonePut(ID_A, PREFIX_A)]);
    expect(plan.deletes).toEqual([]);
    expect(plan.hijackWarnings).toHaveLength(1);
  });

  it('同prefixに生きたエントリが複数: 全部見て、desiredと違うidは全て墓標にする', () => {
    const idC = 'DDDDDDDDDDDDDDDDDDDDDD';
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_A2, PREFIX_A)]]), [
      liveEntry(ID_A, PREFIX_A),
      liveEntry(idC, PREFIX_A),
    ]);
    expect(plan.puts).toEqual(
      expect.arrayContaining([
        tombstonePut(ID_A, PREFIX_A),
        tombstonePut(idC, PREFIX_A),
        { key: ID_A2, value: JSON.stringify({ p: PREFIX_A }) },
      ]),
    );
    expect(plan.puts).toHaveLength(3);
  });

  it('同じidを2つのprefixが同時にdesireした場合、辞書順で先のprefixだけ採用し残りはhijack警告にする', () => {
    const plan = computeDiff(
      new Map([
        [PREFIX_B, desired(ID_A, PREFIX_B)],
        [PREFIX_A, desired(ID_A, PREFIX_A)],
      ]),
      [],
    );
    // PREFIX_B ('pages/suzuki@...') < PREFIX_A ('pages/tanaka@...') (辞書順)
    expect(plan.puts).toEqual([{ key: ID_A, value: JSON.stringify({ p: PREFIX_B }) }]);
    expect(plan.hijackWarnings).toEqual([
      { prefix: PREFIX_A, id: ID_A, occupiedByPrefix: PREFIX_B },
    ]);
  });

  it('JSON不正エントリ(所有prefixを決められない)はdeleteする', () => {
    const plan = computeDiff(new Map(), [brokenEntry(ID_A)]);
    expect(plan.deletes).toEqual([ID_A]);
    expect(plan.puts).toEqual([]);
    expect(plan.hijackWarnings).toEqual([]);
  });

  it('壊れたエントリと同じidを複数prefixが同時にdesireしても、辞書順で先の1つだけがputし残りはhijack警告になる(同じKeyのput重複を避ける)', () => {
    const plan = computeDiff(
      new Map([
        [PREFIX_B, desired(ID_A, PREFIX_B)],
        [PREFIX_A, desired(ID_A, PREFIX_A)],
      ]),
      [brokenEntry(ID_A)],
    );
    // PREFIX_B ('pages/suzuki@...') < PREFIX_A ('pages/tanaka@...') (辞書順)
    expect(plan.puts).toEqual([{ key: ID_A, value: JSON.stringify({ p: PREFIX_B }) }]);
    expect(plan.deletes).toEqual([]);
    expect(plan.hijackWarnings).toEqual([
      { prefix: PREFIX_A, id: ID_A, occupiedByPrefix: PREFIX_B },
    ]);
  });

  it('値が同じなら墓標をputし直さない(墓標のno-op自体は起きないが、生存エントリのno-opは維持される)', () => {
    const plan = computeDiff(new Map([[PREFIX_A, desired(ID_A, PREFIX_A)]]), [
      liveEntry(ID_A, PREFIX_A),
    ]);
    expect(plan.puts).toEqual([]);
  });

  it('全件reconcile: 複数prefixを同時に扱える', () => {
    const plan = computeDiff(
      new Map([
        [PREFIX_A, desired(ID_A, PREFIX_A)],
        [PREFIX_B, null],
      ]),
      [liveEntry(ID_A, PREFIX_A), liveEntry(ID_B, PREFIX_B)],
    );
    expect(plan.puts).toEqual([tombstonePut(ID_B, PREFIX_B)]);
    expect(plan.deletes).toEqual([]);
  });
});
