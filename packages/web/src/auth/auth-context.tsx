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
  getUserManager,
  loadUser,
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
}

const ssrAuthState: AuthState = {
  isLoading: false,
  isAuthenticated: false,
  user: null,
  session: null,
  login: async () => {},
};

const AuthContext = createContext<AuthState | null>(null);

function ClientAuthProvider({ children }: { children: ReactNode }) {
  // useEffect での後付けだと、userLoaded の発火に購読が間に合わないことがある
  const [userManager] = useState<UserManager>(() => getUserManager());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    loadUser()
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

    userManager.events.addUserLoaded(handleUserLoaded);

    return () => {
      active = false;
      userManager.events.removeUserLoaded(handleUserLoaded);
    };
  }, [userManager]);

  const login = useCallback(
    async (returnPath?: string) => {
      saveReturnPath(returnPath ?? `${window.location.pathname}${window.location.search}`);
      await userManager.signinRedirect();
    },
    [userManager],
  );

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      isAuthenticated: user !== null && !user.expired,
      user,
      session: sessionFromUser(user),
      login,
    }),
    [isLoading, login, user],
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
