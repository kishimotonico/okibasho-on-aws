/** ISO 8601 日時を日本語で読みやすい形式にする */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
