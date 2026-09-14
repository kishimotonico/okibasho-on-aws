import { describe, expect, it } from 'vitest';
import { extractS3Records } from '../lib/lambda/share-projector/dispatch.js';

describe('extractS3Records', () => {
  it('S3イベント(Records配列、各要素にs3キー)ならレコード配列を返す', () => {
    const event = {
      Records: [{ s3: { object: { key: 'meta/tanaka@example.jp/q3.json' } } }],
    };
    expect(extractS3Records(event)).toEqual(event.Records);
  });

  it('EventBridgeのスケジュールイベント(Recordsが無い)なら null', () => {
    expect(
      extractS3Records({ source: 'aws.scheduler', 'detail-type': 'Scheduled Event' }),
    ).toBeNull();
  });

  it('Recordsはあるがs3キーを持たない要素を含むなら null', () => {
    expect(extractS3Records({ Records: [{ foo: 'bar' }] })).toBeNull();
  });

  it('イベントがオブジェクトでなければ null', () => {
    expect(extractS3Records(null)).toBeNull();
    expect(extractS3Records('schedule')).toBeNull();
  });
});
