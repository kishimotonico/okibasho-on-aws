import { readFile } from 'node:fs/promises';
import {
  contentTypeFromPath,
  DEFAULT_RETENTION,
  type CreatePageRequest,
  type Retention,
  validateCreatePageRequest,
} from '@page-share/shared';
import { ConfigError, resolveConfig } from '../config.js';
import { collectFiles, CollectFilesError, SingleFileNotHtmlError } from '../collect-files.js';
import { ensureIdToken, TokenRefreshError } from '../token-refresh.js';
import { createPage, type FetchFn, uploadFilesWithConcurrency } from '../upload-client.js';

export interface UploadCommandOptions {
  path: string;
  name?: string;
  retention?: Retention;
  dryRun?: boolean;
}

export interface UploadDeps {
  fetch: FetchFn;
  resolveConfig: typeof resolveConfig;
  collectFiles: typeof collectFiles;
  ensureIdToken: typeof ensureIdToken;
  readFile: typeof readFile;
}

export const defaultUploadDeps: UploadDeps = {
  fetch: globalThis.fetch.bind(globalThis),
  resolveConfig,
  collectFiles,
  ensureIdToken,
  readFile,
};

export interface UploadResult {
  exitCode: number;
}

function formatUserMessage(err: unknown): string {
  if (
    err instanceof ConfigError ||
    err instanceof CollectFilesError ||
    err instanceof SingleFileNotHtmlError ||
    err instanceof TokenRefreshError
  ) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '予期しないエラーが発生しました。';
}

function printSkippedSummary(skippedInvalidPath: number, skippedSymlinks: number): void {
  if (skippedInvalidPath > 0) {
    console.error(`無効なパス ${skippedInvalidPath} 件をスキップしました。`);
  }
  if (skippedSymlinks > 0) {
    console.error(`シンボリックリンク ${skippedSymlinks} 件をスキップしました。`);
  }
}

function printValidationErrors(errors: Array<{ message: string }>): void {
  for (const error of errors) {
    console.error(error.message);
  }
}

function printApiError(body: {
  error: { message: string; details?: Array<{ message: string }> };
}): void {
  console.error(body.error.message);
  if (body.error.details) {
    for (const detail of body.error.details) {
      console.error(`  - ${detail.message}`);
    }
  }
}

function printDryRun(files: Array<{ path: string }>, options: UploadCommandOptions): void {
  console.log(`Dry run: ${files.length} file(s) would be uploaded`);
  for (const file of files) {
    console.log(`  ${file.path} (${contentTypeFromPath(file.path)})`);
  }
  if (options.name) {
    console.log(`slug: ${options.name}`);
  } else {
    console.log('slug: (server-generated)');
  }
  console.log(`retention: ${options.retention ?? DEFAULT_RETENTION}`);
}

export async function runUpload(
  path: string,
  options: Omit<UploadCommandOptions, 'path'> = {},
  deps: UploadDeps = defaultUploadDeps,
): Promise<UploadResult> {
  let config;
  try {
    config = await deps.resolveConfig();
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }

  let collected;
  try {
    collected = await deps.collectFiles(path);
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }

  printSkippedSummary(collected.skippedInvalidPath, collected.skippedSymlinks);

  const request: CreatePageRequest = {
    slug: options.name,
    retention: options.retention ?? DEFAULT_RETENTION,
    files: collected.files.map((file) => ({ path: file.path, size: file.size })),
  };

  const validationErrors = validateCreatePageRequest(request);
  if (validationErrors.length > 0) {
    printValidationErrors(validationErrors);
    return { exitCode: 1 };
  }

  if (options.dryRun) {
    printDryRun(collected.files, { path, ...options });
    return { exitCode: 0 };
  }

  let idToken: string;
  try {
    idToken = await deps.ensureIdToken(config);
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }

  const createResult = await createPage(deps.fetch, config.apiUrl, idToken, request);
  if (!createResult.ok) {
    printApiError(createResult.body);
    return { exitCode: 1 };
  }

  const { body } = createResult;
  console.log(`Uploading ${body.uploads.length} files...`);

  const failure = await uploadFilesWithConcurrency(
    deps.fetch,
    body.uploads.map((upload) => {
      const localFile = collected.files.find((file) => file.path === upload.path);
      if (!localFile) {
        throw new Error(`アップロード対象に含まれないパスが API から返されました: ${upload.path}`);
      }
      return {
        path: upload.path,
        url: upload.url,
        headers: upload.headers,
        readBody: () => deps.readFile(localFile.absolutePath),
      };
    }),
  );

  if (failure) {
    console.error(
      `アップロードに失敗しました: ${failure.path} (HTTP ${failure.error.status} ${failure.error.statusText})`,
    );
    console.error(
      'もう一度同じコマンドを実行しても、slug は既に確保されているため別の名前 (--name) が必要です。',
    );
    return { exitCode: 1 };
  }

  console.log(body.viewUrl);
  return { exitCode: 0 };
}
