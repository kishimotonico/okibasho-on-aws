// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '~/components/Tooltip';
import { UtilityMenu } from '~/components/UtilityMenu';

const logout = vi.fn();
const route = { pathname: '/', authenticated: true };

vi.mock('~/auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: route.authenticated,
    logout,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: route.pathname } }),
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
    route.pathname = '/';
    route.authenticated = true;
  });

  it('ログイン後は右上メニューからログアウトできる', async () => {
    const user = userEvent.setup();
    renderUtilityMenu();

    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    await user.click(await screen.findByRole('menuitem', { name: 'ログアウト' }));

    expect(logout).toHaveBeenCalledOnce();
  });

  it('404 相当のパスでもメニューを出す', () => {
    route.pathname = '/missing';
    renderUtilityMenu();

    expect(screen.getByRole('button', { name: 'メニュー' })).toBeInTheDocument();
  });

  it('/callback では出さない', () => {
    route.pathname = '/callback';
    renderUtilityMenu();

    expect(screen.queryByRole('button', { name: 'メニュー' })).toBeNull();
  });

  it('未ログインでは出さない', () => {
    route.authenticated = false;
    renderUtilityMenu();

    expect(screen.queryByRole('button', { name: 'メニュー' })).toBeNull();
  });
});
