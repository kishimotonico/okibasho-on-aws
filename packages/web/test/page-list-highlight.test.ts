import { describe, expect, it } from 'vitest';

import { sortPagesByCreatedAt } from '../src/lib/page-list-highlight';

describe('sortPagesByCreatedAt', () => {
  it('作成日時の新しい順にする', () => {
    const pages = [
      { slug: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
      { slug: 'new', createdAt: '2026-09-01T00:00:00.000Z' },
      { slug: 'mid', createdAt: '2026-03-01T00:00:00.000Z' },
    ];

    expect(sortPagesByCreatedAt(pages).map((page) => page.slug)).toEqual(['new', 'mid', 'old']);
  });

  it('同時刻は slug 昇順にする', () => {
    const pages = [
      { slug: 'zeta', createdAt: '2026-01-01T00:00:00.000Z' },
      { slug: 'alpha', createdAt: '2026-01-01T00:00:00.000Z' },
      { slug: 'mu', createdAt: '2026-01-01T00:00:00.000Z' },
    ];

    expect(sortPagesByCreatedAt(pages).map((page) => page.slug)).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('新しい順を優先し、同時刻だけ slug で決める', () => {
    const pages = [
      { slug: 'b-old', createdAt: '2026-01-01T00:00:00.000Z' },
      { slug: 'z-new', createdAt: '2026-09-01T00:00:00.000Z' },
      { slug: 'a-new', createdAt: '2026-09-01T00:00:00.000Z' },
    ];

    expect(sortPagesByCreatedAt(pages).map((page) => page.slug)).toEqual([
      'a-new',
      'z-new',
      'b-old',
    ]);
  });

  it('元の配列は変えない', () => {
    const pages = [
      { slug: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
      { slug: 'new', createdAt: '2026-09-01T00:00:00.000Z' },
    ];

    sortPagesByCreatedAt(pages);

    expect(pages.map((page) => page.slug)).toEqual(['old', 'new']);
  });
});
