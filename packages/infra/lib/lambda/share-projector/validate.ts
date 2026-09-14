import type { DesiredEntry, ShareKvsValue, ValidatedShare } from './types.js';

const SHARE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const SALT_RE = /^[A-Za-z0-9_-]{22}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
/** 制御文字と ':' を含まない、1〜64文字 */
const USERNAME_RE = /^[^\x00-\x1f\x7f:]{1,64}$/;

const MAX_CIDRS = 20;
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

export function isValidCidr(cidr: unknown): cidr is string {
  if (typeof cidr !== 'string') {
    return false;
  }
  const slash = cidr.indexOf('/');
  if (slash === -1) {
    return false;
  }
  const address = cidr.slice(0, slash);
  const prefixText = cidr.slice(slash + 1);
  if (!/^\d{1,2}$/.test(prefixText)) {
    return false;
  }
  const prefix = Number(prefixText);
  if (prefix < 0 || prefix > 32) {
    return false;
  }
  return isValidIPv4Octets(address.split('.'));
}

function isValidBasic(basic: unknown): basic is ValidatedShare['basic'] {
  if (basic === undefined) {
    return true;
  }
  if (typeof basic !== 'object' || basic === null) {
    return false;
  }
  const record = basic as Record<string, unknown>;
  return (
    typeof record.username === 'string' &&
    USERNAME_RE.test(record.username) &&
    typeof record.salt === 'string' &&
    SALT_RE.test(record.salt) &&
    typeof record.hash === 'string' &&
    HASH_RE.test(record.hash)
  );
}

function isValidAllowedCidrs(allowedCidrs: unknown): allowedCidrs is string[] | undefined {
  if (allowedCidrs === undefined) {
    return true;
  }
  if (!Array.isArray(allowedCidrs)) {
    return false;
  }
  if (allowedCidrs.length < 1 || allowedCidrs.length > MAX_CIDRS) {
    return false;
  }
  return allowedCidrs.every(isValidCidr);
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
  if (!isValidBasic(record.basic)) {
    return null;
  }
  if (!isValidAllowedCidrs(record.allowedCidrs)) {
    return null;
  }

  const result: ValidatedShare = { id: record.id };
  if (record.basic !== undefined) {
    result.basic = record.basic as ValidatedShare['basic'];
  }
  if (record.allowedCidrs !== undefined) {
    result.allowedCidrs = record.allowedCidrs as string[];
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
  const value: ShareKvsValue = { p: prefix, id: share.id };
  if (share.basic) {
    value.b = `${share.basic.salt}:${share.basic.hash}`;
  }
  if (share.allowedCidrs && share.allowedCidrs.length > 0) {
    value.c = share.allowedCidrs;
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
