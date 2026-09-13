import { describe, expect, it } from 'vitest';

import { describeUploadSelection } from '../src/lib/describe-upload-selection';

function entry(path: string, size: number) {
  return { path, file: { size } };
}

describe('describeUploadSelection', () => {
  it('1件ならファイル名で選んだと書く', () => {
    expect(describeUploadSelection([entry('index.html', 1200)])).toBe('index.html を選択しました');
  });

  it('複数なら件数と合計サイズを書く', () => {
    expect(
      describeUploadSelection([
        entry('index.html', 1024),
        entry('style.css', 1024),
        entry('app.js', 1024 * 1024 - 2048),
      ]),
    ).toBe('3 件のファイルを選択しました（合計 1 MB）');
  });
});
