/**
 * CLI / Web / API から共通で参照する型と定数の置き場。
 *
 * 同じルールが3箇所にコピーされるのを防ぐために用意している。
 */

export type {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorResponse,
  CreatePageRequest,
  CreatePageResponse,
  DeclaredFile,
  PresignedUpload,
} from './api.js';

export { contentTypeFromPath } from './content-type.js';

export {
  DEFAULT_RETENTION,
  DEFAULT_RETENTION_DAYS,
  type PageMetadata,
  type Retention,
  type UserPageIndexEntry,
} from './metadata.js';

export { MAX_FILE_COUNT, MAX_FILE_SIZE, MAX_PAGE_SIZE } from './limits.js';

export {
  META_PREFIX,
  PAGES_PREFIX,
  USERS_PREFIX,
  metaObjectKey,
  pageObjectKey,
  pagePrefix,
  pageViewPath,
  userIndexObjectKey,
} from './s3-keys.js';

export { generateSlug, isValidSlug, SLUG_PATTERN } from './slug.js';

export { type UploadPathValidationResult, validateUploadPath } from './upload-path.js';

export { type CreatePageValidationError, validateCreatePageRequest } from './validate-create.js';
