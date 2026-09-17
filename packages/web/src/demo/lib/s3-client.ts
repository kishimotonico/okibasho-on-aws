import {
  buildUploadMetadata,
  generateShareId,
  generateSharePassword,
  withRetention,
  withShare,
  type PageMetadata,
  type PageStore,
} from '@okibasho/core';

/** 本物（~/lib/s3-client）と同じ export を、同じ型で用意する */
type S3ClientModule = typeof import('~/lib/s3-client');

const STORAGE_KEY = 'okibasho:demo-pages';
/** 進捗表示が見えるよう、ファイル 1 件ごとに少し待つ */
const PUT_DELAY_MS = 150;

type DemoPages = Record<string, PageMetadata>;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** 初回訪問時に一覧へ出す見本のページ */
function seedPages(now: Date): DemoPages {
  return {
    'q3-report': buildUploadMetadata(null, { retention: 'temporary' }, daysAgo(now, 2)),
    'ui-mock': buildUploadMetadata(
      null,
      {
        retention: 'permanent',
        share: { id: generateShareId(), password: generateSharePassword() },
      },
      daysAgo(now, 9),
    ),
    'onboarding-guide': buildUploadMetadata(null, { retention: 'temporary' }, daysAgo(now, 20)),
  };
}

function readPages(): DemoPages {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    return JSON.parse(raw);
  }
  const seeded = seedPages(new Date());
  writePages(seeded);
  return seeded;
}

function writePages(pages: DemoPages): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
}

/** 次に開いたとき見本のページからやり直す */
export function clearDemoPages(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

function updateMetadata(
  slug: string,
  update: (existing: PageMetadata) => PageMetadata,
): PageMetadata {
  const pages = readPages();
  const existing = pages[slug];
  if (!existing) {
    throw new Error(`ページが見つかりません: ${slug}`);
  }
  const metadata = update(existing);
  writePages({ ...pages, [slug]: metadata });
  return metadata;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ページ成果物は配信先が無いので保存せず、metadata だけを localStorage に持つ */
const demoPageStore: PageStore = {
  async list() {
    return Object.entries(readPages()).map(([slug, metadata]) => ({
      slug,
      metadata,
      etag: JSON.stringify(metadata),
    }));
  },

  async getMetadata(slug) {
    return readPages()[slug] ?? null;
  },

  async upload(slug, files, options) {
    const metadata = buildUploadMetadata(options.existing, options, new Date());
    writePages({ ...readPages(), [slug]: metadata });
    for (let completed = 1; completed <= files.length; completed++) {
      await sleep(PUT_DELAY_MS);
      options.onProgress?.(completed, files.length);
    }
    return metadata;
  },

  async setRetention(slug, retention) {
    return updateMetadata(slug, (existing) => withRetention(existing, retention));
  },

  async setShare(slug, share) {
    return updateMetadata(slug, (existing) => withShare(existing, share));
  },

  async remove(slug) {
    const { [slug]: _removed, ...rest } = readPages();
    writePages(rest);
  },
};

export const preloadPagesSdk: S3ClientModule['preloadPagesSdk'] = () => {};

export const pagesPreconnectUrls: S3ClientModule['pagesPreconnectUrls'] = () => [];

export const getPageStore: S3ClientModule['getPageStore'] = async () => demoPageStore;
