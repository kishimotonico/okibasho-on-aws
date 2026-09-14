import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User, UserManager } from 'oidc-client-ts';

import {
  consumeReturnPath,
  getLogoutUrl,
  getUserManager,
  saveReturnPath,
  sessionFromUser,
  type AuthSession,
} from '~/auth/user-manager';

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  /** S3 を呼ぶのに必要な email と idToken。未ログイン・期限切れでは null */
  session: AuthSession | null;
  login: (returnPath?: string) => Promise<void>;
  logout: () => Promise<void>;
  completeSignInCallback: () => Promise<string>;
}

const ssrAuthState: AuthState = {
  isLoading: false,
  isAuthenticated: false,
  user: null,
  session: null,
  login: async () => {},
  logout: async () => {},
  completeSignInCallback: async () => '/',
};

const AuthContext = createContext<AuthState | null>(null);

function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [userManager, setUserManager] = useState<UserManager | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUserManager(getUserManager());
  }, []);

  useEffect(() => {
    if (!userManager) {
      return;
    }

    let active = true;

    userManager
      .getUser()
      .then((loaded) => {
        if (active) {
          setUser(loaded);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    const handleUserLoaded = (loaded: User) => {
      setUser(loaded);
    };
    const handleUserUnloaded = () => {
      setUser(null);
    };

    userManager.events.addUserLoaded(handleUserLoaded);
    userManager.events.addUserUnloaded(handleUserUnloaded);

    return () => {
      active = false;
      userManager.events.removeUserLoaded(handleUserLoaded);
      userManager.events.removeUserUnloaded(handleUserUnloaded);
    };
  }, [userManager]);

  const login = useCallback(
    async (returnPath?: string) => {
      if (!userManager) {
        return;
      }
      saveReturnPath(returnPath ?? `${window.location.pathname}${window.location.search}`);
      await userManager.signinRedirect();
    },
    [userManager],
  );

  const logout = useCallback(async () => {
    if (!userManager) {
      return;
    }
    // Cognitoは標準のRP-Initiated Logoutに対応していないため、
    // ローカルの状態を消してから独自形式の /logout へ自分で飛ばす
    await userManager.removeUser();
    window.location.assign(getLogoutUrl());
  }, [userManager]);

  const completeSignInCallback = useCallback(async () => {
    if (!userManager) {
      return '/';
    }
    await userManager.signinCallback();
    const loaded = await userManager.getUser();
    setUser(loaded);
    return consumeReturnPath();
  }, [userManager]);

  const value = useMemo<AuthState>(
    () => ({
      isLoading: userManager === null || isLoading,
      isAuthenticated: user !== null && !user.expired,
      user,
      session: sessionFromUser(user),
      login,
      logout,
      completeSignInCallback,
    }),
    [completeSignInCallback, isLoading, login, logout, user, userManager],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // prerender / SSR では Cognito 設定を読まず、クライアントだけで認証を初期化する
  if (import.meta.env.SSR) {
    return <AuthContext.Provider value={ssrAuthState}>{children}</AuthContext.Provider>;
  }

  return <ClientAuthProvider>{children}</ClientAuthProvider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth は AuthProvider の内側で使ってください');
  }
  return context;
}
