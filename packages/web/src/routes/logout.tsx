import { createFileRoute, redirect } from '@tanstack/react-router';

import { signOut } from '~/auth/session';
import { AuthFlowShell } from '~/components/AuthFlowShell';
import { LoadingShell } from '~/components/LoadingShell';
import { clearPersistedPages } from '~/lib/query-persistence';
import { clearPagesCredentialsCache } from '~/lib/s3-client';

export const Route = createFileRoute('/logout')({
  // storage を扱う処理をサーバーで走らせないための明示
  ssr: false,
  loader: handleLogout,
  pendingComponent: LogoutPending,
});

async function handleLogout(): Promise<void> {
  const href = await signOut();
  await clearPersistedPages();
  clearPagesCredentialsCache();
  throw redirect({ href });
}

function LogoutPending() {
  return (
    <AuthFlowShell>
      <LoadingShell />
    </AuthFlowShell>
  );
}
