import type { ReactNode } from 'react';
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';

import { SessionBanner } from '~/auth/SessionBanner';
import { LoadingShell } from '~/components/LoadingShell';
import { NotFoundPage } from '~/components/NotFoundPage';
import { TooltipProvider } from '~/components/Tooltip';
import { UtilityMenuPlaceholder } from '~/components/UtilityMenu';
import { getWebConfig } from '~/config/env';
import { queryClient } from '~/lib/query-client';
import { pagesPreconnectUrls } from '~/lib/s3-client';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  head: () => {
    const config = getWebConfig();
    // AppUrl の CfnOutput は末尾に `/` が付くため、og:image 側で正規化する
    const appBaseUrl = config.appBaseUrl.replace(/\/$/, '');
    const description = '生成した HTML を URL ひとつでチームに共有します。';
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'okibasho' },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'okibasho' },
        { property: 'og:title', content: 'okibasho' },
        { property: 'og:description', content: description },
        { property: 'og:image', content: `${appBaseUrl}/ogp.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: `${import.meta.env.BASE_URL}favicon.svg`, type: 'image/svg+xml' },
        ...pagesPreconnectUrls(config).map((href) => ({
          rel: 'preconnect',
          href,
          crossOrigin: 'anonymous' as const,
        })),
      ],
    };
  },
  notFoundComponent: NotFoundPage,
  component: RootComponent,
  shellComponent: RootDocument,
});

/**
 * 認証確認中・認証ゲートの beforeLoad・loader のどれが pending でも router 全体は
 * status: 'pending' になる。ここで一括りに LoadingShell へ差し替えることで、
 * ハイドレーションからページ表示までを同じ1インスタンスにする（差し替えるたびに弧アニメーションが巻き戻るため）。
 * _authed 配下は ssr:false（サーバーでは読み込まない）なので SSR 時点では status が
 * 'pending' にならず、prerender の _shell.html にこの画面を焼き込むには SSR 自体も明示的にローディング扱いにする
 */
function RootComponent() {
  const isRoutePending = useRouterState({ select: (state) => state.status === 'pending' });
  if (import.meta.env.SSR || isRoutePending) {
    return (
      <>
        <UtilityMenuPlaceholder />
        <main className="main">
          <LoadingShell />
        </main>
      </>
    );
  }
  return <Outlet />;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <SessionBanner />
            {children}
          </TooltipProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
