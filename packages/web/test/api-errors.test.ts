import { describe, expect, it } from 'vitest';

import { extractApiErrorMessages } from '../src/lib/api-errors';

describe('extractApiErrorMessages', () => {
  it('details を含め全件の message を返す', () => {
    const messages = extractApiErrorMessages({
      error: {
        code: 'invalid_request',
        message: 'リクエストが不正です',
        details: [
          { code: 'invalid_path', message: '無効なパスです: ../secret' },
          { code: 'missing_index_html', message: 'ページ直下に index.html が必要です' },
        ],
      },
    });

    expect(messages).toEqual([
      'リクエストが不正です',
      '無効なパスです: ../secret',
      'ページ直下に index.html が必要です',
    ]);
  });
});
