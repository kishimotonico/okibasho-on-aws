import { Check, Copy, EllipsisVertical, SquareArrowOutUpRight } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '~/auth/auth-context';
import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { Menu, MenuItem } from '~/components/Menu';
import { Tooltip } from '~/components/Tooltip';
import { getWebConfig } from '~/config/env';
import { getExpirationStatus } from '~/lib/expiration-status';
import { PAGE_HIGHLIGHT_MS, sortPagesByCreatedAt } from '~/lib/page-list-highlight';
import {
  deletePage,
  listPages,
  type ListedPage,
  type Retention,
  updatePageRetention,
} from '~/lib/pages-s3';
import { shouldWarnImmediateExpiryOnTemporary } from '~/lib/retention-warning';
import { createPagesS3Client } from '~/lib/s3-client';

export interface MyPagesListHandle {
  reload: () => Promise<void>;
  highlight: (slug: string) => void;
}

interface MyPagesListProps {
  onReupload: (slug: string) => void;
  onDeleted?: (slug: string) => void;
}

const COPY_FEEDBACK_MS = 2000;

type ConfirmState =
  | { kind: 'delete'; page: ListedPage }
  | { kind: 'retention'; page: ListedPage; nextRetention: Retention };

export const MyPagesList = forwardRef<MyPagesListHandle, MyPagesListProps>(function MyPagesList(
  { onReupload, onDeleted },
  ref,
) {
  const auth = useAuth();
  const config = useMemo(() => getWebConfig(), []);
  const [pages, setPages] = useState<ListedPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copySlug, setCopySlug] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{
    slug: string;
    gen: number;
  } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const skipCloseAutoFocusRef = useRef(false);

  const loadPages = useCallback(async () => {
    if (!auth.idToken || !auth.email) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const client = createPagesS3Client(config, auth.idToken);
      const result = await listPages(client, config.pagesBucket, auth.email, config.pagesBaseUrl);
      setPages(sortPagesByCreatedAt(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : '一覧の取得に失敗しました';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [auth.email, auth.idToken, config]);

  useImperativeHandle(
    ref,
    () => ({
      reload: loadPages,
      highlight: (slug) => {
        setHighlight((current) => ({
          slug,
          gen: (current?.gen ?? 0) + 1,
        }));
      },
    }),
    [loadPages],
  );

  useEffect(() => {
    if (auth.isAuthenticated && auth.idToken) {
      void loadPages();
    }
  }, [auth.isAuthenticated, auth.idToken, loadPages]);

  const highlightVisible = highlight != null && pages.some((page) => page.slug === highlight.slug);

  useEffect(() => {
    if (!highlight || !highlightVisible) {
      return;
    }

    const id = window.setTimeout(() => {
      setHighlight(null);
    }, PAGE_HIGHLIGHT_MS);

    return () => window.clearTimeout(id);
  }, [highlight, highlightVisible]);

  useEffect(() => {
    if (!copySlug) {
      return;
    }

    const id = window.setTimeout(() => {
      setCopySlug(null);
    }, COPY_FEEDBACK_MS);

    return () => window.clearTimeout(id);
  }, [copySlug]);

  const handleCopyUrl = async (page: ListedPage) => {
    try {
      await navigator.clipboard.writeText(page.viewUrl);
      setCopySlug(page.slug);
      setActionError(null);
    } catch {
      setCopySlug(null);
      setActionError('URL のコピーに失敗しました');
    }
  };

  const handleRetentionChange = async (page: ListedPage, nextRetention: Retention) => {
    if (!auth.idToken || !auth.email || page.retention === nextRetention) {
      return;
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

    setActionError(null);
    setBusySlug(page.slug);

    try {
      const client = createPagesS3Client(config, auth.idToken);
      await deletePage(client, config.pagesBucket, auth.email, page.slug);
      setPages((current) => current.filter((item) => item.slug !== page.slug));
      onDeleted?.(page.slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : '削除に失敗しました';
      setActionError(message);
    } finally {
      setBusySlug(null);
    }
  };

  const confirmDialog = (() => {
    if (!confirm) {
      return null;
    }

    if (confirm.kind === 'delete') {
      return {
        title: 'このページを削除する',
        description: `「${confirm.page.slug}」を削除しますか？この操作は取り消せません。`,
        confirmLabel: '削除',
        danger: true,
        onConfirm: () => {
          setConfirm(null);
          void handleDelete(confirm.page);
        },
      };
    }

    const immediateExpiry = shouldWarnImmediateExpiryOnTemporary(confirm.page.createdAt);
    return {
      title: '保存期間を30日に変更',
      description: immediateExpiry
        ? '30日保存に戻すと、作成から30日以上経過しているため即座に期限切れになります。続行しますか？'
        : '保存期間を30日に変更しますか？',
      confirmLabel: '30日に戻す',
      danger: immediateExpiry,
      onConfirm: () => {
        setConfirm(null);
        void handleRetentionChange(confirm.page, confirm.nextRetention);
      },
    };
  })();

  const handleCloseAutoFocus = useCallback((event: Event) => {
    if (skipCloseAutoFocusRef.current) {
      event.preventDefault();
      skipCloseAutoFocusRef.current = false;
    }
  }, []);

  return (
    <div>
      {confirmDialog ? (
        <ConfirmAlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setConfirm(null);
            }
          }}
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
        />
      ) : null}

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

      {isLoading && pages.length === 0 ? <p className="loading-note">一覧を読み込み中...</p> : null}

      {!isLoading && !loadError && pages.length === 0 ? (
        <p className="empty-note">
          まだページがありません。上のフォームからアップロードしてください。
        </p>
      ) : null}

      {pages.length > 0 ? (
        <ul className="page-stack">
          {pages.map((page) => {
            const expiration = getExpirationStatus(page.expiresAt);
            const isBusy = busySlug === page.slug;
            const copied = copySlug === page.slug;
            const highlighted = highlight?.slug === page.slug;
            const copyLabel = copied ? 'コピーしました' : 'URLをコピー';
            const rowClass = [
              'page-row',
              expiration.kind === 'expired' ? 'page-row--expired' : '',
              highlighted ? 'page-row--highlight' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <li
                key={page.slug}
                className={rowClass}
                data-highlighted={highlighted ? 'true' : undefined}
              >
                <div className="page-row__info">
                  <h3>{page.slug}</h3>
                  <p className="page-row__url">{page.viewUrl}</p>
                  <p
                    className={
                      expiration.kind === 'expired'
                        ? 'page-row__meta page-row__meta--expired'
                        : 'page-row__meta'
                    }
                  >
                    {expiration.label}
                  </p>
                </div>
                <div className="page-row__actions">
                  <Tooltip label="ページを開く">
                    <a
                      className="icon-button"
                      href={page.viewUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="ページを開く"
                    >
                      <SquareArrowOutUpRight size={16} strokeWidth={1.75} aria-hidden />
                    </a>
                  </Tooltip>
                  <Tooltip label={copyLabel}>
                    <button
                      type="button"
                      className={copied ? 'icon-button icon-button--copied' : 'icon-button'}
                      aria-label={copyLabel}
                      disabled={isBusy}
                      onClick={() => void handleCopyUrl(page)}
                    >
                      {copied ? (
                        <Check size={16} strokeWidth={1.75} aria-hidden />
                      ) : (
                        <Copy size={16} strokeWidth={1.75} aria-hidden />
                      )}
                    </button>
                  </Tooltip>
                  <Menu
                    label={`${page.slug}の操作`}
                    tooltip="その他の操作"
                    trigger={<EllipsisVertical size={16} strokeWidth={1.75} aria-hidden />}
                    onCloseAutoFocus={handleCloseAutoFocus}
                  >
                    <MenuItem
                      disabled={isBusy}
                      onSelect={() => {
                        skipCloseAutoFocusRef.current = true;
                        onReupload(page.slug);
                      }}
                    >
                      再アップロード
                    </MenuItem>
                    {page.retention === 'temporary' ? (
                      <MenuItem
                        disabled={isBusy}
                        onSelect={() => void handleRetentionChange(page, 'permanent')}
                      >
                        無期限に変更
                      </MenuItem>
                    ) : (
                      <MenuItem
                        disabled={isBusy}
                        onSelect={() =>
                          setConfirm({ kind: 'retention', page, nextRetention: 'temporary' })
                        }
                      >
                        30日に戻す
                      </MenuItem>
                    )}
                    <MenuItem
                      danger
                      disabled={isBusy}
                      onSelect={() => setConfirm({ kind: 'delete', page })}
                    >
                      削除
                    </MenuItem>
                  </Menu>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});
