import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="page">
      <h1>Page Share</h1>
      <p>社内向け HTML 共有サービスの管理画面です。</p>
      <p>
        <Link to="/upload" search={{}} className="button-link">
          アップロードへ
        </Link>{' '}
        <Link to="/my-pages" className="button-link button-link--secondary">
          My Pages
        </Link>
      </p>
    </div>
  );
}
