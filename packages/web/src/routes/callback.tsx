import { createFileRoute, redirect } from '@tanstack/react-router';

import { completeSignInCallbackOnce } from '~/auth/user-manager';
import { messages } from '~/lib/messages';

export const Route = createFileRoute('/callback')({
  loader: handleCallback,
  component: CallbackPending,
  pendingComponent: CallbackPending,
  errorComponent: CallbackError,
});

async function handleCallback(): Promise<void> {
  if (import.meta.env.SSR) {
    // prerender では Cognito とやり取りせず、クライアントの初回アクセス時だけ処理する
    return;
  }

  const returnTo = await completeSignInCallbackOnce();
  // ルートは "/" と "/callback" のみのため、ログイン前のパスは常に "/" 側。
  // ただし ?slug=... の再アップロード指定だけは復元する。
  const slug = new URL(returnTo, window.location.origin).searchParams.get('slug');
  throw redirect({ to: '/', search: slug ? { slug } : {} });
}

function CallbackPending() {
  return (
    <div className="page">
      <p>{messages.loginInProgress}</p>
    </div>
  );
}

function CallbackError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : messages.loginFailed;
  return (
    <div className="page">
      <h1>{messages.loginErrorTitle}</h1>
      <p>{message}</p>
    </div>
  );
}
