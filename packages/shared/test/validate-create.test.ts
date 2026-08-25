import { describe, expect, it } from 'vitest';
import { MAX_FILE_COUNT, MAX_FILE_SIZE, TITLE_MAX_LENGTH } from '../src/index.js';
import { validateCreatePageRequest, validateDeclaredFiles } from '../src/validate-create.js';

const validFiles = [{ path: 'index.html', size: 100 }];

describe('validateCreatePageRequest', () => {
  it('有効なリクエストはエラーなし', () => {
    expect(validateCreatePageRequest({ files: validFiles })).toEqual([]);
  });

  it('title の制御文字は invalid_title', () => {
    const errors = validateCreatePageRequest({ title: 'a\nb', files: validFiles });
    expect(errors.some((e) => e.code === 'invalid_title')).toBe(true);
  });

  it('title の長さ超過は invalid_title', () => {
    const errors = validateCreatePageRequest({
      title: 'あ'.repeat(TITLE_MAX_LENGTH + 1),
      files: validFiles,
    });
    expect(errors.some((e) => e.code === 'invalid_title')).toBe(true);
  });

  it('visibility が不正なら invalid_visibility', () => {
    const errors = validateCreatePageRequest({
      visibility: 'public' as never,
      files: validFiles,
    });
    expect(errors.some((e) => e.code === 'invalid_visibility')).toBe(true);
  });

  it('files が空なら files_required', () => {
    const errors = validateCreatePageRequest({ files: [] });
    expect(errors).toEqual([
      {
        code: 'files_required',
        message: 'アップロードするファイルを1件以上指定してください',
      },
    ]);
  });

  it('index.html が無いと missing_index_html', () => {
    const errors = validateCreatePageRequest({
      files: [{ path: 'assets/app.js', size: 100 }],
    });
    expect(errors.some((e) => e.code === 'missing_index_html')).toBe(true);
  });

  it('ファイル数超過', () => {
    const files = Array.from({ length: MAX_FILE_COUNT + 1 }, (_, i) => ({
      path: i === 0 ? 'index.html' : `file-${i}.txt`,
      size: 1,
    }));
    const errors = validateCreatePageRequest({ files });
    expect(errors.some((e) => e.code === 'too_many_files')).toBe(true);
  });

  it('合計サイズ超過', () => {
    const errors = validateCreatePageRequest({
      files: [
        { path: 'index.html', size: MAX_FILE_SIZE },
        { path: 'a.bin', size: MAX_FILE_SIZE },
        { path: 'b.bin', size: MAX_FILE_SIZE },
        { path: 'c.bin', size: MAX_FILE_SIZE },
        { path: 'd.bin', size: MAX_FILE_SIZE },
      ],
    });
    expect(errors.some((e) => e.code === 'page_size_exceeded')).toBe(true);
  });

  it('1ファイルサイズ超過', () => {
    const errors = validateCreatePageRequest({
      files: [{ path: 'index.html', size: MAX_FILE_SIZE + 1 }],
    });
    expect(errors.some((e) => e.code === 'file_too_large')).toBe(true);
  });

  it('path 重複', () => {
    const errors = validateCreatePageRequest({
      files: [
        { path: 'index.html', size: 100 },
        { path: 'index.html', size: 200 },
      ],
    });
    expect(errors.some((e) => e.code === 'duplicate_path')).toBe(true);
  });

  it('無効な path', () => {
    const errors = validateCreatePageRequest({
      files: [{ path: '../index.html', size: 100 }],
    });
    expect(errors.some((e) => e.code === 'invalid_path')).toBe(true);
  });

  it('負のサイズ', () => {
    const errors = validateCreatePageRequest({
      files: [{ path: 'index.html', size: -1 }],
    });
    expect(errors.some((e) => e.code === 'invalid_file_size')).toBe(true);
  });
});

describe('validateDeclaredFiles', () => {
  it('create と同じファイル検証を単体で使える', () => {
    expect(validateDeclaredFiles(validFiles)).toEqual([]);
    expect(validateDeclaredFiles([]).some((e) => e.code === 'files_required')).toBe(true);
  });
});
