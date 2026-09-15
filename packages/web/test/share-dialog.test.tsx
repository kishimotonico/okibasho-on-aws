// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import { ShareDialog } from '~/components/ShareDialog';
import { TooltipProvider } from '~/components/Tooltip';

const pagesBaseUrl = 'https://pages.example.com';
const SHARE_TAG = 'b'.repeat(11);

function renderDialog(props: ComponentProps<typeof ShareDialog>) {
  return render(
    <TooltipProvider>
      <ShareDialog {...props} />
    </TooltipProvider>,
  );
}

describe('ShareDialog', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('未共有: 「共有URLを発行」で自動生成されたidだけのshareが保存される（パスワードは付けない）', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null, shareTag: SHARE_TAG },
      pagesBaseUrl,
      onSave,
    });

    expect(screen.getByRole('heading', { name: '外部共有' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share.password).toBeUndefined();
    expect(share.allowedIps).toBeUndefined();
  });

  it('共有中（パスワード無し）: URLは表示するが、ユーザー名・パスワードは表示しない', () => {
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22) },
      },
      pagesBaseUrl,
      onSave: vi.fn().mockResolvedValue(undefined),
    });

    const shareUrl = `${pagesBaseUrl}/s/${SHARE_TAG}${'a'.repeat(22)}/`;
    expect(screen.getByRole('link', { name: shareUrl })).toHaveAttribute('href', shareUrl);
    expect(screen.queryByText('guest')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'パスワードなし' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'まとめてコピー' })).not.toBeInTheDocument();
  });

  it('共有中: 「パスワードを付ける」をオンにすると自動生成されたパスワード付きのshareが保存される', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22) },
      },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: 'パスワードなし' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).toBe('a'.repeat(22));
    expect(share.password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
  });

  it('共有中（パスワード有り）: URL・ユーザー名・パスワードを常に表示し、コピーできる。オフにするとpasswordを外して保存する', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' },
      },
      pagesBaseUrl,
      onSave,
    });

    const shareUrl = `${pagesBaseUrl}/s/${SHARE_TAG}${'a'.repeat(22)}/`;
    expect(screen.getByRole('link', { name: shareUrl })).toHaveAttribute('href', shareUrl);
    expect(screen.getByText('guest')).toBeInTheDocument();
    expect(screen.getByText('k7mq-3xwp-9rtd-h2vn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'パスワードあり' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'URLをコピー' }));
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'パスワードをコピー' }));
    expect(await screen.findAllByRole('button', { name: 'コピーしました' })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'パスワードあり' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ id: 'a'.repeat(22) }));
  });

  it('共有中: 「まとめてコピー」でURL・ユーザー名・パスワードがまとまってコピーされる', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' },
      },
      pagesBaseUrl,
      onSave: vi.fn().mockResolvedValue(undefined),
    });

    const shareUrl = `${pagesBaseUrl}/s/${SHARE_TAG}${'a'.repeat(22)}/`;
    await user.click(screen.getByRole('button', { name: 'まとめてコピー' }));

    expect(writeText).toHaveBeenCalledWith(
      `URL: ${shareUrl}\nユーザー名: guest\nパスワード: k7mq-3xwp-9rtd-h2vn`,
    );
  });

  it('共有中: 保存期限があれば案内を出す', () => {
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: '2026-09-25T04:00:00.000Z',
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' },
      },
      pagesBaseUrl,
      onSave: vi.fn().mockResolvedValue(undefined),
    });

    expect(screen.getByText(/まで$/)).toBeInTheDocument();
  });

  it('共有中: 「共有を停止」を確認すると null が保存関数へ渡る', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' },
      },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '共有を停止' }));

    const confirmButtons = await screen.findAllByRole('button', { name: '共有を停止' });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
    expect(await screen.findByText('無効になるまで数秒かかることがあります。')).toBeInTheDocument();
  });

  it('共有中: 「作り直す」を確認すると新しいidとpasswordの両方が変わって保存される', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' },
      },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '作り直す' }));
    const confirmButtons = await screen.findAllByRole('button', { name: '作り直す' });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).not.toBe('a'.repeat(22));
    expect(share.password).not.toBe('k7mq-3xwp-9rtd-h2vn');
    expect(
      await screen.findByText('開けるようになるまで数秒かかることがあります。'),
    ).toBeInTheDocument();
  });

  it('共有中（パスワード無し）: 「作り直す」は新しいidだけを発行し、パスワードは付けない', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22) },
      },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '作り直す' }));
    const confirmButtons = await screen.findAllByRole('button', { name: '作り直す' });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).not.toBe('a'.repeat(22));
    expect(share.password).toBeUndefined();
  });

  it('保存に失敗するとエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('保存できませんでした'));

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null, shareTag: SHARE_TAG },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument();
  });

  it('×ボタンでダイアログを閉じる', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDialog({
      open: true,
      onOpenChange,
      page: {
        slug: 'q3-report',
        expiresAt: null,
        shareTag: SHARE_TAG,
        share: { id: 'a'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' },
      },
      pagesBaseUrl,
      onSave: vi.fn().mockResolvedValue(undefined),
    });

    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
