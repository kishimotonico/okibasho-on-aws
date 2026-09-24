import { createFileRoute, Outlet } from '@tanstack/react-router';

import { requireSignedIn } from '~/auth/session';
import { UtilityMenu } from '~/components/UtilityMenu';

export const Route = createFileRoute('/_authed')({
  // storage を扱う beforeLoad をサーバーで走らせないための明示
  ssr: false,
  beforeLoad: () => requireSignedIn(`${window.location.pathname}${window.location.search}`),
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <>
      <UtilityMenu />
      <main className="main">
        <Outlet />
      </main>
    </>
  );
}
