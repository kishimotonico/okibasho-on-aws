import { createRouter } from '@tanstack/react-router';

import { LoadingShell } from '~/components/LoadingShell';
import { NotFoundPage } from '~/components/NotFoundPage';
import { messages } from '~/lib/messages';
import { routeTree } from './routeTree.gen';

function DefaultPending() {
  return <LoadingShell lead={messages.loadingLead} />;
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: NotFoundPage,
    // SPA シェルの prerender 時は pending コンポーネントがルート内容の代わりに描画される
    defaultPendingComponent: DefaultPending,
    scrollRestoration: true,
  });
}
