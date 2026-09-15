import { useEffect, useRef, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';

import { useAuth } from '~/auth/auth-context';
import { LoadingShell } from '~/components/LoadingShell';
import { messages } from '~/lib/messages';

// 管理UIはチーム内専用でIAMがセキュリティ境界のため、未ログインで見せる画面は用意しない。
// ここで全ページを一括してログインゲートする（/callback はコールバック処理のため素通し）。
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isCallback = pathname === '/callback';
  const hasRequestedLogin = useRef(false);

  useEffect(() => {
    if (auth.isLoading || isCallback || auth.isAuthenticated) {
      return;
    }
    if (hasRequestedLogin.current) {
      return;
    }
    hasRequestedLogin.current = true;
    void auth.login(`${window.location.pathname}${window.location.search}`);
  }, [auth, isCallback]);

  if (isCallback) {
    return <>{children}</>;
  }

  if (auth.isLoading || !auth.isAuthenticated) {
    // この分岐では UtilityMenu・main を描画しないので、LoadingShell 側で main を持つ
    return (
      <main className="main">
        <LoadingShell lead={messages.loadingLead} />
      </main>
    );
  }

  return <>{children}</>;
}
