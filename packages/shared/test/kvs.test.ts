import { describe, expect, it } from 'vitest';
import { kvsKey, parsePageAliasValue, serializePageAliasValue } from '../src/kvs.js';

describe('kvsKey', () => {
  it('visibility を名前空間にする', () => {
    expect(kvsKey('internal', 'abcdefghijklmnop')).toBe('internal/abcdefghijklmnop');
    expect(kvsKey('shared', 'abcdefghijklmnop')).toBe('shared/abcdefghijklmnop');
  });
});

describe('serializePageAliasValue', () => {
  it('無期限は e を省く', () => {
    expect(serializePageAliasValue({ v: '0123456789abcdef' })).toBe('{"v":"0123456789abcdef"}');
  });

  it('期限付きは e を含める', () => {
    expect(serializePageAliasValue({ v: '0123456789abcdef', e: 1790000000 })).toBe(
      '{"v":"0123456789abcdef","e":1790000000}',
    );
  });
});

describe('parsePageAliasValue', () => {
  it('有効な JSON を返す', () => {
    expect(parsePageAliasValue('{"v":"0123456789abcdef"}')).toEqual({ v: '0123456789abcdef' });
    expect(parsePageAliasValue('{"v":"0123456789abcdef","e":1790000000}')).toEqual({
      v: '0123456789abcdef',
      e: 1790000000,
    });
  });

  it('不正な値は null', () => {
    expect(parsePageAliasValue('not-json')).toBeNull();
    expect(parsePageAliasValue('{"v":"short"}')).toBeNull();
    expect(parsePageAliasValue('{"e":1}')).toBeNull();
  });
});
