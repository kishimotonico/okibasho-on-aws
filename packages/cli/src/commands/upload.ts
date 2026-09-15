import { readFile } from 'node:fs/promises';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  buildViewUrl,
  contentTypeFromPath,
  createPageStore,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE,
  MAX_PAGE_SIZE,
  type Retention,
} from '@okibasho/core';
import { ConfigError, resolveConfig, type ResolvedConfig } from '../config.js';
import {
  collectFiles,
  CollectFilesError,
  SingleFileNotHtmlError,
  type CollectedFile,
} from '../collect-files.js';
import { emailFromIdToken } from '../id-token.js';
import { InvalidSlugError, resolveSlug } from '../resolve-slug.js';
import { createS3Client } from '../s3-client.js';
import { ensureIdToken, TokenRefreshError } from '../token-refresh.js';

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
}

export const defaultUploadDeps: UploadDeps = {
  resolveConfig,
  collectFiles,
  ensureIdToken,
  readFile,
  resolveSlug,
  createS3Client,
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

function printDryRun(files: CollectedFile[], slug: string, retention: Retention): void {
  console.log(`Dry run: ${files.length} file(s) would be uploaded`);
  for (const file of files) {
    console.log(`  ${file.path} (${contentTypeFromPath(file.path)})`);
  }
  console.log(`slug: ${slug}`);
  console.log(`permanent: ${retention === 'permanent'}`);
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

  const retention: Retention = options.permanent ? 'permanent' : 'temporary';

  if (options.dryRun) {
    printDryRun(collected.files, slug, retention);
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
    })),
  );

  try {
    const store = createPageStore({
      s3: deps.createS3Client(config, idToken),
      bucket: config.bucket,
      email,
    });
    console.log(`Uploading ${files.length} files...`);
    // 差し替えのとき作成日時・保存期限・共有設定を引き継ぐため、先に既存の metadata を読む
    const existing = await store.getMetadata(slug);
    await store.upload(slug, files, { retention, existing });
    console.log(buildViewUrl(config.pagesBaseUrl, email, slug));
    return { exitCode: 0 };
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }
}
