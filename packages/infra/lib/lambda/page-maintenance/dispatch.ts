export interface S3EventRecordLike {
  s3?: { object?: { key?: string } };
}

/**
 * イベントがS3イベント通知かどうかを判定し、そうならレコード配列を返す(そうでなければnull)。
 * EventBridgeのスケジュールイベントにはRecordsが無いため、これで trigger=s3 / trigger=schedule を
 * 判定する。環境変数に依存しない純粋関数として index.ts から切り出している(テストしやすくするため)
 */
export function extractS3Records(event: unknown): S3EventRecordLike[] | null {
  if (typeof event !== 'object' || event === null || !('Records' in event)) {
    return null;
  }
  const records = (event as { Records?: unknown }).Records;
  if (!Array.isArray(records)) {
    return null;
  }
  const isS3Records = records.every(
    (record) => typeof record === 'object' && record !== null && 's3' in record,
  );
  return isS3Records ? (records as S3EventRecordLike[]) : null;
}
