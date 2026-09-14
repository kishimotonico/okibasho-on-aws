import { describe, expect, it } from 'vitest';
import { chunkPlan } from '../lib/lambda/page-maintenance/kvs-client.js';

describe('chunkPlan', () => {
  it('puts と deletes の合計を 50 キーごとに分ける', () => {
    const deletes = Array.from({ length: 30 }, (_, i) => `d${i}`);
    const puts = Array.from({ length: 40 }, (_, i) => ({ key: `p${i}`, value: '{}' }));

    const chunks = chunkPlan({ puts, deletes });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.deletes).toHaveLength(30);
    expect(chunks[0]!.puts).toHaveLength(20);
    expect(chunks[1]!.deletes).toHaveLength(0);
    expect(chunks[1]!.puts).toHaveLength(20);
  });

  it('差分が無ければ何も送らない', () => {
    expect(chunkPlan({ puts: [], deletes: [] })).toEqual([]);
  });
});
