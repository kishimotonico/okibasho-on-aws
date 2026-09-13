// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BoxBubble } from '~/components/BoxBubble';

describe('BoxBubble', () => {
  it('閉じているとき吹き出しを出さない', () => {
    render(
      <BoxBubble kind="info" open={false} message="案内文" onClose={() => {}}>
        <button type="button">箱</button>
      </BoxBubble>,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: '箱' })).toBeInTheDocument();
  });

  it('info と error の文言を表示する', () => {
    const { rerender } = render(
      <BoxBubble kind="info" open message="PNG または JPEG" onClose={() => {}}>
        <span>箱</span>
      </BoxBubble>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('PNG または JPEG');

    rerender(
      <BoxBubble kind="error" open message="サイズが大きすぎます" onClose={() => {}}>
        <span>箱</span>
      </BoxBubble>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('サイズが大きすぎます');
  });

  it('× で onClose を呼ぶ', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <BoxBubble kind="info" open message="案内文" onClose={onClose}>
        <span>箱</span>
      </BoxBubble>,
    );

    await user.click(screen.getByRole('button', { name: '閉じる' }));

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

  it('吹き出しクリックで箱側 onClick が発火しない', async () => {
    const onBoxClick = vi.fn();
    const user = userEvent.setup();

    render(
      <div onClick={onBoxClick}>
        <BoxBubble kind="info" open message="案内文" onClose={() => {}}>
          <button type="button">箱</button>
        </BoxBubble>
      </div>,
    );

    await user.click(screen.getByText('案内文'));

    expect(onBoxClick).not.toHaveBeenCalled();
  });
});
