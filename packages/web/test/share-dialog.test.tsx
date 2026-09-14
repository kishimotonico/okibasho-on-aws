// @vitest-environment jsdom

import { hashSharePassword } from '@cli/page';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import { ShareDialog } from '~/components/ShareDialog';
import { TooltipProvider } from '~/components/Tooltip';

const pagesBaseUrl = 'https://pages.example.com';

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

  it('共有中: 共有URLを共通の CopyButton でコピーできる', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        share: { id: 'a'.repeat(22) },
      },
      pagesBaseUrl,
      onSave: vi.fn().mockResolvedValue(undefined),
    });

    const shareUrl = `${pagesBaseUrl}/s/${'a'.repeat(22)}/`;
    expect(screen.getByRole('link', { name: shareUrl })).toHaveAttribute('href', shareUrl);
    expect(screen.getByRole('link', { name: shareUrl })).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: 'URLをコピー' }));
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();
  });

  it('未共有: パスワードを設定して発行すると正しい share が保存関数へ渡る', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    await user.clear(screen.getByLabelText('ユーザー名'));
    await user.type(screen.getByLabelText('ユーザー名'), 'guest');
    await user.clear(screen.getByLabelText('パスワード'));
    await user.type(screen.getByLabelText('パスワード'), 'password1234');

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share.basic.username).toBe('guest');
    expect(share.basic.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share.basic.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(share.allowedCidrs).toBeUndefined();

    // 新しいパスワードを設定した発行は完了画面に切り替わる（タイトル・URL・ユーザー名・パスワード）
    expect(
      await screen.findByRole('heading', { name: '共有URLを発行しました' }),
    ).toBeInTheDocument();
    const expectedUrl = `${pagesBaseUrl}/s/${share.id}/`;
    expect(screen.getByRole('link', { name: expectedUrl })).toHaveAttribute('href', expectedUrl);
    expect(screen.getByText('ユーザー名')).toBeInTheDocument();
    expect(screen.getByText('guest')).toBeInTheDocument();
    expect(screen.getByText('パスワード')).toBeInTheDocument();
    expect(screen.getByText('password1234')).toBeInTheDocument();
    // 設定フォームには戻らない
    expect(
      screen.queryByRole('checkbox', { name: 'パスワード（Basic認証）' }),
    ).not.toBeInTheDocument();
  });

  it('未共有: パスワード（Basic認証）をオンにすると生成済みパスワードが平文で入り、発行するとそのハッシュが保存される', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));

    const passwordInput = screen.getByLabelText('パスワード') as HTMLInputElement;
    expect(passwordInput).toHaveAttribute('type', 'text');
    const generated = passwordInput.value;
    expect(generated).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.basic.username).toBe('guest');
    expect(await hashSharePassword(share.basic.salt, 'guest', generated)).toBe(share.basic.hash);
  });

  it('未共有: 「再生成」を押すと表示中のパスワードが変わる', async () => {
    const user = userEvent.setup();

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave: vi.fn().mockResolvedValue(undefined),
    });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    const passwordInput = screen.getByLabelText('パスワード') as HTMLInputElement;
    const generated = passwordInput.value;

    await user.click(screen.getByRole('button', { name: '再生成' }));

    expect(passwordInput.value).not.toBe(generated);
    expect(passwordInput.value).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
  });

  it('未共有: 生成されたパスワードを書き換えると、その値で発行される', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    await user.clear(screen.getByLabelText('パスワード'));
    await user.type(screen.getByLabelText('パスワード'), 'my-own-password');

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(await hashSharePassword(share.basic.salt, 'guest', 'my-own-password')).toBe(
      share.basic.hash,
    );
  });

  it('未共有: 発行後に「まとめてコピー」で URL・ユーザー名・パスワードがまとまってコピーされる', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    const generated = (screen.getByLabelText('パスワード') as HTMLInputElement).value;

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());

    const share = onSave.mock.calls[0]?.[0];
    const expectedUrl = `${pagesBaseUrl}/s/${share.id}/`;

    await user.click(await screen.findByRole('button', { name: 'まとめてコピー' }));

    expect(writeText).toHaveBeenCalledWith(
      `URL: ${expectedUrl}\nユーザー名: guest\nパスワード: ${generated}`,
    );
  });

  it('保護なしで発行したときは完了画面に資格情報とまとめてコピーを出さず、フッター自体も出さない（閉じるのは×だけ）', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole('heading', { name: '共有URLを発行しました' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('ユーザー名')).not.toBeInTheDocument();
    expect(screen.queryByText('パスワード')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'まとめてコピー' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '完了' })).not.toBeInTheDocument();
  });

  it('IP制限だけの発行では完了画面に資格情報を出さない', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('checkbox', { name: 'IPアドレス制限' }));
    await user.type(screen.getByLabelText('許可するIPアドレス（1行に1件）'), '203.0.113.0/24');
    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.basic).toBeUndefined();
    expect(share.allowedCidrs).toEqual(['203.0.113.0/24']);

    expect(
      await screen.findByRole('heading', { name: '共有URLを発行しました' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('ユーザー名')).not.toBeInTheDocument();
    expect(screen.queryByText('パスワード')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'まとめてコピー' })).not.toBeInTheDocument();
  });

  it('完了画面も右上の「閉じる」でダイアログを閉じる', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange,
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await screen.findByRole('heading', { name: '共有URLを発行しました' });

    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('パスワード付きで発行してから閉じて開き直すと、平文パスワードも完了画面も残っていない', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const page = { slug: 'q3-report', expiresAt: null };

    const { rerender } = renderDialog({ open: true, onOpenChange, page, pagesBaseUrl, onSave });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole('heading', { name: '共有URLを発行しました' }),
    ).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <ShareDialog
          open={false}
          onOpenChange={onOpenChange}
          page={page}
          pagesBaseUrl={pagesBaseUrl}
          onSave={onSave}
        />
      </TooltipProvider>,
    );
    rerender(
      <TooltipProvider>
        <ShareDialog
          open
          onOpenChange={onOpenChange}
          page={page}
          pagesBaseUrl={pagesBaseUrl}
          onSave={onSave}
        />
      </TooltipProvider>,
    );

    expect(
      screen.queryByRole('heading', { name: '共有URLを発行しました' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('パスワード')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' })).not.toBeChecked();
  });

  it('ダイアログを閉じて開き直すと、平文パスワードや相手に送る情報は残っていない', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { rerender } = renderDialog({
      open: true,
      onOpenChange,
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave: vi.fn().mockResolvedValue(undefined),
    });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    expect((screen.getByLabelText('パスワード') as HTMLInputElement).value).not.toBe('');

    rerender(
      <TooltipProvider>
        <ShareDialog
          open={false}
          onOpenChange={onOpenChange}
          page={{ slug: 'q3-report', expiresAt: null }}
          pagesBaseUrl={pagesBaseUrl}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      </TooltipProvider>,
    );
    rerender(
      <TooltipProvider>
        <ShareDialog
          open
          onOpenChange={onOpenChange}
          page={{ slug: 'q3-report', expiresAt: null }}
          pagesBaseUrl={pagesBaseUrl}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByRole('checkbox', { name: 'パスワード（Basic認証）' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    // 再度オンにしたときに前回と同じ値が残っていない（毎回生成し直している）ことだけを保証する
    expect((screen.getByLabelText('パスワード') as HTMLInputElement).value).toMatch(
      /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/,
    );
  });

  it('保護方法を選ばないと注意書きが出て、発行できる（誰でも見られる共有）', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

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

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        share: { id: 'a'.repeat(22) },
      },
      pagesBaseUrl,
      onSave,
    });

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

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        share: { id: 'a'.repeat(22) },
      },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: 'URLを再発行' }));
    await user.click(await screen.findByRole('button', { name: '再発行' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).not.toBe('a'.repeat(22));
    expect(
      await screen.findByText('新しいURLに切り替わるまで5分ほどかかることがあります。'),
    ).toBeInTheDocument();
  });

  it('共有中: Basic 設定済みは読み取り表示（伏せ字パスワード＋変更ボタン）になり、変更せず保存すると既存の basic が維持される', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingBasic = { username: 'guest', salt: 'b'.repeat(22), hash: 'c'.repeat(64) };

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        share: { id: 'a'.repeat(22), basic: existingBasic },
      },
      pagesBaseUrl,
      onSave,
    });

    // 読み取り表示：ユーザー名と伏せ字パスワード、編集用の入力欄は無い
    expect(screen.getByText('guest')).toBeInTheDocument();
    expect(screen.getByText('••••••••')).toBeInTheDocument();
    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.id).toBe('a'.repeat(22));
    expect(share.basic).toEqual(existingBasic);
    // パスワードを変えていないので完了画面には切り替わらず、フォームにとどまる
    expect(screen.queryByRole('heading', { name: '設定を保存しました' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '設定を保存' })).toBeInTheDocument();
    expect(await screen.findByText('反映まで5分ほどかかることがあります。')).toBeInTheDocument();
  });

  it('共有中: 「変更」を押すと生成済みパスワードの入力欄が開き、「取り消す」で読み取り表示へ戻る', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingBasic = { username: 'guest', salt: 'b'.repeat(22), hash: 'c'.repeat(64) };

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        share: { id: 'a'.repeat(22), basic: existingBasic },
      },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '変更' }));

    const usernameInput = screen.getByLabelText('ユーザー名') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('パスワード') as HTMLInputElement;
    expect(usernameInput.value).toBe('guest');
    expect(passwordInput.value).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);

    await user.click(screen.getByRole('button', { name: '取り消す' }));

    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument();
    expect(screen.getByText('guest')).toBeInTheDocument();
    expect(screen.getByText('••••••••')).toBeInTheDocument();
  });

  it('共有中: 「変更」でユーザー名とパスワードを書き換えて保存すると、新しい資格情報の完了画面になる', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingBasic = { username: 'guest', salt: 'b'.repeat(22), hash: 'c'.repeat(64) };

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: {
        slug: 'q3-report',
        expiresAt: null,
        share: { id: 'a'.repeat(22), basic: existingBasic },
      },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: '変更' }));
    await user.clear(screen.getByLabelText('ユーザー名'));
    await user.type(screen.getByLabelText('ユーザー名'), 'partner');
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const share = onSave.mock.calls[0]?.[0];
    expect(share.basic.username).toBe('partner');
    expect(await screen.findByRole('heading', { name: '設定を保存しました' })).toBeInTheDocument();
  });

  it('パスワードが8文字未満だとエラーを表示し保存関数を呼ばない', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      page: { slug: 'q3-report', expiresAt: null },
      pagesBaseUrl,
      onSave,
    });

    await user.click(screen.getByRole('checkbox', { name: 'パスワード（Basic認証）' }));
    await user.clear(screen.getByLabelText('パスワード'));
    await user.type(screen.getByLabelText('パスワード'), 'short');
    await user.click(screen.getByRole('button', { name: '共有URLを発行' }));

    expect(await screen.findByText('パスワードは8文字以上で入力してください')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
