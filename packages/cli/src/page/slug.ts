/** ユーザー指定 slug。ユーザー単位で一意。S3 キーと URL パスに載る */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
