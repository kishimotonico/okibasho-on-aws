import { useEffect, useState } from 'react';

import type { ListedPage, Retention } from '~/api/pages';
import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { PageRow } from '~/components/PageRow';
import { messages } from '~/lib/messages';
import { shouldWarnImmediateExpiryOnTemporary } from '~/lib/retention-warning';

const COPY_FEEDBACK_MS = 2000;

type ConfirmState =
  | { kind: 'delete'; page: ListedPage }
  | { kind: 'retention'; page: ListedPage; nextRetention: Retention };

interface PagesListProps {
  pages: readonly ListedPage[];
  /** 直前にアップロードした行。数秒だけ色を付ける */
  highlightSlug: string | null;
  /** 削除や保存期間の変更に失敗したときの文言 */
  error: string | null;
  onReupload: (slug: string) => void;
  onRetentionChange: (page: ListedPage, retention: Retention) => void;
  onDelete: (page: ListedPage) => void;
}

/**
 * アップロード済みページの一覧。データは props で受け取り、
 * S3 を呼ぶのは呼び出し側（route）。ここで持つのは確認ダイアログとコピー表示だけ。
 */
export function PagesList({
  pages,
  highlightSlug,
  error,
  onReupload,
  onRetentionChange,
  onDelete,
}: PagesListProps) {
  const [copySlug, setCopySlug] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  useEffect(() => {
    if (!copySlug) {
      return;
    }

    const id = window.setTimeout(() => setCopySlug(null), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(id);
  }, [copySlug]);

  const handleCopy = async (page: ListedPage) => {
    try {
      await navigator.clipboard.writeText(page.viewUrl);
      setCopySlug(page.slug);
      setCopyError(null);
    } catch {
      setCopySlug(null);
      setCopyError(messages.copyUrlFailed);
    }
  };

  // 無期限への変更は確認なし。30日へ戻すのと削除だけ確認する
  const handleRetentionChange = (page: ListedPage, retention: Retention) => {
    if (retention === 'temporary') {
      setConfirm({ kind: 'retention', page, nextRetention: retention });
      return;
    }
    onRetentionChange(page, retention);
  };

  const confirmDialog = confirm ? buildConfirmDialog(confirm) : null;

  function buildConfirmDialog(state: ConfirmState) {
    if (state.kind === 'delete') {
      return {
        title: messages.deleteDialogTitle,
        description: messages.deleteDialogDescription(state.page.slug),
        confirmLabel: messages.remove,
        danger: true,
        onConfirm: () => {
          setConfirm(null);
          onDelete(state.page);
        },
      };
    }

    const immediateExpiry = shouldWarnImmediateExpiryOnTemporary(state.page.createdAt);
    return {
      title: messages.retentionDialogTitle,
      description: immediateExpiry
        ? messages.retentionDialogImmediateExpiry
        : messages.retentionDialogDescription,
      confirmLabel: messages.toTemporary,
      danger: immediateExpiry,
      onConfirm: () => {
        setConfirm(null);
        onRetentionChange(state.page, state.nextRetention);
      },
    };
  }

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

      {(error ?? copyError) ? (
        <pre className="message message--error">{error ?? copyError}</pre>
      ) : null}

      {pages.length === 0 ? <p className="empty-note">{messages.listEmpty}</p> : null}

      {pages.length > 0 ? (
        <ul className="page-stack">
          {pages.map((page) => (
            <PageRow
              key={page.slug}
              page={page}
              highlighted={page.slug === highlightSlug}
              copied={page.slug === copySlug}
              onCopy={(target) => void handleCopy(target)}
              onReupload={(target) => onReupload(target.slug)}
              onRetentionChange={handleRetentionChange}
              onDelete={(target) => setConfirm({ kind: 'delete', page: target })}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
