import { describe, expect, it } from 'vitest';

import { parsePagesReturnUrl } from '~/lib/pages-cookie';

const PAGES = 'https://okibasho.example.com';

describe('parsePagesReturnUrl', () => {
  it('pages と同じ origin の /p/ 始まりだけ受け付ける', () => {
    expect(parsePagesReturnUrl(`${PAGES}/p/tanaka/report/?q=1`, PAGES)).toBe(
      `${PAGES}/p/tanaka/report/?q=1`,
    );
  });

  it.each([
    undefined,
    '/p/tanaka/report/',
    'http://okibasho.example.com/p/tanaka/report/',
    'https://app.okibasho.example.com/p/tanaka/report/',
    'https://okibasho.example.com.evil.example/p/x/',
    `${PAGES}/s/abc/`,
    `${PAGES}/`,
    'javascript:alert(1)',
  ])('%s は null', (value) => {
    expect(parsePagesReturnUrl(value, PAGES)).toBeNull();
  });
});
