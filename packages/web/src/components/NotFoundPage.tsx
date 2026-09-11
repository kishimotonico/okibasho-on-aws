import { Link } from '@tanstack/react-router';

export function NotFoundPage() {
  return (
    <div className="page">
      <h1>ページが見つかりません</h1>
      <p>アドレスが違うか、ページが削除されています。</p>
      <p>
        <Link to="/" className="button-link button-link--secondary">
          トップへ戻る
        </Link>
      </p>
    </div>
  );
}
