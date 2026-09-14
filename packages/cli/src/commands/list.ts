import type { S3Client } from '@aws-sdk/client-s3';
import { createPageStore } from '@okibasho/core';
import { ConfigError, resolveConfig, type ResolvedConfig } from '../config.js';
import { emailFromIdToken } from '../id-token.js';
import { createS3Client } from '../s3-client.js';
import { ensureIdToken, TokenRefreshError } from '../token-refresh.js';

export interface ListDeps {
  resolveConfig: typeof resolveConfig;
  ensureIdToken: typeof ensureIdToken;
  createS3Client: (config: ResolvedConfig, idToken: string) => S3Client;
}

export const defaultListDeps: ListDeps = {
  resolveConfig,
  ensureIdToken,
  createS3Client,
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
    const store = createPageStore({
      s3: deps.createS3Client(config, idToken),
      bucket: config.bucket,
      email,
    });
    const pages = await store.list();
    pages.sort((a, b) => a.slug.localeCompare(b.slug));

    if (pages.length === 0) {
      console.log('ページはありません。');
      return { exitCode: 0 };
    }

    for (const { slug, metadata } of pages) {
      const expires = metadata.expiresAt ?? 'permanent';
      console.log(`${slug}\t${metadata.createdAt}\t${expires}`);
    }

    return { exitCode: 0 };
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }
}
