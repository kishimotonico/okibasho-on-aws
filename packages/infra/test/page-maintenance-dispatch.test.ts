import { describe, expect, it } from 'vitest';
import { classifyEvent } from '../lib/lambda/page-maintenance/dispatch.js';

describe('classifyEvent', () => {
  it('S3イベント(Records配列、各要素にs3キー)ならレコード配列を返す', () => {
    const event = {
      Records: [{ s3: { object: { key: 'meta/tanaka@example.jp/q3.json' } } }],
    };
    expect(classifyEvent(event)).toEqual({ kind: 's3', records: event.Records });
  });

  it('スケジュールのinputで渡されたtaskを返す', () => {
    expect(classifyEvent({ task: 'cleanup' })).toEqual({ kind: 'cleanup' });
    expect(classifyEvent({ task: 'reconcile' })).toEqual({ kind: 'reconcile' });
  });

  it('Recordsもtaskも無いイベントは判別できず例外になる', () => {
    expect(() => classifyEvent({ source: 'aws.events' })).toThrow();
    expect(() => classifyEvent({ Records: [{ foo: 'bar' }] })).toThrow();
    expect(() => classifyEvent({ task: 'unknown' })).toThrow();
    expect(() => classifyEvent(null)).toThrow();
    expect(() => classifyEvent('schedule')).toThrow();
  });
});
