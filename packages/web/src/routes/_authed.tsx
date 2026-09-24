import { createFileRoute, Outlet } from '@tanstack/react-router';

import { requireSignedIn } from '~/auth/session';
import { AuthFlowShell } from '~/components/AuthFlowShell';
import { LoadingShell } from '~/components/LoadingShell';
import { UtilityMenu } from '~/components/UtilityMenu';

export const Route = createFileRoute('/_authed')({
  // storage を扱う beforeLoad をサーバーで走らせないための明示
  ssr: false,
  beforeLoad: () => requireSignedIn(`${window.location.pathname}${window.location.search}`),
  component: AuthedLayout,
  // ここが未解決の間（サインイン確認中）だけの全体シェル。配下のルートの pending は
  // router.tsx の defaultPendingComponent（LoadingShell だけ）が main の中に出す
  pendingComponent: AuthedPending,
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

function AuthedPending() {
  return (
    <AuthFlowShell>
      <LoadingShell />
    </AuthFlowShell>
  );
}
