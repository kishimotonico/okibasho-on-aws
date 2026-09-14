import { describe, expect, it } from 'vitest';
import {
  buildDesiredEntry,
  buildShareKvsValue,
  isExpired,
  isValidCidr,
  isValidShareId,
  prefixFromMetadataKey,
  serializeKvsValue,
  validateShare,
} from '../lib/lambda/share-projector/validate.js';

const VALID_ID = 'AbCdEfGh12_-34567890Aa'; // 22文字
const VALID_SALT = 'AbCdEfGh12_-34567890Bb';
const VALID_HASH = 'a'.repeat(64);

describe('prefixFromMetadataKey', () => {
  it('pages/<email>/<slug>/.metadata.json からprefixを導出する', () => {
    expect(prefixFromMetadataKey('pages/tanaka@example.jp/q3-report/.metadata.json')).toBe(
      'pages/tanaka@example.jp/q3-report/',
    );
  });

  it('.metadata.json 以外は null', () => {
    expect(prefixFromMetadataKey('pages/tanaka@example.jp/q3-report/index.html')).toBeNull();
  });

  it('セグメント数が違うkeyは null', () => {
    expect(prefixFromMetadataKey('pages/.metadata.json')).toBeNull();
  });
});

describe('isValidShareId', () => {
  it('22文字の base64url を受け付ける', () => {
    expect(isValidShareId(VALID_ID)).toBe(true);
  });

  it('長さが違うと弾く', () => {
    expect(isValidShareId('short')).toBe(false);
  });

  it('使用不可文字を含むと弾く', () => {
    expect(isValidShareId('a'.repeat(21) + '/')).toBe(false);
  });
});

describe('isValidCidr', () => {
  it('正しいIPv4 CIDRを受け付ける', () => {
    expect(isValidCidr('203.0.113.0/24')).toBe(true);
    expect(isValidCidr('203.0.113.5/32')).toBe(true);
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
  });

  it('オクテットが範囲外なら弾く', () => {
    expect(isValidCidr('256.0.0.0/24')).toBe(false);
  });

  it('prefixが範囲外なら弾く', () => {
    expect(isValidCidr('203.0.113.0/33')).toBe(false);
    expect(isValidCidr('203.0.113.0/-1')).toBe(false);
  });

  it('スラッシュが無ければ弾く', () => {
    expect(isValidCidr('203.0.113.0')).toBe(false);
  });
});

describe('validateShare', () => {
  it('idだけの最小構成を受け付ける', () => {
    expect(validateShare({ id: VALID_ID })).toEqual({ id: VALID_ID });
  });

  it('basicとallowedCidrsを含む構成を受け付ける', () => {
    const share = {
      id: VALID_ID,
      basic: { username: 'tanaka', salt: VALID_SALT, hash: VALID_HASH },
      allowedCidrs: ['203.0.113.0/24'],
    };
    expect(validateShare(share)).toEqual(share);
  });

  it('idが不正なら null', () => {
    expect(validateShare({ id: 'short' })).toBeNull();
  });

  it('basic.usernameが空なら null', () => {
    expect(
      validateShare({
        id: VALID_ID,
        basic: { username: '', salt: VALID_SALT, hash: VALID_HASH },
      }),
    ).toBeNull();
  });

  it('basic.usernameに制御文字を含むと null', () => {
    expect(
      validateShare({
        id: VALID_ID,
        basic: { username: 'ta\nnaka', salt: VALID_SALT, hash: VALID_HASH },
      }),
    ).toBeNull();
  });

  it('allowedCidrsが0件なら null', () => {
    expect(validateShare({ id: VALID_ID, allowedCidrs: [] })).toBeNull();
  });

  it('allowedCidrsが21件なら null', () => {
    const cidrs = Array.from({ length: 21 }, (_, i) => `10.0.${i}.0/24`);
    expect(validateShare({ id: VALID_ID, allowedCidrs: cidrs })).toBeNull();
  });

  it('shareがオブジェクトでなければ null', () => {
    expect(validateShare(null)).toBeNull();
    expect(validateShare('x')).toBeNull();
  });
});

describe('isExpired', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('expiresAtが過去なら期限切れ', () => {
    expect(isExpired('2025-01-01T00:00:00Z', now)).toBe(true);
  });

  it('expiresAtが未来なら期限切れではない', () => {
    expect(isExpired('2027-01-01T00:00:00Z', now)).toBe(false);
  });

  it('nullなら無期限なので期限切れではない', () => {
    expect(isExpired(null, now)).toBe(false);
  });

  it('undefinedや非文字列は期限切れではない(呼び出し元がmetadata不正として別途弾く)', () => {
    expect(isExpired(undefined, now)).toBe(false);
    expect(isExpired(123, now)).toBe(false);
  });
});

describe('buildShareKvsValue / serializeKvsValue', () => {
  it('idだけならpだけの値になる', () => {
    const value = buildShareKvsValue('pages/tanaka@example.jp/q3/', { id: VALID_ID });
    expect(value).toEqual({ p: 'pages/tanaka@example.jp/q3/' });
  });

  it('basic/allowedCidrsがあればb/cを含む', () => {
    const value = buildShareKvsValue('pages/tanaka@example.jp/q3/', {
      id: VALID_ID,
      basic: { username: 'tanaka', salt: VALID_SALT, hash: VALID_HASH },
      allowedCidrs: ['203.0.113.0/24'],
    });
    expect(value).toEqual({
      p: 'pages/tanaka@example.jp/q3/',
      b: `${VALID_SALT}:${VALID_HASH}`,
      c: ['203.0.113.0/24'],
    });
  });

  it('1KBを超えるとnull', () => {
    const huge = {
      p: 'pages/x/y/',
      c: Array.from({ length: 20 }, () => '203.0.113.0/24'.repeat(10)),
    };
    expect(serializeKvsValue(huge as never)).toBeNull();
  });
});

describe('buildDesiredEntry', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const prefix = 'pages/tanaka@example.jp/q3/';

  it('shareがあれば desired entry を返す', () => {
    const metadata = {
      slug: 'q3',
      owner: 'tanaka@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
      share: { id: VALID_ID },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toEqual({
      id: VALID_ID,
      value: { p: prefix },
    });
  });

  it('metadataがownerやslugと矛盾していてもprefixは呼び出し元の値をそのまま使う(metadataの中身は信用しない)', () => {
    const metadata = {
      slug: 'evil-slug',
      owner: 'evil@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
      share: { id: VALID_ID },
    };
    expect(buildDesiredEntry(metadata, prefix, now)?.value.p).toBe(prefix);
  });

  it('shareが無ければ null', () => {
    const metadata = {
      slug: 'q3',
      owner: 'tanaka@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('期限切れなら null', () => {
    const metadata = {
      slug: 'q3',
      owner: 'tanaka@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-01-01T00:00:00Z',
      share: { id: VALID_ID },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('shareの検証に失敗したら null', () => {
    const metadata = {
      slug: 'q3',
      owner: 'tanaka@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
      share: { id: 'short' },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('metadata自体がオブジェクトでなければ null', () => {
    expect(buildDesiredEntry(null, prefix, now)).toBeNull();
    expect(buildDesiredEntry('broken', prefix, now)).toBeNull();
  });

  it('expiresAtがundefined(欠落)なら metadata不正として null', () => {
    const metadata = {
      slug: 'q3',
      owner: 'tanaka@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      share: { id: VALID_ID },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('expiresAtが非文字列(数値など)なら metadata不正として null', () => {
    const metadata = {
      slug: 'q3',
      owner: 'tanaka@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: 12345,
      share: { id: VALID_ID },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('expiresAtがパース不能な文字列なら metadata不正として null', () => {
    const metadata = {
      slug: 'q3',
      owner: 'tanaka@example.jp',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: 'not-a-date',
      share: { id: VALID_ID },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });
});
