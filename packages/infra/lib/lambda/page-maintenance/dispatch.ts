export interface S3EventRecordLike {
  s3?: { object?: { key?: string } };
}

/** スケジュールから起動するとき、EventBridge の Rule が input で渡すタスク */
export type ScheduledTask = 'cleanup' | 'reconcile';

/** handler が受け取りうるイベント */
export type MaintenanceEvent =
  { kind: 's3'; records: S3EventRecordLike[] } | { kind: ScheduledTask };

/**
 * イベントの出どころを判別する。S3イベント通知には Records があり、スケジュールの
 * 2本の Rule はそれぞれ input で task を渡してくる。環境変数に依存しない純粋関数として
 * index.ts から切り出している(テストしやすくするため)
 */
export function classifyEvent(event: unknown): MaintenanceEvent {
  const records = extractS3Records(event);
  if (records) {
    return { kind: 's3', records };
  }

  const task = extractScheduledTask(event);
  if (task) {
    return { kind: task };
  }

  throw new Error('判別できないイベントを受け取った');
}

function extractS3Records(event: unknown): S3EventRecordLike[] | null {
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

function extractScheduledTask(event: unknown): ScheduledTask | null {
  if (typeof event !== 'object' || event === null) {
    return null;
  }
  const task = (event as { task?: unknown }).task;
  return task === 'cleanup' || task === 'reconcile' ? task : null;
}
