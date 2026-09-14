import { describe, expect, it } from 'vitest';

import { buildViewUrl, buildViewUrlPrefix } from '../src/api/pages';

describe('buildViewUrlPrefix / buildViewUrl', () => {
  it('末尾スラッシュの有無にかかわらず固定部分はユーザーローカル部で終わる', () => {
    expect(buildViewUrlPrefix('https://pages.example.com/', 'tanaka@example.jp')).toBe(
      'https://pages.example.com/tanaka/',
    );
    expect(buildViewUrlPrefix('https://pages.example.com', 'tanaka@example.jp')).toBe(
      'https://pages.example.com/tanaka/',
    );
  });

  it('slug を足すと閲覧URLになる', () => {
    expect(buildViewUrl('https://pages.example.com/', 'tanaka@example.jp', 'q3-report')).toBe(
      'https://pages.example.com/tanaka/q3-report/',
    );
  });
});
