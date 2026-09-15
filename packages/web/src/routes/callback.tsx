import { createFileRoute, redirect } from '@tanstack/react-router';

import { completeSignInCallbackOnce } from '~/auth/user-manager';
import { messages } from '~/lib/messages';

export const Route = createFileRoute('/callback')({
  // 本番ビルドは prerender した _shell.html を CloudFront の Function で
  // ディープリンクに被せて配信するが、`vite preview` はそれをせず実サーバーで
  // このルートをSSRする。ssr未指定だとその結果（loaderがSSR側では何もせず
  // 終わった「成功」状態）がハイドレーション時にそのまま採用され、
  // クライアントでloaderが再実行されず/callbackが進まなくなる。
  // ssr: false でSSR自体を止め、常にクライアントで実行させる。
  ssr: false,
  loader: handleCallback,
  component: CallbackPending,
  pendingComponent: CallbackPending,
  errorComponent: CallbackError,
});

async function handleCallback(): Promise<void> {
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
