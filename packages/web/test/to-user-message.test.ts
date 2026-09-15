import { describe, expect, it } from 'vitest';

import { toUserMessage } from '../src/lib/to-user-message';

describe('toUserMessage', () => {
  it('ネットワークエラーは操作によらず接続の案内にする', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'), '削除に失敗しました')).toBe(
      '接続できませんでした。ネットワークを確認してお試しください。',
    );
    expect(toUserMessage(new TypeError('Load failed'))).toBe(
      '接続できませんでした。ネットワークを確認してお試しください。',
    );
  });

  it('それ以外は操作ごとの文言にして、生のエラーは見せない', () => {
    expect(toUserMessage(new Error('AccessDenied'), '削除に失敗しました')).toBe(
      '削除に失敗しました',
    );
    expect(toUserMessage(new Error('AccessDenied'))).toBe(
      'アップロードに失敗しました。もう一度お試しください。',
    );
  });
});
