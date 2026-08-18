import { describe, expect, it } from 'vitest';
import { MAX_FILE_COUNT, MAX_FILE_SIZE, MAX_PAGE_SIZE } from '../src/limits.js';

describe('limits', () => {
  it('1ファイル上限は 50 MB', () => {
    expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
  });

  it('1ページ合計上限は 200 MB', () => {
    expect(MAX_PAGE_SIZE).toBe(200 * 1024 * 1024);
  });

  it('ファイル数上限は 200', () => {
    expect(MAX_FILE_COUNT).toBe(200);
  });
});
