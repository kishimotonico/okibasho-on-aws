import { Link } from '@tanstack/react-router';

import { useAuth } from '~/auth/auth-context';

export function AppHeader() {
  const auth = useAuth();

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo">
          <span aria-hidden="true">📦</span> okibasho
        </Link>
        <button type="button" className="text-button" onClick={() => void auth.logout()}>
          ログアウト
        </button>
      </div>
    </header>
  );
}
