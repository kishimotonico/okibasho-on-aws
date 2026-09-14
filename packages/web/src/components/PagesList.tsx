import { useState } from 'react';

import type { ListedPage, Retention } from '~/api/pages';
import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { PageRow } from '~/components/PageRow';
import { messages } from '~/lib/messages';
import { shouldWarnImmediateExpiryOnTemporary } from '~/lib/retention-warning';

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
  /** 「外部共有…」。ShareDialog の開閉は route 側で一元管理する */
  onShare: (slug: string) => void;
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
  onShare,
}: PagesListProps) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

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

      {(error ?? copyError) ? <p className="message message--error">{error ?? copyError}</p> : null}

      {pages.length === 0 ? <p className="empty-note">{messages.listEmpty}</p> : null}

      {pages.length > 0 ? (
        <ul className="page-stack">
          {pages.map((page) => (
            <PageRow
              key={page.slug}
              page={page}
              highlighted={page.slug === highlightSlug}
              onReupload={(target) => onReupload(target.slug)}
              onRetentionChange={handleRetentionChange}
              onDelete={(target) => setConfirm({ kind: 'delete', page: target })}
              onShare={(target) => onShare(target.slug)}
              onCopyError={() => setCopyError(messages.copyUrlFailed)}
              onCopySuccess={() => setCopyError(null)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
