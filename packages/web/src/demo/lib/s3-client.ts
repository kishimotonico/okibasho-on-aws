import {
  buildUploadMetadata,
  generateRandomSlug,
  generateShareId,
  generateSharePassword,
  withRetention,
  withShare,
  type PageMetadata,
  type PageStore,
} from '@okibasho/core';

/** 本物（~/lib/s3-client）と同じ export を、同じ型で用意する */
type S3ClientModule = typeof import('~/lib/s3-client');

/** 進捗表示が見えるよう、ファイル 1 件ごとに少し待つ */
const PUT_DELAY_MS = 150;

type DemoPages = Record<string, PageMetadata>;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** 一覧へ出す見本のページ。実際の一覧と同じく、名前を付けずに上げた乱数 slug を混ぜる */
function seedPages(now: Date): DemoPages {
  return {
    [generateRandomSlug()]: buildUploadMetadata(null, { retention: 'temporary' }, now),
    'yabai-incident-report': buildUploadMetadata(
      null,
      { retention: 'temporary', share: { id: generateShareId() } },
      daysAgo(now, 1),
    ),
    '2026-09-sales-report': buildUploadMetadata(null, { retention: 'permanent' }, daysAgo(now, 9)),
    'ui-mock-final-v2-honto-ni-final': buildUploadMetadata(
      null,
      {
        retention: 'permanent',
        share: { id: generateShareId(), password: generateSharePassword() },
      },
      daysAgo(now, 16),
    ),
    [generateRandomSlug()]: buildUploadMetadata(null, { retention: 'temporary' }, daysAgo(now, 28)),
  };
}

let pages: DemoPages = seedPages(new Date());

function updateMetadata(
  slug: string,
  update: (existing: PageMetadata) => PageMetadata,
): PageMetadata {
  const existing = pages[slug];
  if (!existing) {
    throw new Error(`ページが見つかりません: ${slug}`);
  }
  const metadata = update(existing);
  pages = { ...pages, [slug]: metadata };
  return metadata;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ページ成果物は配信先が無いので保存せず、metadata だけをメモリに持つ */
const demoPageStore: PageStore = {
  async list() {
    return Object.entries(pages).map(([slug, metadata]) => ({
      slug,
      metadata,
      etag: JSON.stringify(metadata),
    }));
  },

  async getMetadata(slug) {
    return pages[slug] ?? null;
  },

  async upload(slug, files, options) {
    const metadata = buildUploadMetadata(options.existing, options, new Date());
    pages = { ...pages, [slug]: metadata };
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
    const { [slug]: _removed, ...rest } = pages;
    pages = rest;
  },
};

export const preloadPagesSdk: S3ClientModule['preloadPagesSdk'] = () => {};

export const pagesPreconnectUrls: S3ClientModule['pagesPreconnectUrls'] = () => [];

export const getPageStore: S3ClientModule['getPageStore'] = async () => demoPageStore;
