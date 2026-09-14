import {
  buildViewUrl,
  emailLocalPart,
  type PageMetadata,
  type PageShare,
  type PageStore,
  type Retention,
} from '@okibasho/core';
import { useMemo } from 'react';

import { useAuth } from '~/auth/auth-context';
import { getWebConfig } from '~/config/env';
import type { UploadFileEntry } from '~/lib/collect-upload-files';
import { listedPageFromMetadata, type ListedPage } from '~/lib/listed-page';
import { messages } from '~/lib/messages';
import { getPageStore } from '~/lib/s3-client';
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
  files: readonly UploadFileEntry[];
  retention: Retention;
  /** 差し替えのとき、作成日時と保存期限を引き継ぐための既存メタデータ */
  existing?: PageMetadata | null;
  /** 外部共有を新しく設定する場合だけ渡す。渡さなければ既存の share をそのまま引き継ぐ */
  share?: PageShare;
  onProgress?: (completed: number, total: number) => void;
}

export interface PagesApi {
  /** 書き込んだ内容から一覧の行を組み立てて返す。呼び出し側はこれで一覧の該当行を差し替えられる */
  upload: (input: UploadInput) => Promise<ListedPage>;
  remove: (slug: string) => Promise<void>;
  setRetention: (slug: string, retention: Retention) => Promise<ListedPage>;
  updateShare: (slug: string, share: PageShare | null) => Promise<ListedPage>;
  viewUrl: (slug: string) => string;
  /** 公開URLの固定部分。表示のためだけに分けて返す */
  urlOrigin: string;
  userPath: string;
}

/**
 * ページに対する変更をまとめる。
 * 認証情報と接続先、S3 の操作（PageStore）の生成、失敗の文言化、一覧の行への変換をここで閉じるので、
 * コンポーネントは auth / config / S3 を知らなくてよい。
 */
export function usePagesApi(): PagesApi {
  const { session } = useAuth();
  const config = useMemo(() => getWebConfig(), []);

  return useMemo(() => {
    const urlOrigin = config.pagesBaseUrl.replace(/\/$/, '');

    function target() {
      if (!session) {
        throw new PagesApiError(messages.loginRequired);
      }
      return { store: getPageStore(config, session), email: session.email };
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

    /** 書き込み後の metadata を一覧の行にして返す */
    function write(
      fallback: string,
      slug: string,
      action: (store: PageStore) => Promise<PageMetadata>,
    ): Promise<ListedPage> {
      return run(fallback, async () => {
        const { store, email } = target();
        const metadata = await action(store);
        return listedPageFromMetadata(email, slug, metadata, config.pagesBaseUrl);
      });
    }

    return {
      urlOrigin,
      userPath: session ? `/p/${emailLocalPart(session.email)}/` : '',

      viewUrl: (slug) => (session ? buildViewUrl(config.pagesBaseUrl, session.email, slug) : ''),

      upload: (input) =>
        write(messages.uploadFailed, input.slug, (store) =>
          store.upload(
            input.slug,
            input.files.map(({ path, file }) => ({ path, body: file })),
            {
              retention: input.retention,
              existing: input.existing ?? null,
              share: input.share,
              onProgress: input.onProgress,
            },
          ),
        ),

      remove: (slug) =>
        run(messages.removeFailed, async () => {
          await target().store.remove(slug);
        }),

      setRetention: (slug, retention) =>
        write(messages.retentionChangeFailed, slug, (store) => store.setRetention(slug, retention)),

      updateShare: (slug, share) =>
        write(messages.shareUpdateFailed, slug, (store) => store.setShare(slug, share)),
    };
  }, [config, session]);
}
