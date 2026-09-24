import { createFileRoute, redirect } from '@tanstack/react-router';

import { completeSignInCallbackOnce } from '~/auth/session';
import { AuthFlowShell } from '~/components/AuthFlowShell';
import { LoadingShell } from '~/components/LoadingShell';
import { messages } from '~/lib/messages';

export const Route = createFileRoute('/callback')({
  // defaultSsr: false（src/start.ts）で全ルート既定になったが、
  // signinCallback を誤ってサーバーで実行させないための明示
  ssr: false,
  // loader は必ず redirect か例外で終わるので component は無い
  loader: handleCallback,
  pendingComponent: CallbackPending,
  errorComponent: CallbackError,
});

async function handleCallback(): Promise<void> {
  const returnTo = new URL(await completeSignInCallbackOnce(), window.location.origin);
  // "//evil.example" のような returnTo は origin が変わるので "/" 側へ寄せる
  if (returnTo.origin === window.location.origin && returnTo.pathname === '/pages-login') {
    throw redirect({ href: `${returnTo.pathname}${returnTo.search}` });
  }
  // それ以外は "/" 側。?slug=... の再アップロード指定だけは復元する
  const slug = returnTo.searchParams.get('slug');
  throw redirect({ to: '/', search: slug ? { slug } : {} });
}

function CallbackPending() {
  return (
    <AuthFlowShell>
      <LoadingShell />
    </AuthFlowShell>
  );
}

function CallbackError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : messages.loginFailed;
  return (
    <AuthFlowShell>
      <div className="page">
        <h1>{messages.loginErrorTitle}</h1>
        <p>{message}</p>
      </div>
    </AuthFlowShell>
  );
}
