import { useEffect, useRef, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';

import { useAuth } from '~/auth/auth-context';
import { LoadingShell } from '~/components/LoadingShell';
import { UtilityMenu } from '~/components/UtilityMenu';
import { messages } from '~/lib/messages';

// 管理UIはチーム内専用でIAMがセキュリティ境界のため、未ログインで見せる画面は用意しない。
// ここで全ページを一括してログインゲートする（/callback はコールバック処理のため素通し）。
// UtilityMenu・main も含めてここでまとめて出し分ける（トップページの loader 待ちも
// isLoading に含める）。DOM 上の位置を1か所に保つことで、認証確認と loader 待ちの
// 乗り換え時に LoadingShell が作り直されず、弧アニメーションが巻き戻らない
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname, isRoutePending } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      isRoutePending: state.status === 'pending',
    }),
  });
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

  const isLoading = !isCallback && (auth.isLoading || !auth.isAuthenticated || isRoutePending);

  return (
    <>
      {isLoading ? (
        // モバイル幅では UtilityMenu が行を取るため、同じ寸法のプレースホルダーで場所を空けておく
        <div className="utility-menu" aria-hidden>
          <span className="utility-menu__placeholder" />
        </div>
      ) : (
        <UtilityMenu />
      )}
      <main className="main">
        {isLoading ? <LoadingShell lead={messages.loadingLead} /> : children}
      </main>
    </>
  );
}
