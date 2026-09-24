import { createFileRoute, redirect } from '@tanstack/react-router';

import { requireIdToken } from '~/auth/session';
import { getWebConfig } from '~/config/env';
import { messages } from '~/lib/messages';
import { parsePagesReturnUrl, requestPagesCookie } from '~/lib/pages-cookie';

// pages の 403 ページから飛んでくる。Cookie を受け取って元の内部ページへ戻す
export const Route = createFileRoute('/_authed/pages-login')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { return?: string } => ({
    return: typeof search.return === 'string' ? search.return : undefined,
  }),
  loaderDeps: ({ search }) => ({ returnUrl: search.return }),
  // 戻るまで loader を終わらせず、読み込み中の画面は defaultPendingComponent に出させる
  loader: ({ deps }) => issueCookieAndReturn(deps.returnUrl),
  errorComponent: PagesLoginError,
});

async function issueCookieAndReturn(returnValue: string | undefined): Promise<void> {
  const returnUrl = parsePagesReturnUrl(returnValue, getWebConfig().pagesBaseUrl);
  if (!returnUrl) {
    throw redirect({ to: '/' });
  }

  await requestPagesCookie(await requireIdToken());
  window.location.replace(returnUrl);
  await new Promise(() => {});
}

function PagesLoginError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : messages.pagesLoginFailed;
  return (
    <div className="page">
      <h1>{messages.pagesLoginErrorTitle}</h1>
      <p>{message}</p>
    </div>
  );
}
