import { describe, expect, it } from 'vitest';

import { extractTitleFromHtml } from '../src/lib/extract-title-from-html';
import {
  buildCreatePageRequest,
  validateRedeclareRequest,
  validateUploadRequest,
} from '../src/lib/validate-upload';

function makeFile(name: string, path: string, size = 1, content = 'x') {
  const file = new File([content], name, { type: 'text/html' });
  Object.defineProperty(file, 'size', { value: size });
  return { path, file };
}

describe('extractTitleFromHtml', () => {
  it('index.html の title 要素を拾う', async () => {
    const file = new File(['<html><title>  Demo Page  </title></html>'], 'index.html', {
      type: 'text/html',
    });
    await expect(extractTitleFromHtml(file)).resolves.toBe('Demo Page');
  });

  it('title が無いとき null', async () => {
    const file = new File(['<html><body>hi</body></html>'], 'index.html', {
      type: 'text/html',
    });
    await expect(extractTitleFromHtml(file)).resolves.toBeNull();
  });
});

describe('validateUploadRequest', () => {
  it('index.html が無いときにエラーになる', () => {
    const errors = validateUploadRequest(
      [makeFile('style.css', 'assets/style.css')],
      { title: '', visibility: 'internal', retention: 'temporary' },
    );

    expect(errors.some((error) => error.code === 'missing_index_html')).toBe(true);
  });

  it('title と visibility を含むリクエストを組み立てる', () => {
    const request = buildCreatePageRequest([makeFile('index.html', 'index.html')], {
      title: 'My Page',
      visibility: 'shared',
      retention: 'permanent',
    });

    expect(request).toEqual({
      title: 'My Page',
      visibility: 'shared',
      retention: 'permanent',
      files: [{ path: 'index.html', size: 1 }],
    });
  });
});

describe('validateRedeclareRequest', () => {
  it('再アップロードはファイル検証だけ行う', () => {
    const errors = validateRedeclareRequest([makeFile('index.html', 'index.html')]);
    expect(errors).toEqual([]);
  });
});
