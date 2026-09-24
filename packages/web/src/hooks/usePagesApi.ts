import {
  buildViewUrl,
  emailLocalPart,
  type PageMetadata,
  type PageShare,
  type PageStore,
  type Retention,
} from '@okibasho/core';
import { useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';

import { NotSignedInError } from '~/auth/session';
import { getWebConfig, type WebConfig } from '~/config/env';
import type { UploadFileEntry } from '~/lib/collect-upload-files';
import { listedPageFromMetadata, listPages, type ListedPage } from '~/lib/listed-page';
import { messages } from '~/lib/messages';
import { sortPagesByCreatedAt } from '~/lib/page-list-highlight';
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
  /** 一覧（作成日時の新しい順）。previous を渡すと差分取得（ETag が同じ slug は取り直さない）の材料にする */
  list: (previous?: readonly ListedPage[]) => Promise<ListedPage[]>;
  /** 1 件だけ metadata を読んで一覧の行にする。無ければ null */
  find: (slug: string) => Promise<ListedPage | null>;
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
 * ページに対する変更をまとめる。呼び出し側は config / S3 を知らなくてよい。
 * React に依存しないので、route の loader とコンポーネントの両方から同じ実装を使える。
 * email は _authed のゲートを通った後にしか呼ばれないので必ずある前提でよい
 */
export function createPagesApi(config: WebConfig, email: string): PagesApi {
  const urlOrigin = config.pagesBaseUrl.replace(/\/$/, '');

  async function run<T>(fallback: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof NotSignedInError) {
        throw new PagesApiError(messages.loginRequired);
      }
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
      const store = await getPageStore(config, email);
      const metadata = await action(store);
      return listedPageFromMetadata(email, slug, metadata, config.pagesBaseUrl);
    });
  }

  return {
    urlOrigin,
    userPath: `/p/${emailLocalPart(email)}/`,

    viewUrl: (slug) => buildViewUrl(config.pagesBaseUrl, email, slug),

    list: (previous) =>
      run(messages.listLoadFailed, async () => {
        const store = await getPageStore(config, email);
        const pages = await listPages(store, email, config.pagesBaseUrl, previous);
        return sortPagesByCreatedAt(pages);
      }),

    find: (slug) =>
      run(messages.listLoadFailed, async () => {
        const store = await getPageStore(config, email);
        const metadata = await store.getMetadata(slug);
        return metadata ? listedPageFromMetadata(email, slug, metadata, config.pagesBaseUrl) : null;
      }),

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
        const store = await getPageStore(config, email);
        await store.remove(slug);
      }),

    setRetention: (slug, retention) =>
      write(messages.retentionChangeFailed, slug, (store) => store.setRetention(slug, retention)),

    updateShare: (slug, share) =>
      write(messages.shareUpdateFailed, slug, (store) => store.setShare(slug, share)),
  };
}

/** 薄いラッパー。email は _authed の route context から、接続先は env から拾って createPagesApi に渡す */
export function usePagesApi(): PagesApi {
  const { email } = useRouteContext({ from: '/_authed' });
  const config = useMemo(() => getWebConfig(), []);
  return useMemo(() => createPagesApi(config, email), [config, email]);
}
