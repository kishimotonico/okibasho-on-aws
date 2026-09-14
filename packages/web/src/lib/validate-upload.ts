import { MAX_FILE_COUNT, MAX_FILE_SIZE, MAX_PAGE_SIZE, validateUploadPath } from '@cli/page';

import { messages } from '~/lib/messages';

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
      message: messages.validationFilesRequired,
    });
    return errors;
  }

  if (files.length > MAX_FILE_COUNT) {
    errors.push({
      code: 'too_many_files',
      message: messages.validationTooManyFiles(MAX_FILE_COUNT),
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
        message: messages.validationInvalidPath(file.path),
      });
      continue;
    }

    const normalizedPath = pathResult.path;
    if (seenPaths.has(normalizedPath)) {
      errors.push({
        code: 'duplicate_path',
        message: messages.validationDuplicatePath(normalizedPath),
      });
    } else {
      seenPaths.add(normalizedPath);
    }

    const size = file.file.size;
    if (!Number.isInteger(size) || size < 0) {
      errors.push({
        code: 'invalid_file_size',
        message: messages.validationInvalidFileSize(file.path),
      });
    } else if (size > MAX_FILE_SIZE) {
      errors.push({
        code: 'file_too_large',
        message: messages.validationFileTooLarge(file.path),
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
      message: messages.validationPageSizeExceeded,
    });
  }

  if (!hasIndexHtml) {
    errors.push({
      code: 'missing_index_html',
      message: messages.validationMissingIndexHtml,
    });
  }

  return errors;
}
