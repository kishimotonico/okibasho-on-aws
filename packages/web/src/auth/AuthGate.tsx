import { useEffect, useRef, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';

import { useAuth } from '~/auth/auth-context';
import { LoadingShell } from '~/components/LoadingShell';
import { UtilityMenu } from '~/components/UtilityMenu';

// 管理UIはチーム内専用でIAMがセキュリティ境界のため、未ログインで見せる画面は用意しない
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

  // 認証確認・未ログイン・loader 待ちを1つの状態にまとめ、常に同じ LoadingShell インスタンスを
  // 描画する（切り替えると弧アニメーションが巻き戻る）。/callback は未ログインのまま loader を
  // 走らせ、失敗したら errorComponent を見せるので、認証の条件だけ外す
  const isLoading = isRoutePending || (!isCallback && (auth.isLoading || !auth.isAuthenticated));

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
      <main className="main">{isLoading ? <LoadingShell /> : children}</main>
    </>
  );
}
