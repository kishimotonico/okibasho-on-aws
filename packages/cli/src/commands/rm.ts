import type { S3Client } from '@aws-sdk/client-s3';
import { ConfigError, resolveConfig, type ResolvedConfig } from '../config.js';
import { emailFromIdToken } from '../id-token.js';
import { isValidSlug } from '../page/slug.js';
import { ensureIdToken, TokenRefreshError } from '../token-refresh.js';
import { createS3Client, removePage } from '../upload-client.js';

export interface RmDeps {
  resolveConfig: typeof resolveConfig;
  ensureIdToken: typeof ensureIdToken;
  createS3Client: (config: ResolvedConfig, idToken: string) => S3Client;
  removePage: typeof removePage;
}

export const defaultRmDeps: RmDeps = {
  resolveConfig,
  ensureIdToken,
  createS3Client,
  removePage,
};

export interface RmResult {
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

export async function runRm(slug: string, deps: RmDeps = defaultRmDeps): Promise<RmResult> {
  if (!isValidSlug(slug)) {
    console.error(`無効な slug です: ${slug}`);
    return { exitCode: 1 };
  }

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
    await deps.removePage(s3, config.bucket, email, slug);
    console.log(`削除しました: ${slug}`);
    return { exitCode: 0 };
  } catch (err) {
    console.error(formatUserMessage(err));
    return { exitCode: 1 };
  }
}
