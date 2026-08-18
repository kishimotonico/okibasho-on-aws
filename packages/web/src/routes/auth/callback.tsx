import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { useAuth } from '~/auth/auth-context';

export const Route = createFileRoute('/auth/callback')({
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
          if (returnTo === '/upload') {
            void navigate({ to: '/upload' });
          } else {
            void navigate({ to: '/' });
          }
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
