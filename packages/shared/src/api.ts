import type { PageMetadata, Retention, Visibility } from './metadata.js';

/** API エラーコード。文字列リテラル union でクライアントとサーバーが同じ語彙を使う */
export type ApiErrorCode =
  | 'invalid_slug'
  | 'invalid_title'
  | 'invalid_visibility'
  | 'invalid_version_id'
  | 'files_required'
  | 'too_many_files'
  | 'invalid_path'
  | 'duplicate_path'
  | 'invalid_file_size'
  | 'file_too_large'
  | 'page_size_exceeded'
  | 'missing_index_html'
  | 'incomplete_upload'
  | 'not_implemented'
  | 'invalid_json'
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'page_not_found'
  | 'internal_error'
  | 'method_not_allowed';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** 検証エラーなど複数件あるときは全件を入れる。code / message は先頭のもの */
  details?: ApiErrorBody[];
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface DeclaredFile {
  path: string;
  size: number;
}

/** POST /api/pages のリクエスト。slug は指定できない */
export interface CreatePageRequest {
  title?: string;
  visibility?: Visibility;
  retention?: Retention;
  files: DeclaredFile[];
}

export interface PresignedUpload {
  path: string;
  url: string;
  /** presigned PUT の署名対象。Content-Length を含め S3 側でサイズを固定する */
  headers: Record<string, string>;
}

/** POST /api/pages のレスポンス。宣言時点では version はまだ加算しない */
export interface CreatePageResponse {
  slug: string;
  versionId: string;
  viewUrl: string;
  uploads: PresignedUpload[];
}

/** PUT /api/pages/{slug} のリクエスト（再アップロードの宣言） */
export interface RedeclarePageRequest {
  files: DeclaredFile[];
}

export interface RedeclarePageResponse {
  slug: string;
  versionId: string;
  viewUrl: string;
  uploads: PresignedUpload[];
}

/** POST /api/pages/{slug}/complete のリクエスト */
export interface CompletePageRequest {
  versionId: string;
  files: DeclaredFile[];
  /** 新規 complete で metadata に書く。再アップロードでは無視する */
  title?: string;
}

export interface CompletePageResponse {
  slug: string;
  version: number;
  activeVersionId: string;
  viewUrl: string;
  expiresAt: string | null;
}

/** GET /api/pages の各要素。expiresAt は計算値 */
export interface ListPageItem
  extends Pick<
    PageMetadata,
    | 'slug'
    | 'title'
    | 'visibility'
    | 'version'
    | 'retention'
    | 'createdAt'
    | 'contentUpdatedAt'
    | 'fileCount'
    | 'totalSize'
  > {
  viewUrl: string;
  expiresAt: string | null;
}

/** GET /api/pages のレスポンス */
export interface ListPagesResponse {
  pages: ListPageItem[];
}

/** GET /api/pages/{slug} のレスポンス */
export interface GetPageResponse extends PageMetadata {
  viewUrl: string;
  expiresAt: string | null;
}

/** PATCH /api/pages/{slug}。visibility は変更できない */
export interface PatchPageRequest {
  retention?: Retention;
  title?: string;
}
