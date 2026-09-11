import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { useAuth } from '~/auth/auth-context';

export const Route = createFileRoute('/callback')({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    auth
      .completeSignInCallback()
      .then((returnTo) => {
        if (active) {
          // ルートは "/" と "/callback" のみのため、ログイン前のパスは常に "/" 側。
          // ただし ?slug=... の再アップロード指定だけは復元する。
          const slug = new URL(returnTo, window.location.origin).searchParams.get('slug');
          void navigate({ to: '/', search: slug ? { slug } : {} });
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const message = err instanceof Error ? err.message : 'ログインに失敗しました';
          setError(message);
        }
      });

    return () => {
      active = false;
    };
  }, [auth, navigate]);

  if (error) {
    return (
      <div className="page">
        <h1>ログインエラー</h1>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <p>ログイン処理中...</p>
    </div>
  );
}
