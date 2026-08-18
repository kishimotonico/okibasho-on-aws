import type { Retention } from './metadata.js';

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
  | 'not_implemented';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
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
  /** 閲覧パス（完全 URL は API 側で組み立てる） */
  viewPath: string;
  expiresAt: string | null;
  uploads: PresignedUpload[];
}
