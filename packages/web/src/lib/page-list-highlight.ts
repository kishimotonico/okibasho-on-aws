/** 新規アップロード行をハイライトする時間。reduced-motion でも同じ長さで外す */
export const PAGE_HIGHLIGHT_MS = 3000;

/**
 * 一覧の表示順。作成日時の新しい順。同時刻は slug 昇順で決める。
 * S3 の取得順は変えない。
 */
export function sortPagesByCreatedAt<T extends { slug: string; createdAt: string }>(
  pages: readonly T[],
): T[] {
  return pages.slice().sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    if (a.slug === b.slug) {
      return 0;
    }
    return a.slug < b.slug ? -1 : 1;
  });
}
