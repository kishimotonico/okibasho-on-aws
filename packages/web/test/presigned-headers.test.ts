import { describe, expect, it } from 'vitest';

import { preparePresignedPutHeaders } from '../src/lib/presigned-headers';

describe('preparePresignedPutHeaders', () => {
  it('content-length を除き content-type を残す', () => {
    const headers = preparePresignedPutHeaders({
      'content-type': 'text/html',
      'content-length': '1234',
      'x-amz-meta-foo': 'bar',
    });

    expect(headers).toEqual({
      'content-type': 'text/html',
      'x-amz-meta-foo': 'bar',
    });
  });

  it('大文字小文字を問わず content-length を除く', () => {
    const headers = preparePresignedPutHeaders({
      'Content-Length': '99',
      'Content-Type': 'text/css',
    });

    expect(headers).toEqual({
      'Content-Type': 'text/css',
    });
  });
});
