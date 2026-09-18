import { createFileRoute, redirect } from '@tanstack/react-router';

import { signOut } from '~/auth/user-manager';

export const Route = createFileRoute('/logout')({
  // storage を扱う処理をサーバーで走らせないための明示
  ssr: false,
  loader: handleLogout,
});

async function handleLogout(): Promise<void> {
  throw redirect({ href: await signOut() });
}
