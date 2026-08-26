import { MAX_FILE_COUNT, MAX_FILE_SIZE, MAX_PAGE_SIZE, validateUploadPath } from '@cli/page';

import type { UploadFileEntry } from './collect-upload-files.js';

export interface UploadValidationError {
  code: string;
  message: string;
}

const INDEX_HTML_PATH = 'index.html';

export function validateUploadFiles(files: readonly UploadFileEntry[]): UploadValidationError[] {
  const errors: UploadValidationError[] = [];

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

    const size = file.file.size;
    if (!Number.isInteger(size) || size < 0) {
      errors.push({
        code: 'invalid_file_size',
        message: `サイズは0以上の整数で指定してください: ${file.path}`,
      });
    } else if (size > MAX_FILE_SIZE) {
      errors.push({
        code: 'file_too_large',
        message: `1ファイルあたり最大 ${MAX_FILE_SIZE} バイトまでです: ${file.path}`,
      });
    } else {
      totalSize += size;
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
