import { describe, expect, it } from 'vitest';

import {
  collectUploadFilesFromFileList,
  stripTopDirectoryFromRelativePath,
} from '../src/lib/collect-upload-files';

function makeFile(name: string, options: { size?: number; webkitRelativePath?: string } = {}) {
  const file = new File(['x'], name, { type: 'text/html' });
  Object.defineProperty(file, 'size', { value: options.size ?? 1 });
  Object.defineProperty(file, 'webkitRelativePath', {
    value: options.webkitRelativePath ?? name,
  });
  return file;
}

describe('collectUploadFilesFromFileList', () => {
  it('webkitRelativePath の先頭ディレクトリを落として / 区切りのパスにする', () => {
    const result = collectUploadFilesFromFileList([
      makeFile('index.html', { webkitRelativePath: 'site/index.html' }),
      makeFile('style.css', { webkitRelativePath: 'site/assets/style.css' }),
    ]);

    expect(result.files.map((file) => file.path)).toEqual(['index.html', 'assets/style.css']);
    expect(result.skippedInvalidPath).toBe(0);
  });

  it('単一 HTML ファイルは index.html として送る', () => {
    const result = collectUploadFilesFromFileList([
      makeFile('page.htm', { webkitRelativePath: 'page.htm' }),
    ]);

    expect(result.files).toEqual([expect.objectContaining({ path: 'index.html' })]);
  });

  it('dotfile はスキップする', () => {
    const result = collectUploadFilesFromFileList([
      makeFile('index.html', { webkitRelativePath: 'site/index.html' }),
      makeFile('.hidden', { webkitRelativePath: 'site/.hidden' }),
    ]);

    expect(result.files.map((file) => file.path)).toEqual(['index.html']);
    expect(result.skippedInvalidPath).toBe(1);
  });
});

describe('stripTopDirectoryFromRelativePath', () => {
  it('先頭の1階層だけを除去する', () => {
    expect(stripTopDirectoryFromRelativePath('site/assets/app.js')).toBe('assets/app.js');
  });
});
