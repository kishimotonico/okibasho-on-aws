// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu, MenuItem } from '~/components/Menu';
import { TooltipProvider } from '~/components/Tooltip';

function renderMenu() {
  const onLogout = vi.fn();
  const onSettings = vi.fn();
  const user = userEvent.setup();

  render(
    <TooltipProvider>
      <Menu label="メニュー" tooltip="メニュー" trigger={<span>icon</span>}>
        <MenuItem onSelect={onLogout}>ログアウト</MenuItem>
        <MenuItem onSelect={onSettings}>設定</MenuItem>
      </Menu>
    </TooltipProvider>,
  );

  return { user, onLogout, onSettings };
}

describe('Menu', () => {
  it('トリガーは menu の aria を持ち、hover では開かない', async () => {
    const { user } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'メニュー' });

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.hover(trigger);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('click で開き、項目を選べる', async () => {
    const { user, onLogout } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'メニュー' });

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'ログアウト' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'ログアウト' }));

    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Esc で閉じてトリガーへフォーカスが戻る', async () => {
    const { user } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'メニュー' });

    await user.click(trigger);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
  it('矢印キーで項目を移動できる', async () => {
    const { user } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    await screen.findByRole('menu');

    const logout = screen.getByRole('menuitem', { name: 'ログアウト' });
    const settings = screen.getByRole('menuitem', { name: '設定' });

    await user.keyboard('{ArrowDown}');
    expect(logout).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(settings).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(logout).toHaveFocus();
  });

  it('tooltip は hover とキーボードフォーカスの両方で出る', async () => {
    const { user } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'メニュー' });

    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('メニュー');

    await user.unhover(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    trigger.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('メニュー');
  });
});
