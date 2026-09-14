import { toBase64Url } from './base64url.js';

const ID_BYTE_LENGTH = 16;

/** base64url（パディングなし）22文字の share-id に共通のパターン */
export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Basic 認証のユーザー名は固定。自由入力にはしない */
export const SHARE_USERNAME = 'guest';

export interface PageShare {
  /** 16 バイトの CSPRNG を base64url（パディングなし）にした 22 文字。/^[A-Za-z0-9_-]{22}$/ */
  id: string;
  /**
   * システムが自動生成した平文パスワード。任意（秘匿URLだけでも共有は成立し、パスワードは
   * 上乗せの保護）。付けるときだけ設定する。metadata は所有者本人しか読めないため、ハッシュ化しない
   */
  password?: string;
  /**
   * IPv4アドレスの完全一致リスト（CIDR ではなく単一アドレス）。1〜20件。無い・空ならIP制限なし。
   * 管理UIには出さず、metadata の直接編集で設定する運用にする
   */
  allowedIps?: string[];
}

/** share-id を CSPRNG で生成する。22 文字の base64url。globalThis.crypto のみ使用（Node 22 / ブラウザ両対応） */
export function generateShareId(): string {
  const bytes = new Uint8Array(ID_BYTE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * 紛らわしい文字（0, O, o, 1, l, I 等）を除いた小文字英数字31文字。
 * パスワード生成にのみ使う（share-id の base64url とは別体系）
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
 * 外部共有の Basic 認証パスワードを自動生成する。手入力は受け付けず、常にこの生成関数の値だけを使う。
 * 紛らわしい文字を除いた小文字英数字31文字から棄却法で偏りなくサンプリングし、
 * 4文字×4組をハイフンでつなぐ（例: `k7mq-3xwp-9rtd-h2vn`）。約80bit
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

/** 外部共有の閲覧 URL パス。`/s/<tag 11文字><share-id 22文字>/`。tag は computeShareTag で計算する */
export function buildShareViewPath(tag: string, id: string): string {
  return `/s/${tag}${id}/`;
}
