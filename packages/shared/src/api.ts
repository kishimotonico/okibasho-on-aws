import type { PageMetadata, Retention } from './metadata.js';

/** API エラーコード。文字列リテラル union でクライアントとサーバーが同じ語彙を使う */
export type ApiErrorCode =
  | 'invalid_slug'
  | 'files_required'
  | 'too_many_files'
  | 'invalid_path'
  | 'duplicate_path'
  | 'invalid_file_size'
  | 'file_too_large'
  | 'page_size_exceeded'
  | 'missing_index_html'
  | 'not_implemented'
  | 'slug_taken'
  | 'invalid_json'
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'page_not_found'
  | 'page_expired'
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

/** POST /api/pages のリクエスト（ファイル本体は含めず、これから上げる分を宣言する） */
export interface CreatePageRequest {
  slug?: string;
  retention?: Retention;
  files: DeclaredFile[];
}

export interface PresignedUpload {
  path: string;
  url: string;
  /** presigned PUT の署名対象。Content-Length を含め S3 側でサイズを固定する */
  headers: Record<string, string>;
}

/** POST /api/pages のレスポンス */
export interface CreatePageResponse {
  slug: string;
  /** 閲覧用の完全 URL（PAGES_BASE_URL は API だけが知っている） */
  viewUrl: string;
  expiresAt: string | null;
  uploads: PresignedUpload[];
}

/** GET /api/pages の各要素。metadata の可変項目と viewUrl */
export interface ListPageItem extends Pick<
  PageMetadata,
  'slug' | 'retention' | 'createdAt' | 'expiresAt' | 'fileCount' | 'totalSize'
> {
  viewUrl: string;
}

/** GET /api/pages のレスポンス */
export interface ListPagesResponse {
  pages: ListPageItem[];
}

/** GET /api/pages/{slug} のレスポンス */
export interface GetPageResponse extends PageMetadata {
  viewUrl: string;
}
