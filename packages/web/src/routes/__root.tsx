import type { ReactNode } from 'react';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';

import { AuthGate } from '~/auth/AuthGate';
import { AuthProvider } from '~/auth/auth-context';
import { NotFoundPage } from '~/components/NotFoundPage';
import { TooltipProvider } from '~/components/Tooltip';
import { UtilityMenu } from '~/components/UtilityMenu';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'okibasho' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
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
          <TooltipProvider>
            <AuthGate>
              <UtilityMenu />
              <main className="main">{children}</main>
            </AuthGate>
          </TooltipProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
