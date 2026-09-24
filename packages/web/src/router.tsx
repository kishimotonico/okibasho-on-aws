import { createRouter } from '@tanstack/react-router';

import { LoadingShell } from '~/components/LoadingShell';
import { NotFoundPage } from '~/components/NotFoundPage';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
    defaultNotFoundComponent: NotFoundPage,
    // _authed 配下のルート（loader 待ち）向け。認証確認中自体は _authed の pendingComponent が担う
    defaultPendingComponent: LoadingShell,
    defaultPendingMs: 0,
    scrollRestoration: true,
  });
}
