import { Link } from '@tanstack/react-router';

export function NotFoundPage() {
  return (
    <div className="page">
      <h1>404</h1>
      <p>ページが見つかりません。</p>
      <p>
        <Link to="/">トップへ戻る</Link>
      </p>
    </div>
  );
}
