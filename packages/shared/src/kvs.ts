import type { Visibility } from './metadata.js';
import { isValidVersionId } from './slug.js';

/** CloudFront KeyValueStore のキー。visibility は値ではなく名前空間で表す */
export function kvsKey(visibility: Visibility, slug: string): string {
  return `${visibility}/${slug}`;
}

export interface PageAliasValue {
  v: string;
  e?: number;
}

export function serializePageAliasValue(value: PageAliasValue): string {
  if (value.e === undefined) {
    return JSON.stringify({ v: value.v });
  }
  return JSON.stringify({ v: value.v, e: value.e });
}

export function parsePageAliasValue(raw: string): PageAliasValue | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record['v'] !== 'string' || !isValidVersionId(record['v'])) {
      return null;
    }
    if (record['e'] === undefined) {
      return { v: record['v'] };
    }
    if (typeof record['e'] !== 'number' || !Number.isFinite(record['e'])) {
      return null;
    }
    return { v: record['v'], e: record['e'] };
  } catch {
    return null;
  }
}
