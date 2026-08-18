/** pages Distribution から配信されるオブジェクトの prefix */
export const PAGES_PREFIX = 'pages/';

/** metadata 正本の prefix */
export const META_PREFIX = 'meta/';

/** 所有関係マーカーの prefix */
export const USERS_PREFIX = 'users/';

/** 配信対象オブジェクトの S3 key: pages/<slug>/<path> */
export function pageObjectKey(slug: string, path: string): string {
  return `${PAGES_PREFIX}${slug}/${path}`;
}

/** ページ配下の prefix（ListObjectsV2 や削除で使う） */
export function pagePrefix(slug: string): string {
  return `${PAGES_PREFIX}${slug}/`;
}

/** metadata 正本: meta/<slug>.json */
export function metaObjectKey(slug: string): string {
  return `${META_PREFIX}${slug}.json`;
}

/** 所有関係マーカー: users/<sub>/<slug>.json */
export function userIndexObjectKey(ownerSub: string, slug: string): string {
  return `${USERS_PREFIX}${ownerSub}/${slug}.json`;
}

/** 閲覧URLのパス。pages Distributionが配信するURL空間は /p/ だけ */
export function pageViewPath(slug: string): string {
  return `/p/${slug}/`;
}
