import { Link } from '@tanstack/react-router';

import { useAuth } from '~/auth/auth-context';

export function AppHeader() {
  const auth = useAuth();

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo">
          Page Share
        </Link>
        <nav className="nav" aria-label="メイン">
          <Link to="/upload">アップロード</Link>
          <Link to="/my-pages">My Pages</Link>
          {auth.isLoading ? (
            <span className="auth-status">読み込み中...</span>
          ) : auth.isAuthenticated ? (
            <>
              {auth.email ? <span className="auth-status">{auth.email}</span> : null}
              <button type="button" className="text-button" onClick={() => void auth.logout()}>
                ログアウト
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void auth.login(`${window.location.pathname}${window.location.search}`)
              }
            >
              ログイン
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
