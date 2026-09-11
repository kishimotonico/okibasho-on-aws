import type { ReactNode } from 'react';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';

import { AuthProvider } from '~/auth/auth-context';
import { AppHeader } from '~/components/AppHeader';
import { NotFoundPage } from '~/components/NotFoundPage';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'okibasho' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <AppHeader />
          <main className="main">{children}</main>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
