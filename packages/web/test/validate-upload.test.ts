import { describe, expect, it } from 'vitest';

import { validateUploadRequest } from '../src/lib/validate-upload';

function makeFile(name: string, path: string, size = 1) {
  const file = new File(['x'], name, { type: 'text/html' });
  Object.defineProperty(file, 'size', { value: size });
  return { path, file };
}

describe('validateUploadRequest', () => {
  it('index.html が無いときにエラーになる', () => {
    const errors = validateUploadRequest(
      [makeFile('style.css', 'assets/style.css')],
      '',
      'temporary',
    );

    expect(errors.some((error) => error.code === 'missing_index_html')).toBe(true);
  });
});
