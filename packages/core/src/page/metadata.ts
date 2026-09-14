import { computeExpiresAt, retentionChangeExpiresAt, type Retention } from './retention.js';
import type { PageShare } from './share.js';

export interface PageMetadata {
  createdAt: string;
  /** ISO 8601。null なら無期限 */
  expiresAt: string | null;
  /** 外部共有設定。無ければ外部共有していない */
  share?: PageShare;
}

export function isPageMetadata(value: unknown): value is PageMetadata {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['createdAt'] === 'string' &&
    (record['expiresAt'] === null || typeof record['expiresAt'] === 'string') &&
    (record['share'] === undefined ||
      (typeof record['share'] === 'object' && record['share'] !== null))
  );
}

/** S3 から読んだ JSON を metadata として解釈する。壊れていれば null（無いものとして扱う） */
export function parsePageMetadata(raw: string): PageMetadata | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPageMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface UploadMetadataInput {
  retention: Retention;
  /** 外部共有を新しく設定する場合だけ渡す。渡さなければ既存の share（あれば）を引き継ぐ */
  share?: PageShare;
}

/**
 * アップロードで書く metadata を、既存 metadata（新規なら null）と入力から作る。
 * createdAt と share は既存を引き継ぎ、保存期限は公開時刻から数え直す。
 * permanent 化済みページは再アップロードで temporary に戻さない
 */
export function buildUploadMetadata(
  existing: PageMetadata | null,
  input: UploadMetadataInput,
  now: Date,
): PageMetadata {
  return {
    ...existing,
    createdAt: existing?.createdAt ?? now.toISOString(),
    expiresAt: existing?.expiresAt === null ? null : computeExpiresAt(input.retention, now),
    ...(input.share ? { share: input.share } : {}),
  };
}

/** 保存期間だけを変えた metadata。期限は変更時刻から数え直す */
export function withRetention(existing: PageMetadata, retention: Retention): PageMetadata {
  return { ...existing, expiresAt: retentionChangeExpiresAt(retention) };
}

/** 外部共有設定だけを差し替えた metadata。null で共有解除 */
export function withShare(existing: PageMetadata, share: PageShare | null): PageMetadata {
  const metadata: PageMetadata = { ...existing };
  if (share) {
    metadata.share = share;
  } else {
    delete metadata.share;
  }
  return metadata;
}
