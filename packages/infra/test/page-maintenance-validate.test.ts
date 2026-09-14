import { describe, expect, it } from 'vitest';
import {
  buildDesiredEntry,
  buildShareKvsValue,
  decodeS3EventKey,
  isExpired,
  isValidIp,
  isValidShareId,
  prefixFromMetadataKey,
  serializeKvsValue,
  validateShare,
} from '../lib/lambda/page-maintenance/validate.js';

const VALID_ID = 'AbCdEfGh12_-34567890Aa'; // 22文字
const VALID_PASSWORD = 'k7mq-3xwp-9rtd-h2vn';
const EXPECTED_B = Buffer.from(`guest:${VALID_PASSWORD}`, 'utf-8').toString('base64');

describe('prefixFromMetadataKey', () => {
  it('meta/<email>/<slug>.json からprefixを導出する', () => {
    expect(prefixFromMetadataKey('meta/tanaka@example.jp/q3-report.json')).toBe(
      'pages/tanaka@example.jp/q3-report/',
    );
  });

  it('meta/配下のJSON以外は null', () => {
    expect(prefixFromMetadataKey('pages/tanaka@example.jp/q3-report/index.html')).toBeNull();
  });

  it('セグメント数が違うkeyは null', () => {
    expect(prefixFromMetadataKey('meta/q3-report.json')).toBeNull();
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

describe('isValidIp', () => {
  it('正しいIPv4アドレスを受け付ける', () => {
    expect(isValidIp('203.0.113.5')).toBe(true);
    expect(isValidIp('0.0.0.0')).toBe(true);
    expect(isValidIp('255.255.255.255')).toBe(true);
  });

  it('オクテットが範囲外なら弾く', () => {
    expect(isValidIp('256.0.0.0')).toBe(false);
  });

  it('CIDR表記(スラッシュ付き)は弾く', () => {
    expect(isValidIp('203.0.113.0/24')).toBe(false);
  });

  it('文字列でなければ弾く', () => {
    expect(isValidIp(123)).toBe(false);
  });
});

describe('validateShare', () => {
  it('id/password の最小構成を受け付ける', () => {
    expect(validateShare({ id: VALID_ID, password: VALID_PASSWORD })).toEqual({
      id: VALID_ID,
      password: VALID_PASSWORD,
    });
  });

  it('allowedIpsを含む構成を受け付ける', () => {
    const share = { id: VALID_ID, password: VALID_PASSWORD, allowedIps: ['203.0.113.5'] };
    expect(validateShare(share)).toEqual(share);
  });

  it('idが不正なら null', () => {
    expect(validateShare({ id: 'short', password: VALID_PASSWORD })).toBeNull();
  });

  it('passwordが無い/不正なら null', () => {
    expect(validateShare({ id: VALID_ID })).toBeNull();
    expect(validateShare({ id: VALID_ID, password: '' })).toBeNull();
    expect(validateShare({ id: VALID_ID, password: 'a\nb' })).toBeNull();
  });

  it('allowedIpsが0件なら null', () => {
    expect(validateShare({ id: VALID_ID, password: VALID_PASSWORD, allowedIps: [] })).toBeNull();
  });

  it('allowedIpsが21件なら null', () => {
    const allowedIps = Array.from({ length: 21 }, (_, i) => `10.0.${i}.1`);
    expect(validateShare({ id: VALID_ID, password: VALID_PASSWORD, allowedIps })).toBeNull();
  });

  it('allowedIpsにCIDR表記が混ざっていれば null', () => {
    expect(
      validateShare({
        id: VALID_ID,
        password: VALID_PASSWORD,
        allowedIps: ['203.0.113.0/24'],
      }),
    ).toBeNull();
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
  it('id/passwordから p/id/b の値になる(bはguest:passwordのbase64)', () => {
    const value = buildShareKvsValue('pages/tanaka@example.jp/q3/', {
      id: VALID_ID,
      password: VALID_PASSWORD,
    });
    expect(value).toEqual({
      p: 'pages/tanaka@example.jp/q3/',
      id: VALID_ID,
      b: EXPECTED_B,
    });
  });

  it('allowedIpsがあればipsを含む', () => {
    const value = buildShareKvsValue('pages/tanaka@example.jp/q3/', {
      id: VALID_ID,
      password: VALID_PASSWORD,
      allowedIps: ['203.0.113.5'],
    });
    expect(value).toEqual({
      p: 'pages/tanaka@example.jp/q3/',
      id: VALID_ID,
      b: EXPECTED_B,
      ips: ['203.0.113.5'],
    });
  });

  it('1KBを超えるとnull', () => {
    const huge = {
      p: 'pages/x/y/',
      id: VALID_ID,
      b: EXPECTED_B,
      ips: Array.from({ length: 20 }, () => '203.0.113.0'.repeat(10)),
    };
    expect(serializeKvsValue(huge as never)).toBeNull();
  });
});

describe('buildDesiredEntry', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const prefix = 'pages/tanaka@example.jp/q3/';

  it('shareがあれば desired entry を返す', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
      share: { id: VALID_ID, password: VALID_PASSWORD },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toEqual({
      id: VALID_ID,
      value: { p: prefix, id: VALID_ID, b: EXPECTED_B },
    });
  });

  it('metadataに余分なフィールドがあってもprefixは呼び出し元の値をそのまま使う(metadataの中身は信用しない)', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
      share: { id: VALID_ID, password: VALID_PASSWORD },
      unknownField: 'evil',
    };
    expect(buildDesiredEntry(metadata, prefix, now)?.value.p).toBe(prefix);
  });

  it('shareが無ければ null', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('期限切れなら null', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-01-01T00:00:00Z',
      share: { id: VALID_ID, password: VALID_PASSWORD },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('shareの検証に失敗したら null', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
      share: { id: 'short', password: VALID_PASSWORD },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('metadata自体がオブジェクトでなければ null', () => {
    expect(buildDesiredEntry(null, prefix, now)).toBeNull();
    expect(buildDesiredEntry('broken', prefix, now)).toBeNull();
  });

  it('expiresAtがundefined(欠落)なら metadata不正として null', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      share: { id: VALID_ID, password: VALID_PASSWORD },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('expiresAtが非文字列(数値など)なら metadata不正として null', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: 12345,
      share: { id: VALID_ID, password: VALID_PASSWORD },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });

  it('expiresAtがパース不能な文字列なら metadata不正として null', () => {
    const metadata = {
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: 'not-a-date',
      share: { id: VALID_ID, password: VALID_PASSWORD },
    };
    expect(buildDesiredEntry(metadata, prefix, now)).toBeNull();
  });
});

describe('decodeS3EventKey', () => {
  it('URLエンコードされたキーをデコードする', () => {
    expect(decodeS3EventKey('meta/tanaka%40example.jp/q3-report.json')).toBe(
      'meta/tanaka@example.jp/q3-report.json',
    );
  });

  it("'+'は空白にデコードする(S3イベント通知のキーはフォームエンコードに近い形式)", () => {
    expect(decodeS3EventKey('meta/tanaka%40example.jp/hello+world.json')).toBe(
      'meta/tanaka@example.jp/hello world.json',
    );
  });
});
