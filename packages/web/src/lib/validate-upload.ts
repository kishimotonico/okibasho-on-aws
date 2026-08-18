import type { CreatePageRequest, Retention } from '@page-share/shared';
import { validateCreatePageRequest } from '@page-share/shared';

import type { UploadFileEntry } from './collect-upload-files.js';

export function buildCreatePageRequest(
  files: readonly UploadFileEntry[],
  slug: string,
  retention: Retention,
): CreatePageRequest {
  return {
    ...(slug.trim() ? { slug: slug.trim() } : {}),
    retention,
    files: files.map((file) => ({
      path: file.path,
      size: file.file.size,
    })),
  };
}

export function validateUploadRequest(
  files: readonly UploadFileEntry[],
  slug: string,
  retention: Retention,
) {
  return validateCreatePageRequest(buildCreatePageRequest(files, slug, retention));
}
