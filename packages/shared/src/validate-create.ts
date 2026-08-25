import type { ApiErrorBody, CreatePageRequest, DeclaredFile } from './api.js';
import { MAX_FILE_COUNT, MAX_FILE_SIZE, MAX_PAGE_SIZE } from './limits.js';
import { validateTitle } from './title.js';
import { validateUploadPath } from './upload-path.js';

export type CreatePageValidationError = ApiErrorBody;

const INDEX_HTML_PATH = 'index.html';

export function validateDeclaredFiles(files: DeclaredFile[]): CreatePageValidationError[] {
  const errors: CreatePageValidationError[] = [];

  if (files.length === 0) {
    errors.push({
      code: 'files_required',
      message: 'アップロードするファイルを1件以上指定してください',
    });
    return errors;
  }

  if (files.length > MAX_FILE_COUNT) {
    errors.push({
      code: 'too_many_files',
      message: `ファイル数は最大 ${MAX_FILE_COUNT} 件までです`,
    });
  }

  const seenPaths = new Set<string>();
  let totalSize = 0;
  let hasIndexHtml = false;

  for (const file of files) {
    const pathResult = validateUploadPath(file.path);
    if (!pathResult.ok) {
      errors.push({
        code: 'invalid_path',
        message: `無効なパスです: ${file.path}`,
      });
      continue;
    }

    const normalizedPath = pathResult.path;
    if (seenPaths.has(normalizedPath)) {
      errors.push({
        code: 'duplicate_path',
        message: `パスが重複しています: ${normalizedPath}`,
      });
    } else {
      seenPaths.add(normalizedPath);
    }

    if (!Number.isInteger(file.size) || file.size < 0) {
      errors.push({
        code: 'invalid_file_size',
        message: `サイズは0以上の整数で指定してください: ${file.path}`,
      });
    } else if (file.size > MAX_FILE_SIZE) {
      errors.push({
        code: 'file_too_large',
        message: `1ファイルあたり最大 ${MAX_FILE_SIZE} バイトまでです: ${file.path}`,
      });
    } else {
      totalSize += file.size;
    }

    if (normalizedPath === INDEX_HTML_PATH) {
      hasIndexHtml = true;
    }
  }

  if (totalSize > MAX_PAGE_SIZE) {
    errors.push({
      code: 'page_size_exceeded',
      message: `ページ合計サイズは最大 ${MAX_PAGE_SIZE} バイトまでです`,
    });
  }

  if (!hasIndexHtml) {
    errors.push({
      code: 'missing_index_html',
      message: 'ページ直下に index.html が必要です',
    });
  }

  return errors;
}

/**
 * ページ作成リクエストの宣言内容を検証する。
 * 例外ではなくエラー配列を返し、API が 400 に詰めやすくする。
 */
export function validateCreatePageRequest(input: CreatePageRequest): CreatePageValidationError[] {
  const errors: CreatePageValidationError[] = [];

  if (input.title !== undefined) {
    const titleError = validateTitle(input.title);
    if (titleError) {
      errors.push(titleError);
    }
  }

  if (
    input.visibility !== undefined &&
    input.visibility !== 'internal' &&
    input.visibility !== 'shared'
  ) {
    errors.push({
      code: 'invalid_visibility',
      message: 'visibility は internal または shared を指定してください',
    });
  }

  errors.push(...validateDeclaredFiles(input.files));
  return errors;
}
