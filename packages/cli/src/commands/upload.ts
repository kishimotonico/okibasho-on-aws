import { readFile } from 'node:fs/promises';
import type { S3Client } from '@aws-sdk/client-s3';
import { ConfigError, resolveConfig, type ResolvedConfig } from '../config.js';
import {
  collectFiles,
  CollectFilesError,
  SingleFileNotHtmlError,
  type CollectedFile,
} from '../collect-files.js';
import { emailFromIdToken } from '../id-token.js';
import {
  contentTypeFromPath,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE,
  MAX_PAGE_SIZE,
} from '../page/index.js';
import { InvalidSlugError, resolveSlug } from '../resolve-slug.js';
import { ensureIdToken, TokenRefreshError } from '../token-refresh.js';
import { createS3Client, uploadPage } from '../upload-client.js';

export interface UploadCommandOptions {
  name?: string;
  permanent?: boolean;
  dryRun?: boolean;
}

export interface UploadDeps {
  resolveConfig: typeof resolveConfig;
  collectFiles: typeof collectFiles;
  ensureIdToken: typeof ensureIdToken;
  readFile: typeof readFile;
  resolveSlug: typeof resolveSlug;
  createS3Client: (config: ResolvedConfig, idToken: string) => S3Client;
  uploadPage: typeof uploadPage;
}

export const defaultUploadDeps: UploadDeps = {
  resolveConfig,
  collectFiles,
  ensureIdToken,
  readFile,
  resolveSlug,
  createS3Client,
  uploadPage,
};

export interface UploadResult {
  exitCode: number;
}

function formatUserMessage(err: unknown): string {
  if (
    err instanceof ConfigError ||
    err instanceof CollectFilesError ||
    err instanceof SingleFileNotHtmlError ||
    err instanceof TokenRefreshError ||
    err instanceof InvalidSlugError
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

function validateUploadFiles(files: CollectedFile[]): string[] {
  const errors: string[] = [];

  if (!files.some((file) => file.path === 'index.html')) {
    errors.push('index.html が必要です。');
  }

  if (files.length > MAX_FILE_COUNT) {
    errors.push(`ファイル数が上限 (${MAX_FILE_COUNT}) を超えています: ${files.length}`);
  }

  let totalSize = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`ファイルサイズが上限 (${MAX_FILE_SIZE} bytes) を超えています: ${file.path}`);
    }
    totalSize += file.size;
  }

  if (totalSize > MAX_PAGE_SIZE) {
    errors.push(`ページ全体のサイズが上限 (${MAX_PAGE_SIZE} bytes) を超えています。`);
  }

  return errors;
}

function printDryRun(files: CollectedFile[], slug: string, permanent: boolean): void {
  console.log(`Dry run: ${files.length} file(s) would be uploaded`);
  for (const file of files) {
    console.log(`  ${file.path} (${contentTypeFromPath(file.path)})`);
  }
  console.log(`slug: ${slug}`);
  console.log(`permanent: ${permanent}`);
}

export async function runUpload(
  path: string,
  options: UploadCommandOptions = {},
  deps: UploadDeps = defaultUploadDeps,
): Promise<UploadResult> {
  let config: ResolvedConfig;
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

  let slug: string;
  try {
    slug = await deps.resolveSlug(path, options.name);
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }

  const validationErrors = validateUploadFiles(collected.files);
  if (validationErrors.length > 0) {
    for (const message of validationErrors) {
      console.error(message);
    }
    return { exitCode: 1 };
  }

  const permanent = options.permanent === true;

  if (options.dryRun) {
    printDryRun(collected.files, slug, permanent);
    return { exitCode: 0 };
  }

  let idToken: string;
  try {
    idToken = await deps.ensureIdToken(config);
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }

  let email: string;
  try {
    email = emailFromIdToken(idToken);
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }

  const files = await Promise.all(
    collected.files.map(async (file) => ({
      path: file.path,
      body: await deps.readFile(file.absolutePath),
      contentType: contentTypeFromPath(file.path),
    })),
  );

  try {
    const s3 = deps.createS3Client(config, idToken);
    console.log(`Uploading ${files.length} files...`);
    const result = await deps.uploadPage(s3, config.bucket, config.pagesBaseUrl, {
      email,
      slug,
      files,
      permanent,
    });
    console.log(result.viewUrl);
    return { exitCode: 0 };
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }
}
