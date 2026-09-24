import { createFileRoute } from '@tanstack/react-router';

import { requireSignedIn } from '~/auth/session';

// アプリの枠（メニュー・main）は __root の shellComponent が出す。ここは認証ゲートのみ
export const Route = createFileRoute('/_authed')({
  // storage を扱う beforeLoad をサーバーで走らせないための明示
  ssr: false,
  beforeLoad: () => requireSignedIn(`${window.location.pathname}${window.location.search}`),
});
