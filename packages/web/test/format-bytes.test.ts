import { describe, expect, it } from 'vitest';

import { formatBytes } from '../src/lib/format-bytes';

describe('formatBytes', () => {
  it('0 バイト', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('1023 バイト未満は B 単位', () => {
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('1024 バイトは 1 KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('1.5 MB', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('整数の MB は小数点なし', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB');
  });
});
