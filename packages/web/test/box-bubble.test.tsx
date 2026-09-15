// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BoxBubble } from '~/components/BoxBubble';

describe('BoxBubble', () => {
  it('閉じているとき吹き出しを出さない', () => {
    render(
      <BoxBubble kind="success" open={false} message="案内文" onClose={() => {}}>
        <button type="button">箱</button>
      </BoxBubble>,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: '箱' })).toBeInTheDocument();
  });

  it('success と error の文言を表示する', () => {
    const { rerender } = render(
      <BoxBubble kind="success" open message="公開しました" onClose={() => {}}>
        <span>箱</span>
      </BoxBubble>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('公開しました');

    rerender(
      <BoxBubble kind="error" open message="サイズが大きすぎます" onClose={() => {}}>
        <span>箱</span>
      </BoxBubble>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('サイズが大きすぎます');
  });

  it('success / error は吹き出しのクリックで onClose を呼ぶ', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <BoxBubble kind="success" open message="案内文" onClose={onClose}>
        <span>箱</span>
      </BoxBubble>,
    );

    await user.click(screen.getByText('案内文'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('confirm の差し替える / やめるを扱う', async () => {
    const onClose = vi.fn();
    const onReplace = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <BoxBubble
        kind="confirm"
        open
        message="差し替えますか？"
        onClose={onClose}
        onReplace={onReplace}
        onCancel={onCancel}
      >
        <span>箱</span>
      </BoxBubble>,
    );

    await user.click(screen.getByRole('button', { name: '差し替える' }));
    expect(onReplace).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'やめる' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('onCancel が無いときやめるは onClose を呼ぶ', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <BoxBubble kind="confirm" open message="差し替えますか？" onClose={onClose}>
        <span>箱</span>
      </BoxBubble>,
    );

    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('onCopy 指定時、success の吹き出しをクリックするとコピーして「コピーしました」に変わる', async () => {
    const onCopy = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <BoxBubble kind="success" open message="公開しました" onClose={onClose} onCopy={onCopy}>
        <span>箱</span>
      </BoxBubble>,
    );

    const panel = screen.getByRole('status');
    expect(panel).toHaveAccessibleName(/クリックで公開URLをコピーします/);

    await user.click(screen.getByText('公開しました'));

    expect(onCopy).toHaveBeenCalledOnce();
    // クリックした瞬間は閉じない（コピー成功の合図を一瞬見せてから閉じる）
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(panel).toHaveTextContent('コピーしました'));
  });

  it('onCopy が失敗したら失敗文言を表示し、閉じずに残す', async () => {
    const onCopy = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <BoxBubble kind="success" open message="公開しました" onClose={onClose} onCopy={onCopy}>
        <span>箱</span>
      </BoxBubble>,
    );

    await user.click(screen.getByText('公開しました'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('URL のコピーに失敗しました'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('吹き出しクリックで箱側 onClick が発火しない', async () => {
    const onBoxClick = vi.fn();
    const user = userEvent.setup();

    render(
      <div onClick={onBoxClick}>
        <BoxBubble kind="success" open message="案内文" onClose={() => {}}>
          <button type="button">箱</button>
        </BoxBubble>
      </div>,
    );

    await user.click(screen.getByText('案内文'));

    expect(onBoxClick).not.toHaveBeenCalled();
  });
});
