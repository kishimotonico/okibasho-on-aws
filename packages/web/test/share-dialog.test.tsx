// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShareDialog } from '~/components/ShareDialog';

const pagesBaseUrl = 'https://pages.example.com';

describe('ShareDialog', () => {
  it('未共有: パスワードを設定して発行すると正しい share が保存関数へ渡る', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        page={{ slug: 'q3-report', expiresAt: null }}
        pagesBaseUrl={pagesBaseUrl}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    await user.clear(screen.getByLabelText('ユーザー名'));
    await user.type(screen.getByLabelText('ユーザー名'), 'guest');
    await user.type(screen.getByLabelText('パスワード'), 'password1234');

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share.basic.username).toBe('guest');
    expect(share.basic.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share.basic.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(share.allowedCidrs).toBeUndefined();
  });

  it('保護方法を選ばないと注意書きが出て、発行できる（誰でも見られる共有）', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        page={{ slug: 'q3-report', expiresAt: null }}
        pagesBaseUrl={pagesBaseUrl}
        onSave={onSave}
      />,
    );

    expect(screen.getByText('URLを知っている人なら誰でも見られます')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.basic).toBeUndefined();
    expect(share.allowedCidrs).toBeUndefined();
  });

  it('共有中: 「共有を停止」を確認すると null が保存関数へ渡る', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        page={{
          slug: 'q3-report',
          expiresAt: null,
          share: { id: 'a'.repeat(22) },
        }}
        pagesBaseUrl={pagesBaseUrl}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: '共有を停止' }));

    const confirmButtons = await screen.findAllByRole('button', { name: '共有を停止' });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
    expect(
      await screen.findByText('無効になるまで5分ほどかかることがあります。'),
    ).toBeInTheDocument();
  });

  it('共有中: 「URLを再発行」を確認すると新しい id で保存され、案内が出る', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        page={{
          slug: 'q3-report',
          expiresAt: null,
          share: { id: 'a'.repeat(22) },
        }}
        pagesBaseUrl={pagesBaseUrl}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'URLを再発行' }));
    await user.click(await screen.findByRole('button', { name: '再発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).not.toBe('a'.repeat(22));
    expect(
      await screen.findByText('新しいURLに切り替わるまで5分ほどかかることがあります。'),
    ).toBeInTheDocument();
  });

  it('共有中: パスワード欄が空欄のまま保存すると既存の basic が維持される', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingBasic = { username: 'guest', salt: 'b'.repeat(22), hash: 'c'.repeat(64) };

    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        page={{
          slug: 'q3-report',
          expiresAt: null,
          share: { id: 'a'.repeat(22), basic: existingBasic },
        }}
        pagesBaseUrl={pagesBaseUrl}
        onSave={onSave}
      />,
    );

    // パスワードを入力せずに保存
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).toBe('a'.repeat(22));
    expect(share.basic).toEqual(existingBasic);
  });

  it('共有中: ユーザー名だけ変えてパスワードを空欄のまま保存するとエラーになり保存されない', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingBasic = { username: 'guest', salt: 'b'.repeat(22), hash: 'c'.repeat(64) };

    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        page={{
          slug: 'q3-report',
          expiresAt: null,
          share: { id: 'a'.repeat(22), basic: existingBasic },
        }}
        pagesBaseUrl={pagesBaseUrl}
        onSave={onSave}
      />,
    );

    await user.clear(screen.getByLabelText('ユーザー名'));
    await user.type(screen.getByLabelText('ユーザー名'), 'partner');
    // パスワードは空欄のまま保存
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    expect(
      await screen.findByText('ユーザー名を変える場合はパスワードも入力してください'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('パスワードが8文字未満だとエラーを表示し保存関数を呼ばない', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        page={{ slug: 'q3-report', expiresAt: null }}
        pagesBaseUrl={pagesBaseUrl}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    await user.type(screen.getByLabelText('パスワード'), 'short');
    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    expect(await screen.findByText('パスワードは8文字以上で入力してください')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
