import { pageViewPath } from '@page-share/shared';

/** PAGES_BASE_URL と slug から閲覧用の完全 URL を組み立てる */
export function buildViewUrl(pagesBaseUrl: string, slug: string): string {
  const base = pagesBaseUrl.endsWith('/') ? pagesBaseUrl.slice(0, -1) : pagesBaseUrl;
  return `${base}${pageViewPath(slug)}`;
}
