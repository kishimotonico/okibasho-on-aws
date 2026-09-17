import type { AuthState } from '~/auth/auth-context';
import { clearPersistedPages } from '~/lib/query-persistence';

import { DemoBadge } from '../DemoBadge';
import { resetDemoPages } from '../lib/s3-client';
import { demoSession } from './user-manager';

/** 本物（~/auth/auth-context）と同じ export を、同じ型で用意する */
type AuthContextModule = typeof import('~/auth/auth-context');

const demoAuthState: AuthState = {
  isLoading: false,
  isAuthenticated: true,
  user: null,
  session: demoSession,
  login: async () => {},
  // デモにログアウトは無いので、メニューの「ログアウト」は見本のページからやり直すリセットにする
  logout: async () => {
    resetDemoPages();
    // 復元された query キャッシュが古い行を出さないよう、保存済みキャッシュも捨ててから読み直す
    await clearPersistedPages();
    window.location.reload();
  },
};

export const AuthProvider: AuthContextModule['AuthProvider'] = ({ children }) => (
  <>
    <DemoBadge />
    {children}
  </>
);

export const useAuth: AuthContextModule['useAuth'] = () => demoAuthState;
