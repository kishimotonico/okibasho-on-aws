/**
 * CLI / Web / API から共通で参照する型と定数の置き場。
 *
 * 同じルールが3箇所にコピーされるのを防ぐために用意している。
 */

export type {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorResponse,
  CompletePageRequest,
  CompletePageResponse,
  CreatePageRequest,
  CreatePageResponse,
  DeclaredFile,
  GetPageResponse,
  ListPageItem,
  ListPagesResponse,
  PatchPageRequest,
  PresignedUpload,
  RedeclarePageRequest,
  RedeclarePageResponse,
} from './api.js';

export { contentTypeFromPath } from './content-type.js';

export {
  DEFAULT_RETENTION,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_VISIBILITY,
  TITLE_MAX_LENGTH,
  type PageMetadata,
  type Retention,
  type UserPageIndexEntry,
  type Visibility,
} from './metadata.js';

export { computeExpiresAt, expiresAtEpochSeconds } from './expires.js';

export {
  kvsKey,
  parsePageAliasValue,
  serializePageAliasValue,
  type PageAliasValue,
} from './kvs.js';

export { MAX_FILE_COUNT, MAX_FILE_SIZE, MAX_PAGE_SIZE } from './limits.js';

export {
  INTERNAL_PAGES_PREFIX,
  META_PREFIX,
  SHARED_PAGES_PREFIX,
  USERS_PREFIX,
  metaObjectKey,
  pageObjectKey,
  pagePrefix,
  pagesPrefix,
  pageViewPath,
  userIndexObjectKey,
  versionPrefix,
} from './s3-keys.js';

export {
  generateId,
  generateSlug,
  generateVersionId,
  ID_LENGTH,
  ID_PATTERN,
  isValidId,
  isValidSlug,
  isValidVersionId,
  SLUG_PATTERN,
} from './slug.js';

export { validateTitle } from './title.js';

export { type UploadPathValidationResult, validateUploadPath } from './upload-path.js';

export {
  type CreatePageValidationError,
  validateCreatePageRequest,
  validateDeclaredFiles,
} from './validate-create.js';
