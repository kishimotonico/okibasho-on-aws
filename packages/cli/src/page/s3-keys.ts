export const PAGES_PREFIX = 'pages/';
export const METADATA_FILE_NAME = '.metadata.json';

export function ownerPrefix(email: string): string {
  return `${PAGES_PREFIX}${email}/`;
}

export function pagePrefix(email: string, slug: string): string {
  return `${ownerPrefix(email)}${slug}/`;
}

export function pageObjectKey(email: string, slug: string, path: string): string {
  return `${pagePrefix(email, slug)}${path}`;
}

export function metadataObjectKey(email: string, slug: string): string {
  return pageObjectKey(email, slug, METADATA_FILE_NAME);
}

/** 内部向け公開 URL のパス。メールのローカル部だけを見せる */
export function pageViewPath(userLocalPart: string, slug: string): string {
  return `/p/${userLocalPart}/${slug}/`;
}

export function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at === -1 ? email : email.slice(0, at);
}
