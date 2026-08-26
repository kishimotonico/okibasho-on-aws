import type { S3Client } from '@aws-sdk/client-s3';
import { ConfigError, resolveConfig, type ResolvedConfig } from '../config.js';
import { emailFromIdToken } from '../id-token.js';
import { ensureIdToken, TokenRefreshError } from '../token-refresh.js';
import { createS3Client, listPages } from '../upload-client.js';

export interface ListDeps {
  resolveConfig: typeof resolveConfig;
  ensureIdToken: typeof ensureIdToken;
  createS3Client: (config: ResolvedConfig, idToken: string) => S3Client;
  listPages: typeof listPages;
}

export const defaultListDeps: ListDeps = {
  resolveConfig,
  ensureIdToken,
  createS3Client,
  listPages,
};

export interface ListResult {
  exitCode: number;
}

function formatUserMessage(err: unknown): string {
  if (err instanceof ConfigError || err instanceof TokenRefreshError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '予期しないエラーが発生しました。';
}

export async function runList(deps: ListDeps = defaultListDeps): Promise<ListResult> {
  let config: ResolvedConfig;
  try {
    config = await deps.resolveConfig();
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
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

  try {
    const s3 = deps.createS3Client(config, idToken);
    const pages = await deps.listPages(s3, config.bucket, email);

    if (pages.length === 0) {
      console.log('ページはありません。');
      return { exitCode: 0 };
    }

    for (const page of pages) {
      const expires = page.expiresAt ?? 'permanent';
      console.log(`${page.slug}\t${page.createdAt}\t${expires}`);
    }

    return { exitCode: 0 };
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }
}
