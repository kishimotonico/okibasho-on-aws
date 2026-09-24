import type { ReactNode } from 'react';

import { UtilityMenuPlaceholder } from '~/components/UtilityMenu';

/**
 * ログインの出入り中の画面（認証確認中・/callback・/logout）で共通の外枠。
 * 本物のメニューは出さず、モバイル幅で行を取る分の場所だけ空ける
 */
export function AuthFlowShell({ children }: { children: ReactNode }) {
  return (
    <>
      <UtilityMenuPlaceholder />
      <main className="main">{children}</main>
    </>
  );
}
