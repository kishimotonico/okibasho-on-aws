const UNITS = ['B', 'KB', 'MB', 'GB'] as const;
const BASE = 1024;

/** バイト数を KB / MB などの単位付き文字列に変換する */
export function formatBytes(bytes: number): string {
  if (bytes < 0) {
    throw new RangeError('bytes は 0 以上である必要があります');
  }

  if (bytes === 0) {
    return '0 B';
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= BASE && unitIndex < UNITS.length - 1) {
    value /= BASE;
    unitIndex++;
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} ${UNITS[unitIndex]}`;
  }

  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted} ${UNITS[unitIndex]}`;
}
