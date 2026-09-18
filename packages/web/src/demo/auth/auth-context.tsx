import { createContext, useContext, useEffect, useState } from 'react';

import type { AuthState } from '~/auth/auth-context';

import { DemoCard } from '../DemoCard';
import { demoSession } from './user-manager';

/** 本物（~/auth/auth-context）と同じ export を、同じ型で用意する */
type AuthContextModule = typeof import('~/auth/auth-context');

const demoAuthState: AuthState = {
  isLoading: false,
  isAuthenticated: true,
  user: null,
  session: demoSession,
  login: async () => {},
};

const loadingAuthState: AuthState = { ...demoAuthState, isLoading: true };

const AuthContext = createContext<AuthState>(demoAuthState);

export const AuthProvider: AuthContextModule['AuthProvider'] = ({ children }) => {
  // 本物と同じく最初は認証確認中として描き、prerender の _shell.html に読み込み表示を焼き込む
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => setIsLoading(false), []);

  return (
    <AuthContext.Provider value={isLoading ? loadingAuthState : demoAuthState}>
      <DemoCard />
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth: AuthContextModule['useAuth'] = () => useContext(AuthContext);
