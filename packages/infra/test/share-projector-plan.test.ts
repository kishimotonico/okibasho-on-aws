import { describe, expect, it } from 'vitest';
import { computeDiff } from '../lib/lambda/share-projector/plan.js';

const TAG_A = 'AAAAAAAAAAA';
const TAG_B = 'BBBBBBBBBBB';
const VALUE_A = JSON.stringify({ p: 'pages/tanaka@example.jp/a/', id: 'a'.repeat(22) });
const VALUE_A2 = JSON.stringify({
  p: 'pages/tanaka@example.jp/a/',
  id: 'a'.repeat(22),
  c: ['203.0.113.0/24'],
});
const VALUE_B = JSON.stringify({ p: 'pages/suzuki@example.jp/b/', id: 'b'.repeat(22) });

describe('computeDiff', () => {
  it('新規共有: actualに無いtagはputする', () => {
    const plan = computeDiff(new Map([[TAG_A, VALUE_A]]), new Map());
    expect(plan.puts).toEqual([{ key: TAG_A, value: VALUE_A }]);
    expect(plan.deletes).toEqual([]);
  });

  it('値の変更: 同じtagでも値(CIDRなど)が変わっていればputし直す', () => {
    const plan = computeDiff(new Map([[TAG_A, VALUE_A2]]), new Map([[TAG_A, VALUE_A]]));
    expect(plan.puts).toEqual([{ key: TAG_A, value: VALUE_A2 }]);
    expect(plan.deletes).toEqual([]);
  });

  it('値が同じならno-op(何も書かない)', () => {
    const plan = computeDiff(new Map([[TAG_A, VALUE_A]]), new Map([[TAG_A, VALUE_A]]));
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('共有停止・期限切れ: desiredがnullで実際のエントリがあればdeleteする', () => {
    const plan = computeDiff(new Map([[TAG_A, null]]), new Map([[TAG_A, VALUE_A]]));
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([TAG_A]);
  });

  it('desiredがnullで実際のエントリも無ければ何もしない', () => {
    const plan = computeDiff(new Map([[TAG_A, null]]), new Map());
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('ページ削除(metadata自体が無くなった): desiredに現れないtagもdeleteする', () => {
    const plan = computeDiff(new Map(), new Map([[TAG_A, VALUE_A]]));
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([TAG_A]);
  });

  it('全件reconcile: 複数tagを同時に扱える', () => {
    const plan = computeDiff(
      new Map([
        [TAG_A, VALUE_A],
        [TAG_B, null],
      ]),
      new Map([
        [TAG_A, VALUE_A],
        [TAG_B, VALUE_B],
      ]),
    );
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([TAG_B]);
  });
});
