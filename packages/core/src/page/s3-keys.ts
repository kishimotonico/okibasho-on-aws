export const PAGES_PREFIX = 'pages/';
/** metadata の正本を置く prefix。ページ成果物(pages/)とは別の名前空間にする */
export const META_PREFIX = 'meta/';

export function ownerPrefix(email: string): string {
  return `${PAGES_PREFIX}${email}/`;
}

export function pagePrefix(email: string, slug: string): string {
  return `${ownerPrefix(email)}${slug}/`;
}

export function pageObjectKey(email: string, slug: string, path: string): string {
  return `${pagePrefix(email, slug)}${path}`;
}

export function metaOwnerPrefix(email: string): string {
  return `${META_PREFIX}${email}/`;
}

export function metadataObjectKey(email: string, slug: string): string {
  return `${metaOwnerPrefix(email)}${slug}.json`;
}

/** metadata の S3 キーから slug を取り出す。email 配下のキーでなければ null */
export function slugFromMetadataKey(email: string, key: string): string | null {
  const prefix = metaOwnerPrefix(email);
  const suffix = '.json';
  if (!key.startsWith(prefix) || !key.endsWith(suffix)) {
    return null;
  }
  const slug = key.slice(prefix.length, key.length - suffix.length);
  return slug.length > 0 ? slug : null;
}

/** 内部向け公開 URL のパス。メールのローカル部だけを見せる */
export function pageViewPath(userLocalPart: string, slug: string): string {
  return `/p/${userLocalPart}/${slug}/`;
}

export function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at === -1 ? email : email.slice(0, at);
}

/** 内部向け公開 URL。pagesBaseUrl の末尾 `/` の有無は問わない */
export function buildViewUrl(pagesBaseUrl: string, email: string, slug: string): string {
  const base = pagesBaseUrl.replace(/\/$/, '');
  return `${base}${pageViewPath(emailLocalPart(email), slug)}`;
}
