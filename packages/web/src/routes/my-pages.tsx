import { createFileRoute, Link } from '@tanstack/react-router';
import type { ListPageItem, Retention, Visibility } from '@page-share/shared';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '~/auth/auth-context';
import { getWebConfig } from '~/config/env';
import { extractApiErrorMessages } from '~/lib/api-errors';
import { getExpirationStatus } from '~/lib/expiration-status';
import { formatBytes } from '~/lib/format-bytes';
import { formatDateTime } from '~/lib/format-datetime';
import {
  deletePage,
  listPages,
  updatePageRetention,
  updatePageTitle,
} from '~/lib/pages-client';
import { shouldWarnImmediateExpiryOnTemporary } from '~/lib/retention-warning';

export const Route = createFileRoute('/my-pages')({
  component: MyPagesPage,
});

function retentionLabel(retention: Retention): string {
  return retention === 'temporary' ? '30日' : '無期限';
}

function visibilityLabel(visibility: Visibility): string {
  return visibility === 'internal' ? '社内限定' : 'URL共有';
}

function visibilityBadgeClass(visibility: Visibility): string {
  return visibility === 'internal'
    ? 'visibility-badge visibility-badge--internal'
    : 'visibility-badge visibility-badge--shared';
}

function resolveApiErrorMessage(
  status: number,
  body: Parameters<typeof extractApiErrorMessages>[0],
): string {
  if (status === 401) {
    return 'ログインの有効期限が切れました。再度ログインしてください。';
  }
  return extractApiErrorMessages(body).join('\n');
}

function MyPagesPage() {
  const auth = useAuth();
  const [pages, setPages] = useState<ListPageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copySlug, setCopySlug] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const loadPages = useCallback(async () => {
    if (!auth.idToken) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    const result = await listPages(fetch, getWebConfig().apiBaseUrl, auth.idToken);
    setIsLoading(false);

    if (!result.ok) {
      setLoadError(resolveApiErrorMessage(result.status, result.body));
      return;
    }

    setPages(result.body.pages);
  }, [auth.idToken]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.idToken) {
      void loadPages();
    }
  }, [auth.isAuthenticated, auth.idToken, loadPages]);

  const handleCopyUrl = async (page: ListPageItem) => {
    try {
      await navigator.clipboard.writeText(page.viewUrl);
      setCopySlug(page.slug);
    } catch {
      setCopySlug(null);
      setActionError('URL のコピーに失敗しました');
    }
  };

  const handleRetentionChange = async (page: ListPageItem, nextRetention: Retention) => {
    if (!auth.idToken || page.retention === nextRetention) {
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

    const result = await updatePageRetention(
      fetch,
      getWebConfig().apiBaseUrl,
      auth.idToken,
      page.slug,
      nextRetention,
    );

    setBusySlug(null);

    if (!result.ok) {
      setActionError(resolveApiErrorMessage(result.status, result.body));
      return;
    }

    setPages((current) =>
      current.map((item) =>
        item.slug === page.slug
          ? {
              ...item,
              retention: result.body.retention,
              expiresAt: result.body.expiresAt,
            }
          : item,
      ),
    );
  };

  const startTitleEdit = (page: ListPageItem) => {
    setEditingSlug(page.slug);
    setEditingTitle(page.title);
    setActionError(null);
  };

  const cancelTitleEdit = () => {
    setEditingSlug(null);
    setEditingTitle('');
  };

  const handleTitleSave = async (page: ListPageItem) => {
    if (!auth.idToken || editingTitle === page.title) {
      cancelTitleEdit();
      return;
    }

    setActionError(null);
    setBusySlug(page.slug);

    const result = await updatePageTitle(
      fetch,
      getWebConfig().apiBaseUrl,
      auth.idToken,
      page.slug,
      editingTitle,
    );

    setBusySlug(null);

    if (!result.ok) {
      setActionError(resolveApiErrorMessage(result.status, result.body));
      return;
    }

    setPages((current) =>
      current.map((item) =>
        item.slug === page.slug
          ? {
              ...item,
              title: result.body.title,
            }
          : item,
      ),
    );
    cancelTitleEdit();
  };

  const handleDelete = async (page: ListPageItem) => {
    if (!auth.idToken) {
      return;
    }

    const label = page.title || page.slug;
    if (!window.confirm(`「${label}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setActionError(null);
    setBusySlug(page.slug);

    const result = await deletePage(fetch, getWebConfig().apiBaseUrl, auth.idToken, page.slug);

    setBusySlug(null);

    if (!result.ok) {
      setActionError(resolveApiErrorMessage(result.status, result.body));
      return;
    }

    setPages((current) => current.filter((item) => item.slug !== page.slug));
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
          {loadError.includes('ログイン') ? (
            <button type="button" className="button" onClick={() => void auth.login('/my-pages')}>
              ログイン
            </button>
          ) : (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void loadPages()}
            >
              再読み込み
            </button>
          )}
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
                <th>タイトル</th>
                <th>公開範囲</th>
                <th>バージョン</th>
                <th>閲覧 URL</th>
                <th>作成日時</th>
                <th>保存期間</th>
                <th>ファイル数</th>
                <th>合計サイズ</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const expiration = getExpirationStatus(page.expiresAt);
                const isBusy = busySlug === page.slug;
                const isEditing = editingSlug === page.slug;

                return (
                  <tr
                    key={page.slug}
                    className={expiration.kind === 'expired' ? 'page-row--expired' : undefined}
                  >
                    <td>
                      {isEditing ? (
                        <div className="title-edit">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            disabled={isBusy}
                          />
                          <div className="title-edit__actions">
                            <button
                              type="button"
                              className="text-button"
                              disabled={isBusy}
                              onClick={() => void handleTitleSave(page)}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              disabled={isBusy}
                              onClick={cancelTitleEdit}
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="title-cell">
                          <div>{page.title || <span className="title-placeholder">（無題）</span>}</div>
                          <button
                            type="button"
                            className="text-button"
                            disabled={isBusy}
                            onClick={() => startTitleEdit(page)}
                          >
                            タイトル編集
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={visibilityBadgeClass(page.visibility)}>
                        {visibilityLabel(page.visibility)}
                      </span>
                    </td>
                    <td>v{page.version}</td>
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
                    <td>{page.fileCount}</td>
                    <td>{formatBytes(page.totalSize)}</td>
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
