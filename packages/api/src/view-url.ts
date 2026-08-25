import type { Visibility } from '@page-share/shared';
import { pageViewPath } from '@page-share/shared';

/** visibility に応じた閲覧用 URL を組み立てる */
export function buildViewUrl(
  pagesBaseUrl: string,
  shareBaseUrl: string,
  visibility: Visibility,
  slug: string,
): string {
  const baseUrl = visibility === 'shared' ? shareBaseUrl : pagesBaseUrl;
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${pageViewPath(slug)}`;
}
