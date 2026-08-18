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
        <Link to="/upload" className="button-link">
          アップロードへ
        </Link>
      </p>
    </div>
  );
}
