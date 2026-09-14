import type { DesiredEntry, ShareKvsValue, ValidatedShare } from './types.js';

const SHARE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
/** 自動生成パスワードの想定範囲。印字可能ASCII、1〜128文字 */
const PASSWORD_RE = /^[\x20-\x7e]{1,128}$/;

/** Basic認証のユーザー名は固定。router側のb値組み立てもこの値を使う */
const SHARE_USERNAME = 'guest';

const MAX_IPS = 20;
const KVS_VALUE_MAX_BYTES = 1024;

export function isValidShareId(id: unknown): id is string {
  return typeof id === 'string' && SHARE_ID_RE.test(id);
}

function isValidIPv4Octets(octets: string[]): boolean {
  if (octets.length !== 4) {
    return false;
  }
  return octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

/** IPv4アドレス1件(完全一致用。CIDR表記は受け付けない) */
export function isValidIp(ip: unknown): ip is string {
  if (typeof ip !== 'string') {
    return false;
  }
  return isValidIPv4Octets(ip.split('.'));
}

function isValidAllowedIps(allowedIps: unknown): allowedIps is string[] | undefined {
  if (allowedIps === undefined) {
    return true;
  }
  if (!Array.isArray(allowedIps)) {
    return false;
  }
  if (allowedIps.length < 1 || allowedIps.length > MAX_IPS) {
    return false;
  }
  return allowedIps.every(isValidIp);
}

/** metadata の share フィールドを検証する。壊れていれば null (=共有無し) */
export function validateShare(share: unknown): ValidatedShare | null {
  if (typeof share !== 'object' || share === null) {
    return null;
  }
  const record = share as Record<string, unknown>;
  if (!isValidShareId(record.id)) {
    return null;
  }
  if (typeof record.password !== 'string' || !PASSWORD_RE.test(record.password)) {
    return null;
  }
  if (!isValidAllowedIps(record.allowedIps)) {
    return null;
  }

  const result: ValidatedShare = { id: record.id, password: record.password };
  if (record.allowedIps !== undefined) {
    result.allowedIps = record.allowedIps as string[];
  }
  return result;
}

/** expiresAt の期限切れ判定。文字列でなければ(null=無期限を含め)期限切れとしない。形式の検証は isValidExpiresAt が担う */
export function isExpired(expiresAt: unknown, now: Date): boolean {
  if (typeof expiresAt !== 'string') {
    return false;
  }
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return false;
  }
  return expiry.getTime() <= now.getTime();
}

/** expiresAtが仕様(ISO文字列 または null)通りかどうか */
function isValidExpiresAt(expiresAt: unknown): expiresAt is string | null {
  if (expiresAt === null) {
    return true;
  }
  if (typeof expiresAt !== 'string') {
    return false;
  }
  return !Number.isNaN(new Date(expiresAt).getTime());
}

/** S3キー "meta/<email>/<slug>.json" からprefixを導出する。metadataの中身は信用しない */
export function prefixFromMetadataKey(s3Key: string): string | null {
  const match = s3Key.match(/^meta\/([^/]+)\/([^/]+)\.json$/);
  if (!match) {
    return null;
  }
  return `pages/${match[1]}/${match[2]}/`;
}

export function buildShareKvsValue(prefix: string, share: ValidatedShare): ShareKvsValue {
  const value: ShareKvsValue = {
    p: prefix,
    id: share.id,
    b: Buffer.from(`${SHARE_USERNAME}:${share.password}`, 'utf-8').toString('base64'),
  };
  if (share.allowedIps && share.allowedIps.length > 0) {
    value.ips = share.allowedIps;
  }
  return value;
}

/** 1KB以内であることを確認してJSON文字列化する。超過したら null (=書かない) */
export function serializeKvsValue(value: ShareKvsValue): string | null {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf-8') > KVS_VALUE_MAX_BYTES) {
    return null;
  }
  return json;
}

/**
 * metadataの生JSONとprefixから「あるべき状態」を決める。
 * metadataが無い/JSON不正/shareが無い/検証失敗/期限切れ/1KB超過 → null
 */
export function buildDesiredEntry(
  metadataRaw: unknown,
  prefix: string,
  now: Date,
): DesiredEntry | null {
  if (typeof metadataRaw !== 'object' || metadataRaw === null) {
    return null;
  }
  const metadata = metadataRaw as Record<string, unknown>;

  // expiresAt は ISO 文字列か null(無期限)のみ。それ以外は metadata 不正として共有無し
  if (!isValidExpiresAt(metadata.expiresAt)) {
    return null;
  }

  if (isExpired(metadata.expiresAt, now)) {
    return null;
  }

  const share = validateShare(metadata.share);
  if (!share) {
    return null;
  }

  const value = buildShareKvsValue(prefix, share);
  const serialized = serializeKvsValue(value);
  if (serialized === null) {
    return null;
  }

  return { id: share.id, value };
}

export function parseMetadataJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * S3イベント通知のオブジェクトキーをデコードする。
 * S3イベント通知のキーはURLエンコードされ、かつ空白は'+'になっている(フォームエンコードに近い形式)
 * ため、まず'+'を空白に戻してからdecodeURIComponentする
 */
export function decodeS3EventKey(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, ' '));
}
