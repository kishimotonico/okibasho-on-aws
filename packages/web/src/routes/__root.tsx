import type { ReactNode } from 'react';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';

import { AuthGate } from '~/auth/AuthGate';
import { AuthProvider } from '~/auth/auth-context';
import { NotFoundPage } from '~/components/NotFoundPage';
import { TooltipProvider } from '~/components/Tooltip';
import { UtilityMenu } from '~/components/UtilityMenu';
import { getWebConfig } from '~/config/env';
import { queryClient } from '~/lib/query-client';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  head: () => {
    const config = getWebConfig();
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'okibasho' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        // 一覧取得で必ず呼ぶ Cognito Identity と pages バケットの S3 エンドポイントに、
        // 実際のリクエスト前に接続だけ済ませておく
        {
          rel: 'preconnect',
          href: `https://cognito-identity.${config.region}.amazonaws.com`,
          crossOrigin: 'anonymous',
        },
        {
          rel: 'preconnect',
          href: `https://${config.pagesBucket}.s3.${config.region}.amazonaws.com`,
          crossOrigin: 'anonymous',
        },
      ],
    };
  },
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
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <AuthGate>
                <UtilityMenu />
                <main className="main">{children}</main>
              </AuthGate>
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
