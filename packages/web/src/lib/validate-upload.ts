import type { CreatePageRequest, RedeclarePageRequest, Retention, Visibility } from '@page-share/shared';
import { validateCreatePageRequest, validateDeclaredFiles } from '@page-share/shared';

import type { UploadFileEntry } from './collect-upload-files.js';

function mapDeclaredFiles(files: readonly UploadFileEntry[]) {
  return files.map((file) => ({
    path: file.path,
    size: file.file.size,
  }));
}

export function buildCreatePageRequest(
  files: readonly UploadFileEntry[],
  options: {
    title: string;
    visibility: Visibility;
    retention: Retention;
  },
): CreatePageRequest {
  const request: CreatePageRequest = {
    retention: options.retention,
    visibility: options.visibility,
    files: mapDeclaredFiles(files),
  };

  const trimmedTitle = options.title.trim();
  if (trimmedTitle) {
    request.title = trimmedTitle;
  }

  return request;
}

export function buildRedeclarePageRequest(files: readonly UploadFileEntry[]): RedeclarePageRequest {
  return {
    files: mapDeclaredFiles(files),
  };
}

export function validateUploadRequest(
  files: readonly UploadFileEntry[],
  options: {
    title: string;
    visibility: Visibility;
    retention: Retention;
  },
) {
  return validateCreatePageRequest(buildCreatePageRequest(files, options));
}

export function validateRedeclareRequest(files: readonly UploadFileEntry[]) {
  return validateDeclaredFiles(buildRedeclarePageRequest(files).files);
}
