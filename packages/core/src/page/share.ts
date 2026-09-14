import { toBase64Url } from './base64url.js';

const ID_BYTE_LENGTH = 16;
const SALT_BYTE_LENGTH = 16;

/** base64url（パディングなし）22文字の share-id / salt に共通のパターン */
export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const SHARE_USERNAME_MIN_LENGTH = 1;
export const SHARE_USERNAME_MAX_LENGTH = 64;
export const SHARE_PASSWORD_MIN_LENGTH = 8;
export const SHARE_PASSWORD_MAX_LENGTH = 128;
export const SHARE_CIDR_MIN_COUNT = 1;
export const SHARE_CIDR_MAX_COUNT = 20;

/**
 * Basic 認証の資格情報は印字可能な ASCII に限る。
 * ブラウザと CloudFront Function で非 ASCII の文字コード解釈がずれるとハッシュが一致しなくなるため
 */
const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7e]*$/;

export interface PageShareBasic {
  /** 1〜64 文字。':' と制御文字を含まない */
  username: string;
  /** 16 バイトの CSPRNG を base64url にした 22 文字 */
  salt: string;
  /** hex(sha256(`${salt}:${username}:${password}`))。小文字 64 桁 */
  hash: string;
}

export interface PageShare {
  /** 16 バイトの CSPRNG を base64url（パディングなし）にした 22 文字。/^[A-Za-z0-9_-]{22}$/ */
  id: string;
  /** Basic 認証。無ければ Basic なし */
  basic?: PageShareBasic;
  /** IPv4 CIDR（例 "203.0.113.0/24"）。単一 IP は "/32" を付けて保存。1〜20 件。無い・空なら IP 制限なし */
  allowedCidrs?: string[];
}

export interface ShareValidationError {
  field: 'username' | 'password' | 'cidrs' | 'id';
  message: string;
}

export type ShareValidationResult<T> =
  { ok: true; value: T } | { ok: false; errors: ShareValidationError[] };

/** share-id を CSPRNG で生成する。22 文字の base64url。globalThis.crypto のみ使用（Node 22 / ブラウザ両対応） */
export function generateShareId(): string {
  const bytes = new Uint8Array(ID_BYTE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Basic 認証用の salt を CSPRNG で生成する。22 文字の base64url */
export function generateShareSalt(): string {
  const bytes = new Uint8Array(SALT_BYTE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * 紛らわしい文字（0, O, o, 1, l, I 等）を除いた小文字英数字31文字。
 * パスワード生成にのみ使う（share-id / salt の base64url とは別体系）
 */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PASSWORD_GROUP_COUNT = 4;
const PASSWORD_GROUP_LENGTH = 4;

/** 0〜255 を PASSWORD_ALPHABET.length で割り切れる最大値。これ以上は棄却して mod バイアスを避ける */
const PASSWORD_BYTE_ACCEPT_LIMIT =
  Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;

function pickPasswordChar(): string {
  const buffer = new Uint8Array(1);
  let value: number;
  do {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= PASSWORD_BYTE_ACCEPT_LIMIT);
  return PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]!;
}

/**
 * 外部共有の Basic 認証パスワードを自動生成する。
 * 紛らわしい文字を除いた小文字英数字31文字から棄却法で偏りなくサンプリングし、
 * 4文字×4組をハイフンでつなぐ（例: `k7mq-3xwp-9rtd-h2vn`）。約80bit。
 * validateSharePassword（8文字以上・印字可能ASCII）を満たす
 */
export function generateSharePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < PASSWORD_GROUP_COUNT; g++) {
    let group = '';
    for (let i = 0; i < PASSWORD_GROUP_LENGTH; i++) {
      group += pickPasswordChar();
    }
    groups.push(group);
  }
  return groups.join('-');
}

export function isValidShareId(value: unknown): value is string {
  return typeof value === 'string' && SHARE_ID_PATTERN.test(value);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** hex(sha256(`${salt}:${username}:${password}`))。小文字 64 桁。globalThis.crypto.subtle のみ使用 */
export async function hashSharePassword(
  salt: string,
  username: string,
  password: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${username}:${password}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export function validateShareUsername(username: string): ShareValidationError[] {
  const errors: ShareValidationError[] = [];
  if (username.length < SHARE_USERNAME_MIN_LENGTH || username.length > SHARE_USERNAME_MAX_LENGTH) {
    errors.push({
      field: 'username',
      message: `ユーザー名は${SHARE_USERNAME_MIN_LENGTH}〜${SHARE_USERNAME_MAX_LENGTH}文字で入力してください`,
    });
    return errors;
  }
  if (username.includes(':')) {
    errors.push({ field: 'username', message: 'ユーザー名に「:」は使えません' });
  }
  if (!PRINTABLE_ASCII_PATTERN.test(username)) {
    errors.push({ field: 'username', message: 'ユーザー名は半角英数字と記号で入力してください' });
  }
  return errors;
}

export function validateSharePassword(password: string): ShareValidationError[] {
  if (password.length < SHARE_PASSWORD_MIN_LENGTH || password.length > SHARE_PASSWORD_MAX_LENGTH) {
    return [
      {
        field: 'password',
        message: `パスワードは${SHARE_PASSWORD_MIN_LENGTH}文字以上で入力してください`,
      },
    ];
  }
  if (!PRINTABLE_ASCII_PATTERN.test(password)) {
    return [{ field: 'password', message: 'パスワードは半角英数字と記号で入力してください' }];
  }
  return [];
}

/** Basic 認証情報を組み立てる。username / password を検証したうえで salt / hash を作る */
export async function buildShareBasic(
  username: string,
  password: string,
): Promise<ShareValidationResult<PageShareBasic>> {
  const errors = [...validateShareUsername(username), ...validateSharePassword(password)];
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const salt = generateShareSalt();
  const hash = await hashSharePassword(salt, username, password);
  return { ok: true, value: { username, salt, hash } };
}

const OCTET_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => OCTET_PATTERN.test(part));
}

/**
 * 1行1件の CIDR 入力を検証・正規化する。単一 IP は "/32" を補う。
 * 1〜20 件の範囲外、不正な IPv4/CIDR はエラーにする。
 */
export function validateAndNormalizeCidrs(
  rawLines: readonly string[],
): ShareValidationResult<string[]> {
  const trimmed = rawLines.map((line) => line.trim()).filter((line) => line.length > 0);

  if (trimmed.length < SHARE_CIDR_MIN_COUNT) {
    return {
      ok: false,
      errors: [{ field: 'cidrs', message: 'IPアドレスを1件以上入力してください' }],
    };
  }
  if (trimmed.length > SHARE_CIDR_MAX_COUNT) {
    return {
      ok: false,
      errors: [
        { field: 'cidrs', message: `IPアドレスは${SHARE_CIDR_MAX_COUNT}件以内にしてください` },
      ],
    };
  }

  const normalized: string[] = [];
  for (const line of trimmed) {
    const [address, prefixRaw, ...rest] = line.split('/');
    if (!address || rest.length > 0 || !isValidIpv4(address)) {
      return {
        ok: false,
        errors: [{ field: 'cidrs', message: `不正な形式です: ${line}` }],
      };
    }

    if (prefixRaw === undefined) {
      normalized.push(`${address}/32`);
      continue;
    }

    if (!/^\d{1,2}$/.test(prefixRaw)) {
      return {
        ok: false,
        errors: [{ field: 'cidrs', message: `不正な形式です: ${line}` }],
      };
    }
    const prefixLength = Number(prefixRaw);
    if (prefixLength < 0 || prefixLength > 32) {
      return {
        ok: false,
        errors: [{ field: 'cidrs', message: `不正な形式です: ${line}` }],
      };
    }
    normalized.push(`${address}/${prefixLength}`);
  }

  return { ok: true, value: normalized };
}

/** 外部共有の閲覧 URL パス。`/s/<tag 11文字><share-id 22文字>/`。tag は computeShareTag で計算する */
export function buildShareViewPath(tag: string, id: string): string {
  return `/s/${tag}${id}/`;
}
