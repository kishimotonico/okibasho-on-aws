import { describe, expect, it } from 'vitest';

import { formatUploadError } from '../src/lib/format-upload-error';

describe('formatUploadError', () => {
  it('Failed to fetch はネットワークの案内だけ出す', () => {
    expect(formatUploadError(new TypeError('Failed to fetch'))).toEqual({
      message: 'アップロードできませんでした。ネットワーク接続を確認して、もう一度お試しください。',
      detail: null,
    });
  });

  it('別文面のネットワークエラーは定型文に元メッセージを添える', () => {
    expect(formatUploadError(new TypeError('Load failed'))).toEqual({
      message: 'アップロードできませんでした。ネットワーク接続を確認して、もう一度お試しください。',
      detail: 'Load failed',
    });
  });

  it('それ以外は概要と原因を出す', () => {
    expect(formatUploadError(new Error('AccessDenied'))).toEqual({
      message: 'アップロードできませんでした。',
      detail: 'AccessDenied',
    });
  });
});
