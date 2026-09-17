import { createFileRoute, redirect } from '@tanstack/react-router';

import { getLogoutUrl, getUserManager } from '~/auth/user-manager';
import { clearPersistedPages } from '~/lib/query-persistence';
import { clearPagesCredentialsCache } from '~/lib/s3-client';

export const Route = createFileRoute('/logout')({
  // storage を扱う処理をサーバーで走らせないための明示
  ssr: false,
  loader: handleLogout,
});

async function handleLogout(): Promise<void> {
  await clearPersistedPages();
  clearPagesCredentialsCache();
  await getUserManager().removeUser();
  throw redirect({ href: getLogoutUrl() });
}
