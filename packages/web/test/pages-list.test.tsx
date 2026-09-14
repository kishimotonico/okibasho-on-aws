// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PagesList } from '~/components/PagesList';
import { TooltipProvider } from '~/components/Tooltip';
import type { ListedPage } from '~/lib/listed-page';

function page(slug: string, overrides: Partial<ListedPage> = {}): ListedPage {
  return {
    slug,
    owner: 'tanaka@example.jp',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    retention: 'temporary',
    viewUrl: `https://pages.example.com/p/tanaka/${slug}/`,
    shareTag: 'a'.repeat(11),
    ...overrides,
  };
}

function renderList(props: Partial<Parameters<typeof PagesList>[0]> = {}) {
  const handlers = {
    onReupload: vi.fn(),
    onRetentionChange: vi.fn(),
    onDelete: vi.fn(),
    onShare: vi.fn(),
  };
  render(
    <TooltipProvider>
      <PagesList
        pages={[page('alpha'), page('beta'), page('gamma')]}
        highlightSlug={null}
        error={null}
        {...handlers}
        {...props}
      />
    </TooltipProvider>,
  );
  return handlers;
}

function rowOf(slug: string) {
  return screen.getByRole('heading', { name: slug }).closest('li')!;
}

describe('PagesList', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });

  it('slug を主表示、URL と有効期限を副表示にする', () => {
    renderList();

    const row = rowOf('beta');
    expect(within(row).getByText('https://pages.example.com/p/tanaka/beta/')).toBeInTheDocument();
    expect(within(row).getByText(/まで（あと\d+日）|無期限|期限切れ（/)).toBeInTheDocument();
  });

  it('渡された順に並べる（並び替えは一覧の仕事ではない）', () => {
    renderList({ pages: [page('zeta'), page('alpha')] });

    expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual([
      'zeta',
      'alpha',
    ]);
  });

  it('直接操作は開くとコピーだけで、kebab に低頻度操作を入れる', async () => {
    const user = userEvent.setup();
    const { onReupload } = renderList();
    const row = rowOf('beta');

    expect(within(row).getByRole('link', { name: 'ページを開く' })).toHaveAttribute(
      'href',
      'https://pages.example.com/p/tanaka/beta/',
    );
    expect(within(row).queryByRole('button', { name: '再アップロード' })).toBeNull();
    expect(within(row).queryByRole('button', { name: '削除' })).toBeNull();

    await user.click(within(row).getByRole('button', { name: 'URLをコピー' }));
    expect(within(row).getByRole('button', { name: 'コピーしました' })).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'betaの操作' }));
    expect(await screen.findByRole('menuitem', { name: '再アップロード' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '無期限に変更' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '削除' })).toHaveClass('ui-menu__item--danger');

    await user.click(screen.getByRole('menuitem', { name: '再アップロード' }));
    expect(onReupload).toHaveBeenCalledWith('beta');
  });

  it('ハイライトは指定された行だけに付ける', () => {
    renderList({ highlightSlug: 'gamma' });

    expect(rowOf('gamma')).toHaveClass('page-row--highlight');
    expect(rowOf('gamma')).toHaveAttribute('data-highlighted', 'true');
    expect(rowOf('alpha')).not.toHaveClass('page-row--highlight');
  });

  it('削除は AlertDialog で確認してから onDelete を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderList();

    await user.click(within(rowOf('beta')).getByRole('button', { name: 'betaの操作' }));
    await user.click(screen.getByRole('menuitem', { name: '削除' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('「beta」を削除しますか？');
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '削除' }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('削除確認でやめると onDelete を呼ばない', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderList();

    await user.click(within(rowOf('beta')).getByRole('button', { name: 'betaの操作' }));
    await user.click(screen.getByRole('menuitem', { name: '削除' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'やめる' }),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('無期限に変更は確認なしで onRetentionChange を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onRetentionChange } = renderList();

    await user.click(within(rowOf('beta')).getByRole('button', { name: 'betaの操作' }));
    await user.click(screen.getByRole('menuitem', { name: '無期限に変更' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onRetentionChange).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'beta' }),
      'permanent',
    );
  });

  it('30日に戻すは AlertDialog で確認してから onRetentionChange を呼ぶ', async () => {
    const user = userEvent.setup();
    const recentCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { onRetentionChange } = renderList({
      pages: [
        page('keep-perm', {
          retention: 'permanent',
          expiresAt: null,
          createdAt: recentCreatedAt,
        }),
      ],
    });

    await user.click(within(rowOf('keep-perm')).getByRole('button', { name: 'keep-permの操作' }));
    await user.click(screen.getByRole('menuitem', { name: '30日に戻す' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('保存期間を30日に変更しますか？');
    expect(onRetentionChange).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '30日に戻す' }),
    );

    expect(onRetentionChange).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'keep-perm' }),
      'temporary',
    );
  });

  it('ページがなければ案内を出す', () => {
    renderList({ pages: [] });

    expect(
      screen.getByText('まだページがありません。上のフォームからアップロードしてください。'),
    ).toBeInTheDocument();
  });

  it('外部共有中のページだけ、slug の横に地球儀のボタンを表示する', () => {
    renderList({
      pages: [
        page('alpha'),
        page('beta', { share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' } }),
      ],
    });

    expect(within(rowOf('beta')).getByRole('button', { name: '外部共有中' })).toBeInTheDocument();
    expect(within(rowOf('alpha')).queryByRole('button', { name: '外部共有中' })).toBeNull();
  });

  it('slug 横の地球儀ボタンを押すと、その行の onShare が呼ばれる（ShareDialog を開く）', async () => {
    const user = userEvent.setup();
    const { onShare } = renderList({
      pages: [
        page('alpha'),
        page('beta', { share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' } }),
      ],
    });

    await user.click(within(rowOf('beta')).getByRole('button', { name: /^外部共有中/ }));

    expect(onShare).toHaveBeenCalledWith('beta');
  });

  it('kebab の「外部共有…」は onShare を slug 付きで呼ぶ（ShareDialog の開閉は route 側の仕事）', async () => {
    const user = userEvent.setup();
    const { onShare } = renderList();

    await user.click(within(rowOf('beta')).getByRole('button', { name: 'betaの操作' }));
    await user.click(screen.getByRole('menuitem', { name: '外部共有…' }));

    expect(onShare).toHaveBeenCalledWith('beta');
  });
});
