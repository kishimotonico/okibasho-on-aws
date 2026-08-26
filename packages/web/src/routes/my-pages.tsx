import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '~/auth/auth-context';
import { getWebConfig } from '~/config/env';
import { getExpirationStatus } from '~/lib/expiration-status';
import { formatDateTime } from '~/lib/format-datetime';
import {
  deletePage,
  listPages,
  type ListedPage,
  type Retention,
  updatePageRetention,
} from '~/lib/pages-s3';
import { shouldWarnImmediateExpiryOnTemporary } from '~/lib/retention-warning';
import { createPagesS3Client } from '~/lib/s3-client';

export const Route = createFileRoute('/my-pages')({
  component: MyPagesPage,
});

function retentionLabel(retention: Retention): string {
  return retention === 'temporary' ? '30日' : '無期限';
}

function MyPagesPage() {
  const auth = useAuth();
  const config = useMemo(() => getWebConfig(), []);
  const [pages, setPages] = useState<ListedPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copySlug, setCopySlug] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    if (!auth.idToken || !auth.email) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const client = createPagesS3Client(config, auth.idToken);
      const result = await listPages(client, config.pagesBucket, auth.email, config.pagesBaseUrl);
      setPages(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '一覧の取得に失敗しました';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [auth.email, auth.idToken, config]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.idToken) {
      void loadPages();
    }
  }, [auth.isAuthenticated, auth.idToken, loadPages]);

  const handleCopyUrl = async (page: ListedPage) => {
    try {
      await navigator.clipboard.writeText(page.viewUrl);
      setCopySlug(page.slug);
    } catch {
      setCopySlug(null);
      setActionError('URL のコピーに失敗しました');
    }
  };

  const handleRetentionChange = async (page: ListedPage, nextRetention: Retention) => {
    if (!auth.idToken || !auth.email || page.retention === nextRetention) {
      return;
    }

    if (page.retention === 'permanent' && nextRetention === 'temporary') {
      const immediateExpiry = shouldWarnImmediateExpiryOnTemporary(page.createdAt);
      const message = immediateExpiry
        ? '30日保存に戻すと、作成から30日以上経過しているため即座に期限切れになります。続行しますか？'
        : '保存期間を30日に変更しますか？';
      if (!window.confirm(message)) {
        return;
      }
    }

    setActionError(null);
    setBusySlug(page.slug);

    try {
      const client = createPagesS3Client(config, auth.idToken);
      const metadata = await updatePageRetention(
        client,
        config.pagesBucket,
        auth.email,
        page.slug,
        nextRetention,
      );

      setPages((current) =>
        current.map((item) =>
          item.slug === page.slug
            ? {
                ...item,
                expiresAt: metadata.expiresAt,
                retention: metadata.expiresAt === null ? 'permanent' : 'temporary',
              }
            : item,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存期間の変更に失敗しました';
      setActionError(message);
    } finally {
      setBusySlug(null);
    }
  };

  const handleDelete = async (page: ListedPage) => {
    if (!auth.idToken || !auth.email) {
      return;
    }

    if (!window.confirm(`「${page.slug}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setActionError(null);
    setBusySlug(page.slug);

    try {
      const client = createPagesS3Client(config, auth.idToken);
      await deletePage(client, config.pagesBucket, auth.email, page.slug);
      setPages((current) => current.filter((item) => item.slug !== page.slug));
    } catch (error) {
      const message = error instanceof Error ? error.message : '削除に失敗しました';
      setActionError(message);
    } finally {
      setBusySlug(null);
    }
  };

  if (auth.isLoading) {
    return (
      <div className="page">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="page">
        <h1>My Pages</h1>
        <p>ページ一覧を見るにはログインが必要です。</p>
        <button type="button" className="button" onClick={() => void auth.login('/my-pages')}>
          ログイン
        </button>
      </div>
    );
  }

  return (
    <div className="page my-pages">
      <h1>My Pages</h1>
      <p>自分がアップロードしたページの一覧です。</p>

      {loadError ? (
        <div className="message message--error">
          <p>{loadError}</p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void loadPages()}
          >
            再読み込み
          </button>
        </div>
      ) : null}

      {actionError ? <pre className="message message--error">{actionError}</pre> : null}

      {isLoading ? <p>一覧を読み込み中...</p> : null}

      {!isLoading && !loadError && pages.length === 0 ? (
        <section className="panel">
          <p>まだページがありません。</p>
          <Link to="/upload" search={{}} className="button-link">
            アップロードへ
          </Link>
        </section>
      ) : null}

      {!isLoading && pages.length > 0 ? (
        <div className="table-wrap">
          <table className="page-table">
            <thead>
              <tr>
                <th>slug</th>
                <th>閲覧 URL</th>
                <th>作成日時</th>
                <th>保存期間</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const expiration = getExpirationStatus(page.expiresAt);
                const isBusy = busySlug === page.slug;

                return (
                  <tr
                    key={page.slug}
                    className={expiration.kind === 'expired' ? 'page-row--expired' : undefined}
                  >
                    <td>
                      <code>{page.slug}</code>
                    </td>
                    <td className="page-table__url">
                      <a href={page.viewUrl} target="_blank" rel="noreferrer">
                        {page.viewUrl}
                      </a>
                    </td>
                    <td>{formatDateTime(page.createdAt)}</td>
                    <td>
                      <div>{retentionLabel(page.retention)}</div>
                      <div
                        className={
                          expiration.kind === 'expired'
                            ? 'expiration expiration--expired'
                            : 'expiration'
                        }
                      >
                        {page.expiresAt
                          ? `削除予定: ${formatDateTime(page.expiresAt)}`
                          : expiration.label}
                      </div>
                      <div className="retention-actions">
                        <button
                          type="button"
                          className="text-button"
                          disabled={isBusy || page.retention === 'temporary'}
                          onClick={() => void handleRetentionChange(page, 'temporary')}
                        >
                          30日
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={isBusy || page.retention === 'permanent'}
                          onClick={() => void handleRetentionChange(page, 'permanent')}
                        >
                          無期限
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          to="/upload"
                          search={{ slug: page.slug }}
                          className="button button--secondary"
                        >
                          再アップロード
                        </Link>
                        <button
                          type="button"
                          className="button button--secondary"
                          disabled={isBusy}
                          onClick={() => void handleCopyUrl(page)}
                        >
                          URL をコピー
                        </button>
                        {copySlug === page.slug ? (
                          <span className="copy-feedback">コピーしました</span>
                        ) : null}
                        <button
                          type="button"
                          className="button button--danger"
                          disabled={isBusy}
                          onClick={() => void handleDelete(page)}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
