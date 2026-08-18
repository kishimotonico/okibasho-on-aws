import { createRouter } from '@tanstack/react-router';

import { NotFoundPage } from '~/components/NotFoundPage';
import { PendingFallback } from '~/components/PendingFallback';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: NotFoundPage,
    // SPA シェルの prerender 時は pending コンポーネントがルート内容の代わりに描画される
    defaultPendingComponent: PendingFallback,
    scrollRestoration: true,
  });
}
