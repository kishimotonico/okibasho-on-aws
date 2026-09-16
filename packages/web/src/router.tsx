import { createRouter } from '@tanstack/react-router';

import { NotFoundPage } from '~/components/NotFoundPage';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: NotFoundPage,
    scrollRestoration: true,
  });
}
