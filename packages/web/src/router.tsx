import { createRouter } from '@tanstack/react-router';

import { NotFoundPage } from '~/components/NotFoundPage';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
    defaultNotFoundComponent: NotFoundPage,
    scrollRestoration: true,
  });
}
