import { describe, expect, it } from 'vitest';
import { validateUploadPath } from '../src/upload-path.js';

describe('validateUploadPath', () => {
  it('有効な相対パスを正規化して返す', () => {
    expect(validateUploadPath('index.html')).toEqual({ ok: true, path: 'index.html' });
    expect(validateUploadPath('assets/app.js')).toEqual({ ok: true, path: 'assets/app.js' });
  });

  it.each([
    [''],
    ['../secret'],
    ['/etc/passwd'],
    ['C:\\x'],
    ['a\\b'],
    ['.env'],
    ['a/../b'],
    ['a/'],
    ['.git/config'],
    ['a//b'],
  ])('拒否する: %s', (path) => {
    expect(validateUploadPath(path)).toEqual({ ok: false });
  });

  it('Windows ドライブレター付きパスを拒否する', () => {
    expect(validateUploadPath('C:foo')).toEqual({ ok: false });
  });

  it('制御文字を含むパスを拒否する', () => {
    expect(validateUploadPath('a\u0000b')).toEqual({ ok: false });
  });
});
