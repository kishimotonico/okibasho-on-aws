import { messages } from '~/lib/messages';

/** 一覧に表示する保存期限の状態 */
export type ExpirationStatus =
  | { kind: 'permanent'; label: '無期限' }
  | { kind: 'active'; label: string; daysRemaining: number; expiresAt: string }
  | { kind: 'expired'; label: string; expiresAt: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const JST = 'Asia/Tokyo';

function formatJstDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(iso));

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}/${month}/${day}`;
}

function formatJstDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

/**
 * expiresAt から一覧表示用の期限状態を返す。
 * null は無期限。未来は日本時間の絶対日時と残日数、過去は期限切れ日付。
 */
export function getExpirationStatus(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpirationStatus {
  if (expiresAt === null) {
    return { kind: 'permanent', label: messages.retentionPermanentOption };
  }

  const expires = new Date(expiresAt);
  const msRemaining = expires.getTime() - now.getTime();

  if (msRemaining <= 0) {
    return {
      kind: 'expired',
      label: messages.expiredLabel(formatJstDate(expiresAt)),
      expiresAt,
    };
  }

  const daysRemaining = Math.ceil(msRemaining / MS_PER_DAY);
  return {
    kind: 'active',
    label: messages.activeUntilLabel(formatJstDateTime(expiresAt), daysRemaining),
    daysRemaining,
    expiresAt,
  };
}
