import type { AuthState } from '~/auth/auth-context';

import { DemoTag } from '../DemoTag';
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

export const AuthProvider: AuthContextModule['AuthProvider'] = ({ children }) => (
  <>
    <DemoTag />
    {children}
  </>
);

export const useAuth: AuthContextModule['useAuth'] = () => demoAuthState;
