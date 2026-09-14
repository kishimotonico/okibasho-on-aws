import { emailLocalPart, type PageMetadata, type PageShare } from '@cli/page';
import { useMemo } from 'react';

import { useAuth } from '~/auth/auth-context';
import {
  buildViewUrl,
  deletePage,
  updatePageRetention,
  updatePageShare,
  uploadPage,
  type Retention,
  type UploadFileInput,
} from '~/api/pages';
import { getWebConfig } from '~/config/env';
import { messages } from '~/lib/messages';
import { getPagesS3Client } from '~/lib/s3-client';
import { toUserMessage } from '~/lib/to-user-message';

/** message はそのまま画面に出せる日本語。生のエラーは入れない */
export class PagesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PagesApiError';
  }
}

/** catch した値を画面用の文言にする。API 層を通っていない想定外のエラーは汎用の文言にする */
export function userMessage(error: unknown): string {
  return error instanceof PagesApiError ? error.message : messages.uploadFailed;
}

export interface UploadInput {
  slug: string;
  files: readonly UploadFileInput[];
  retention: Retention;
  /** 差し替えのとき、作成日時と保存期限を引き継ぐための既存メタデータ */
  existing?: PageMetadata | null;
  /** 外部共有を新しく設定する場合だけ渡す。渡さなければ既存の share をそのまま引き継ぐ */
  share?: PageShare;
  onProgress?: (completed: number, total: number) => void;
}

export interface PagesApi {
  upload: (input: UploadInput) => Promise<{ slug: string; viewUrl: string }>;
  remove: (slug: string) => Promise<void>;
  setRetention: (slug: string, retention: Retention) => Promise<void>;
  updateShare: (slug: string, share: PageShare | null) => Promise<void>;
  viewUrl: (slug: string) => string;
  /** 公開URLの固定部分。表示のためだけに分けて返す */
  urlOrigin: string;
  userPath: string;
}

/**
 * ページに対する変更をまとめる。
 * 認証情報と接続先、S3 クライアントの生成、失敗の文言化をここで閉じるので、
 * コンポーネントは auth / config / S3Client を知らなくてよい。
 */
export function usePagesApi(): PagesApi {
  const { session } = useAuth();
  const config = useMemo(() => getWebConfig(), []);

  return useMemo(() => {
    const urlOrigin = config.pagesBaseUrl.replace(/\/$/, '');

    function client() {
      if (!session) {
        throw new PagesApiError(messages.loginRequired);
      }
      return { s3: getPagesS3Client(config, session.idToken), email: session.email };
    }

    async function run<T>(fallback: string, action: () => Promise<T>): Promise<T> {
      try {
        return await action();
      } catch (error) {
        throw error instanceof PagesApiError
          ? error
          : new PagesApiError(toUserMessage(error, fallback));
      }
    }

    return {
      urlOrigin,
      userPath: session ? `/p/${emailLocalPart(session.email)}/` : '',

      viewUrl: (slug) => (session ? buildViewUrl(config.pagesBaseUrl, session.email, slug) : ''),

      upload: (input) =>
        run(messages.uploadFailed, async () => {
          const { s3, email } = client();
          await uploadPage(
            s3,
            config.pagesBucket,
            email,
            input.slug,
            input.files,
            {
              retention: input.retention,
              existingMetadata: input.existing ?? null,
              share: input.share,
            },
            input.onProgress,
          );
          return {
            slug: input.slug,
            viewUrl: buildViewUrl(config.pagesBaseUrl, email, input.slug),
          };
        }),

      remove: (slug) =>
        run(messages.removeFailed, async () => {
          const { s3, email } = client();
          await deletePage(s3, config.pagesBucket, email, slug);
        }),

      setRetention: (slug, retention) =>
        run(messages.retentionChangeFailed, async () => {
          const { s3, email } = client();
          await updatePageRetention(s3, config.pagesBucket, email, slug, retention);
        }),

      updateShare: (slug, share) =>
        run(messages.shareUpdateFailed, async () => {
          const { s3, email } = client();
          await updatePageShare(s3, config.pagesBucket, email, slug, share);
        }),
    };
  }, [config, session]);
}
