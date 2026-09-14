import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { CopyButton } from '~/components/CopyButton';
import { Tooltip } from '~/components/Tooltip';
import { formatUrlForWrap } from '~/lib/format-url-for-wrap';
import { messages } from '~/lib/messages';

interface UploadResultProps {
  slug: string;
  viewUrl: string;
  /** 削除の実行中。ページを消すのは route の仕事なので、状態も上から受ける */
  deleting: boolean;
  onDelete: () => void;
  onAnother: () => void;
}

/** 公開できたあとに箱の下へ残るブロック。URL とコピー、削除、次のファイルを置く */
export function UploadResult({ slug, viewUrl, deleting, onDelete, onAnother }: UploadResultProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

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

      <a
        className="upload-result__url upload-result__url--primary"
        href={viewUrl}
        target="_blank"
        rel="noreferrer"
      >
        {formatUrlForWrap(viewUrl)}
      </a>
      <div className="upload-result__actions">
        <CopyButton value={viewUrl} variant="labeled" />
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
      <button
        type="button"
        className="button button--ghost upload-result__another"
        onClick={onAnother}
      >
        {messages.uploadAnother}
      </button>
    </div>
  );
}
