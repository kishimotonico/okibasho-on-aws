// @vitest-environment jsdom

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyPagesList, type MyPagesListHandle } from '~/components/MyPagesList';
import { TooltipProvider } from '~/components/Tooltip';
import { PAGE_HIGHLIGHT_MS } from '~/lib/page-list-highlight';
import type { ListedPage } from '~/lib/pages-s3';

const listPages = vi.fn();
const updatePageRetention = vi.fn();
const deletePage = vi.fn();

vi.mock('~/auth/auth-context', () => ({
  useAuth: () => ({
    email: 'tanaka@example.jp',
    idToken: 'id-token',
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('~/config/env', () => ({
  getWebConfig: () => ({
    hostedUiBaseUrl: 'https://auth.example.com',
    oidcIssuer: 'https://issuer.example.com',
    webAppClientId: 'client',
    identityPoolId: 'id-pool',
    userPoolId: 'user-pool',
    region: 'ap-northeast-1',
    pagesBucket: 'pages-bucket',
    pagesBaseUrl: 'https://pages.example.com',
  }),
}));

vi.mock('~/lib/s3-client', () => ({
  createPagesS3Client: vi.fn(() => ({})),
}));

vi.mock('~/lib/pages-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/pages-s3')>();
  return {
    ...actual,
    listPages: (...args: unknown[]) => listPages(...args),
    updatePageRetention: (...args: unknown[]) => updatePageRetention(...args),
    deletePage: (...args: unknown[]) => deletePage(...args),
  };
});

function page(slug: string, overrides: Partial<ListedPage> = {}): ListedPage {
  return {
    slug,
    owner: 'tanaka@example.jp',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    retention: 'temporary',
    viewUrl: `https://pages.example.com/tanaka/${slug}/`,
    ...overrides,
  };
}

function renderList(onReupload = vi.fn()) {
  const ref = createRef<MyPagesListHandle>();
  render(
    <TooltipProvider>
      <MyPagesList ref={ref} onReupload={onReupload} />
    </TooltipProvider>,
  );
  return { ref, onReupload };
}

describe('MyPagesList', () => {
  beforeEach(() => {
    listPages.mockReset();
    updatePageRetention.mockReset();
    deletePage.mockReset();
    listPages.mockResolvedValue([page('alpha'), page('beta'), page('gamma')]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('slug を主表示、URL と有効期限を副表示にする', async () => {
    renderList();

    const row = await screen.findByRole('heading', { name: 'beta' });
    const item = row.closest('li');
    expect(item).not.toBeNull();
    expect(within(item!).getByText('https://pages.example.com/tanaka/beta/')).toBeInTheDocument();
    expect(within(item!).getByText(/あと \d+ 日|無期限|期限切れ/)).toBeInTheDocument();
  });

  it('直接操作は開くとコピーだけで、kebab に低頻度操作を入れる', async () => {
    const user = userEvent.setup();
    const { onReupload } = renderList();

    const betaHeading = await screen.findByRole('heading', { name: 'beta' });
    const row = betaHeading.closest('li')!;

    const open = within(row).getByRole('link', { name: 'ページを開く' });
    expect(open).toHaveAttribute('href', 'https://pages.example.com/tanaka/beta/');

    expect(within(row).queryByRole('button', { name: 'コピー' })).toBeNull();
    expect(within(row).queryByRole('button', { name: '再アップロード' })).toBeNull();
    expect(within(row).queryByRole('button', { name: '無期限にする' })).toBeNull();
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

  it('S3 の取得順ではなく作成日時の新しい順に並べる', async () => {
    listPages.mockResolvedValue([
      page('alpha', { createdAt: '2026-01-01T00:00:00.000Z' }),
      page('zeta', { createdAt: '2026-09-01T00:00:00.000Z' }),
      page('mu', { createdAt: '2026-09-01T00:00:00.000Z' }),
    ]);

    renderList();

    expect((await screen.findAllByRole('heading')).map((node) => node.textContent)).toEqual([
      'mu',
      'zeta',
      'alpha',
    ]);
  });

  it('ハイライトは並びを変えず、対象行だけ付ける', async () => {
    const { ref } = renderList();
    await screen.findByRole('heading', { name: 'alpha' });

    await act(async () => {
      ref.current?.highlight('gamma');
    });

    expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(screen.getByRole('heading', { name: 'gamma' }).closest('li')).toHaveClass(
      'page-row--highlight',
    );

    await act(async () => {
      ref.current?.highlight('beta');
    });

    expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(screen.getByRole('heading', { name: 'beta' }).closest('li')).toHaveClass(
      'page-row--highlight',
    );
    expect(screen.getByRole('heading', { name: 'gamma' }).closest('li')).not.toHaveClass(
      'page-row--highlight',
    );
  });

  it('ハイライトは数秒で外れる', async () => {
    const { ref } = renderList();
    await screen.findByRole('heading', { name: 'alpha' });

    vi.useFakeTimers();
    await act(async () => {
      ref.current?.highlight('alpha');
    });
    expect(screen.getByRole('heading', { name: 'alpha' }).closest('li')).toHaveClass(
      'page-row--highlight',
    );

    await act(async () => {
      vi.advanceTimersByTime(PAGE_HIGHLIGHT_MS);
    });
    expect(screen.getByRole('heading', { name: 'alpha' }).closest('li')).not.toHaveClass(
      'page-row--highlight',
    );
  });

  it('行が現れた初回描画からハイライトする', async () => {
    let resolveReload: ((pages: ListedPage[]) => void) | undefined;
    listPages.mockResolvedValueOnce([page('alpha'), page('beta')]).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReload = resolve;
        }),
    );

    const { ref } = renderList();
    await screen.findByRole('heading', { name: 'alpha' });

    await act(async () => {
      ref.current?.highlight('delta');
      const reload = ref.current?.reload();
      if (reload) {
        void reload;
      }
    });

    expect(screen.queryByRole('heading', { name: 'delta' })).toBeNull();
    expect(resolveReload).toBeDefined();

    await act(async () => {
      resolveReload?.([
        page('alpha', { createdAt: '2026-08-01T00:00:00.000Z' }),
        page('beta', { createdAt: '2026-08-01T00:00:00.000Z' }),
        page('delta', { createdAt: '2026-09-13T00:00:00.000Z' }),
      ]);
    });

    const row = screen.getByRole('heading', { name: 'delta' }).closest('li');
    expect(row).toHaveClass('page-row--highlight');
    expect(row).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual([
      'delta',
      'alpha',
      'beta',
    ]);
  });

  it('reload してもハイライト中の行はクラスが残る', async () => {
    const { ref } = renderList();
    await screen.findByRole('heading', { name: 'gamma' });

    await act(async () => {
      ref.current?.highlight('gamma');
    });
    expect(screen.getByRole('heading', { name: 'gamma' }).closest('li')).toHaveClass(
      'page-row--highlight',
    );

    listPages.mockResolvedValueOnce([page('alpha'), page('beta'), page('gamma')]);
    await act(async () => {
      await ref.current?.reload();
    });

    expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(screen.getByRole('heading', { name: 'gamma' }).closest('li')).toHaveClass(
      'page-row--highlight',
    );
  });

  it('再アップロード後の reload でも createdAt 順を保つ', async () => {
    listPages.mockResolvedValue([
      page('keep-old', { createdAt: '2026-01-01T00:00:00.000Z' }),
      page('keep-new', { createdAt: '2026-09-01T00:00:00.000Z' }),
    ]);

    const { ref } = renderList();
    expect((await screen.findAllByRole('heading')).map((node) => node.textContent)).toEqual([
      'keep-new',
      'keep-old',
    ]);

    await act(async () => {
      ref.current?.highlight('keep-old');
    });

    listPages.mockResolvedValueOnce([
      page('keep-old', { createdAt: '2026-01-01T00:00:00.000Z' }),
      page('keep-new', { createdAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    await act(async () => {
      await ref.current?.reload();
    });

    expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual([
      'keep-new',
      'keep-old',
    ]);
    expect(screen.getByRole('heading', { name: 'keep-old' }).closest('li')).toHaveClass(
      'page-row--highlight',
    );
  });
});
