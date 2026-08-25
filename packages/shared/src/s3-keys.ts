import type { Visibility } from './metadata.js';

/** 社内限定ページの配信対象 prefix */
export const INTERNAL_PAGES_PREFIX = 'internal-pages/';

/** URL共有ページの配信対象 prefix */
export const SHARED_PAGES_PREFIX = 'shared-pages/';

/** metadata 正本の prefix */
export const META_PREFIX = 'meta/';

/** 所有関係マーカーの prefix */
export const USERS_PREFIX = 'users/';

export function pagesPrefix(visibility: Visibility): string {
  return visibility === 'internal' ? INTERNAL_PAGES_PREFIX : SHARED_PAGES_PREFIX;
}

/** 配信対象オブジェクトの S3 key: <prefix>/<slug>/<versionId>/<path> */
export function pageObjectKey(
  visibility: Visibility,
  slug: string,
  versionId: string,
  path: string,
): string {
  return `${pagesPrefix(visibility)}${slug}/${versionId}/${path}`;
}

/** 1バージョン配下の prefix */
export function versionPrefix(visibility: Visibility, slug: string, versionId: string): string {
  return `${pagesPrefix(visibility)}${slug}/${versionId}/`;
}

/** ページ配下（全バージョン）の prefix。ListObjectsV2 や削除で使う */
export function pagePrefix(visibility: Visibility, slug: string): string {
  return `${pagesPrefix(visibility)}${slug}/`;
}

/** metadata 正本: meta/<slug>.json */
export function metaObjectKey(slug: string): string {
  return `${META_PREFIX}${slug}.json`;
}

/** 所有関係マーカー: users/<sub>/<slug>.json */
export function userIndexObjectKey(ownerSub: string, slug: string): string {
  return `${USERS_PREFIX}${ownerSub}/${slug}.json`;
}

/** 閲覧URLのパス。origin が公開範囲を表すのでパスは slug だけ */
export function pageViewPath(slug: string): string {
  return `/${slug}/`;
}
