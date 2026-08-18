/** 一覧に表示する保存期限の状態 */
export type ExpirationStatus =
  | { kind: 'permanent'; label: '無期限' }
  | { kind: 'active'; label: string; daysRemaining: number }
  | { kind: 'expired'; label: '期限切れ' };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * expiresAt から一覧表示用の期限状態を返す。
 * null は無期限、未来は残日数、過去（およびちょうど今）は期限切れ。
 */
export function getExpirationStatus(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpirationStatus {
  if (expiresAt === null) {
    return { kind: 'permanent', label: '無期限' };
  }

  const expires = new Date(expiresAt);
  const msRemaining = expires.getTime() - now.getTime();

  if (msRemaining <= 0) {
    return { kind: 'expired', label: '期限切れ' };
  }

  const daysRemaining = Math.ceil(msRemaining / MS_PER_DAY);
  return {
    kind: 'active',
    label: `あと ${daysRemaining} 日`,
    daysRemaining,
  };
}
