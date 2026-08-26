import { MAX_FILE_SIZE } from '@cli/page';
import { describe, expect, it } from 'vitest';

import { validateUploadFiles } from '../src/lib/validate-upload';

function makeFile(name: string, path: string, size = 1, content = 'x') {
  const file = new File([content], name, { type: 'text/html' });
  Object.defineProperty(file, 'size', { value: size });
  return { path, file };
}

describe('validateUploadFiles', () => {
  it('index.html が無いときにエラーになる', () => {
    const errors = validateUploadFiles([makeFile('style.css', 'assets/style.css')]);

    expect(errors.some((error) => error.code === 'missing_index_html')).toBe(true);
  });

  it('有効なファイル一覧はエラーなし', () => {
    expect(validateUploadFiles([makeFile('index.html', 'index.html')])).toEqual([]);
  });

  it('1ファイルサイズ超過を検出する', () => {
    const errors = validateUploadFiles([makeFile('index.html', 'index.html', MAX_FILE_SIZE + 1)]);

    expect(errors.some((error) => error.code === 'file_too_large')).toBe(true);
  });
  it('ページ合計サイズ超過を検出する', () => {
    const fileSize = 50 * 1024 * 1024;
    const errors = validateUploadFiles([
      makeFile('index.html', 'index.html', 1),
      makeFile('a.bin', 'a.bin', fileSize),
      makeFile('b.bin', 'b.bin', fileSize),
      makeFile('c.bin', 'c.bin', fileSize),
      makeFile('d.bin', 'd.bin', fileSize),
    ]);

    expect(errors.some((error) => error.code === 'page_size_exceeded')).toBe(true);
  });
});
