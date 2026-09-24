import { useEffect, useRef, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';

import { useAuth } from '~/auth/auth-context';
import { LoadingShell } from '~/components/LoadingShell';
import { UtilityMenu, UtilityMenuPlaceholder } from '~/components/UtilityMenu';

// 管理UIはチーム内専用でIAMがセキュリティ境界のため、未ログインで見せる画面は用意しない
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname, isRoutePending } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      isRoutePending: state.status === 'pending',
    }),
  });
  // ログインの出入りの途中なので、未ログインに見えても自動ログインをかけない。
  // /logout でかけると、Cognito の /logout への遷移と競合してログアウトできないことがある
  const isAuthFlow = pathname === '/callback' || pathname === '/logout';
  const hasRequestedLogin = useRef(false);

  useEffect(() => {
    if (auth.isLoading || isAuthFlow || auth.isAuthenticated) {
      return;
    }
    if (hasRequestedLogin.current) {
      return;
    }
    hasRequestedLogin.current = true;
    void auth.login(`${window.location.pathname}${window.location.search}`);
  }, [auth, isAuthFlow]);

  // 認証確認・未ログイン・loader 待ちを1つの状態にまとめ、常に同じ LoadingShell インスタンスを
  // 描画する（切り替えると弧アニメーションが巻き戻る）。/callback と /logout は未ログインのまま
  // loader を走らせ、失敗したら errorComponent を見せるので、認証の条件だけ外す
  const isLoading = isRoutePending || (!isAuthFlow && (auth.isLoading || !auth.isAuthenticated));

  return (
    <>
      {/* ここで見せるのは失敗の画面だけなので、メニューは出さず場所だけ空ける */}
      {isLoading || isAuthFlow ? <UtilityMenuPlaceholder /> : <UtilityMenu />}
      <main className="main">{isLoading ? <LoadingShell /> : children}</main>
    </>
  );
}
