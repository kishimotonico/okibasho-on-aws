// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '~/components/Tooltip';
import { UtilityMenu } from '~/components/UtilityMenu';

const logout = vi.fn();

vi.mock('~/auth/auth-context', () => ({
  useAuth: () => ({ logout }),
}));

function renderUtilityMenu() {
  return render(
    <TooltipProvider>
      <UtilityMenu />
    </TooltipProvider>,
  );
}

describe('UtilityMenu', () => {
  beforeEach(() => {
    logout.mockReset();
  });

  // 表示するかどうかは AuthGate 側で決めるため、ここでは中身の操作だけ確認する
  it('右上メニューからログアウトできる', async () => {
    const user = userEvent.setup();
    renderUtilityMenu();

    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    await user.click(await screen.findByRole('menuitem', { name: 'ログアウト' }));

    expect(logout).toHaveBeenCalledOnce();
  });
});
