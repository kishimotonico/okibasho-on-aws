import { createFileRoute, redirect } from '@tanstack/react-router';

import { completeSignInCallbackOnce } from '~/auth/session';
import { UtilityMenuPlaceholder } from '~/components/UtilityMenu';
import { messages } from '~/lib/messages';

export const Route = createFileRoute('/callback')({
  // defaultSsr: false（src/start.ts）で全ルート既定になったが、
  // signinCallback を誤ってサーバーで実行させないための明示
  ssr: false,
  // loader は必ず redirect か例外で終わるので component は無い。読み込み中の画面は __root が出す
  loader: handleCallback,
  errorComponent: CallbackError,
});

async function handleCallback(): Promise<void> {
  throw redirect({ href: await completeSignInCallbackOnce() });
}

// ここだけ _authed の外なので、本物のメニューが無いまま失敗を表示する分の外枠を自前で持つ
function CallbackError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : messages.loginFailed;
  return (
    <>
      <UtilityMenuPlaceholder />
      <main className="main">
        <div className="page">
          <h1>{messages.loginErrorTitle}</h1>
          <p>{message}</p>
        </div>
      </main>
    </>
  );
}
