import { Globe, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { Tooltip } from '~/components/Tooltip';
import { UrlField } from '~/components/UrlField';
import { messages } from '~/lib/messages';

interface UploadResultProps {
  slug: string;
  viewUrl: string;
  /** 削除の実行中。ページを消すのは route の仕事なので、状態も上から受ける */
  deleting: boolean;
  onDelete: () => void;
  /** 「外部共有…」。今アップロードしたページの ShareDialog を開く（route 側で一元管理） */
  onShare: () => void;
}

/**
 * 公開できたあとに箱の下へ残るブロック。URL とコピー、外部共有、削除。
 * 「次のファイルを置く」は箱自体の操作になったため、ここにはボタンを持たない
 * （UploadBoxIcon の success クリック → onOpened → Composer がフォームを初期化する）。
 */
export function UploadResult({ slug, viewUrl, deleting, onDelete, onShare }: UploadResultProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  return (
    <div className="upload-result" role="status">
      <ConfirmAlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={messages.deleteDialogTitle}
        description={messages.deleteDialogDescription(slug)}
        confirmLabel={messages.remove}
        danger
        onConfirm={onDelete}
      />

      <UrlField
        url={viewUrl}
        onCopyError={() => setCopyError(messages.copyUrlFailed)}
        onCopySuccess={() => setCopyError(null)}
      />
      {copyError ? <p className="message message--error">{copyError}</p> : null}

      <div className="upload-result__actions">
        <button
          type="button"
          className="button button--ghost upload-result__share"
          onClick={onShare}
        >
          <Globe size={16} strokeWidth={1.75} aria-hidden />
          <span>{messages.share}</span>
        </button>
        <Tooltip label={messages.remove}>
          <button
            type="button"
            className="icon-button upload-result__delete"
            aria-label={messages.remove}
            disabled={deleting}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
