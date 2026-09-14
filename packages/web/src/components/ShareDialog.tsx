import {
  buildShareViewPath,
  generateShareId,
  generateSharePassword,
  SHARE_USERNAME,
  type PageShare,
} from '@okibasho/core';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';

import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { CopyButton } from '~/components/CopyButton';
import { Tooltip } from '~/components/Tooltip';
import { UrlField } from '~/components/UrlField';
import { formatJstDate } from '~/lib/expiration-status';
import { messages } from '~/lib/messages';

interface ShareDialogPage {
  slug: string;
  expiresAt: string | null;
  /** 外部共有 URL の tag（11文字）。ListedPage#shareTag をそのまま渡す */
  shareTag: string;
  share?: PageShare;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: ShareDialogPage;
  /** 公開URLのホスト部分（末尾スラッシュなし）。usePagesApi().urlOrigin */
  pagesBaseUrl: string;
  onSave: (share: PageShare | null) => Promise<void>;
}

type ConfirmKind = 'recreate' | 'stop' | null;
type Notice = 'recreate' | 'stop' | null;

function noticeMessage(notice: Notice): string | null {
  switch (notice) {
    case 'recreate':
      return messages.shareNoticeRecreate;
    case 'stop':
      return messages.shareNoticeStop;
    default:
      return null;
  }
}

function buildShareUrl(pagesBaseUrl: string, shareTag: string, id: string): string {
  const base = pagesBaseUrl.replace(/\/$/, '');
  return `${base}${buildShareViewPath(shareTag, id)}`;
}

/**
 * 外部共有の発行・作り直し・停止をひとつのダイアログでまとめる。
 * 秘匿URL（share-id）だけで基本の保護は成立し、パスワードは他社への安心感のための
 * 任意の上乗せ。付けるときだけシステムが自動生成した平文パスワードを、ユーザー名
 * （guest固定）とあわせていつでも読み取り・コピーできる
 */
export function ShareDialog({ open, onOpenChange, page, pagesBaseUrl, onSave }: ShareDialogProps) {
  const existingShare = page.share ?? null;
  const hasPassword = Boolean(existingShare?.password);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmKind>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setNotice(null);
    setConfirmAction(null);
    setError(null);
    // page.slug が変わったとき（別ページを開いたとき）だけ初期化すれば十分
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page.slug]);

  const shareUrl = existingShare
    ? buildShareUrl(pagesBaseUrl, page.shareTag, existingShare.id)
    : null;

  const handleIssue = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ id: generateShareId() });
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.shareIssueFailed);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordToggle = async (next: boolean) => {
    if (!existingShare) {
      return;
    }
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      if (next) {
        await onSave({ ...existingShare, password: generateSharePassword() });
      } else {
        const { password: _password, ...rest } = existingShare;
        await onSave(rest);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : next
            ? messages.sharePasswordOnFailed
            : messages.sharePasswordOffFailed,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRecreateConfirmed = async () => {
    setConfirmAction(null);
    if (!existingShare) {
      return;
    }
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await onSave({
        ...existingShare,
        id: generateShareId(),
        ...(hasPassword ? { password: generateSharePassword() } : {}),
      });
      setNotice('recreate');
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.shareRecreateFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleStopConfirmed = async () => {
    setConfirmAction(null);
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await onSave(null);
      setNotice('stop');
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.shareStopFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog__overlay" />
        <DialogPrimitive.Content className="ui-dialog">
          <Tooltip label={messages.shareClose}>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="icon-button ui-dialog__close"
                aria-label={messages.shareClose}
              >
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </DialogPrimitive.Close>
          </Tooltip>

          <DialogPrimitive.Title className="ui-dialog__title">
            {existingShare ? messages.shareDialogTitleEdit : messages.shareDialogTitleNew}
          </DialogPrimitive.Title>

          {existingShare && shareUrl ? (
            <>
              <DialogPrimitive.Description className="visually-hidden">
                {messages.shareDialogTitleEdit}: {page.slug}
              </DialogPrimitive.Description>

              <UrlField
                url={shareUrl}
                label={messages.shareUrlLabel}
                hideLabel
                onCopyError={() => setError(messages.shareCopyFailed)}
                onCopySuccess={() => setError(null)}
              />
              {page.expiresAt ? (
                <p className="field-hint">
                  {messages.shareExpiresHint(formatJstDate(page.expiresAt))}
                </p>
              ) : null}

              <label className="share-password-toggle">
                <input
                  type="checkbox"
                  checked={hasPassword}
                  disabled={saving}
                  onChange={(event) => void handlePasswordToggle(event.target.checked)}
                />
                {messages.sharePasswordToggle}
              </label>
              {!hasPassword ? (
                <p className="field-hint">{messages.sharePasswordToggleHint}</p>
              ) : null}

              {hasPassword ? (
                <div className="share-credentials">
                  <div className="share-credentials__field">
                    <span className="share-form__field-label">{messages.shareUsernameLabel}</span>
                    <p className="share-credentials__value share-credentials__value--mono">
                      {SHARE_USERNAME}
                    </p>
                  </div>
                  <div className="share-credentials__field">
                    <span className="share-form__field-label">{messages.sharePasswordLabel}</span>
                    <div className="share-credentials__password">
                      <span className="share-credentials__value share-credentials__value--mono">
                        {existingShare.password}
                      </span>
                      <CopyButton
                        value={existingShare.password!}
                        variant="icon"
                        label={messages.sharePasswordCopy}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {error ? <p className="message message--error">{error}</p> : null}
              {notice ? <p className="field-hint">{noticeMessage(notice)}</p> : null}

              <div className="ui-dialog__actions">
                <div className="ui-dialog__actions-secondary">
                  <button
                    type="button"
                    className="text-link"
                    disabled={saving}
                    onClick={() => setConfirmAction('recreate')}
                  >
                    {messages.shareRecreate}
                  </button>
                  <button
                    type="button"
                    className="text-link text-link--danger"
                    disabled={saving}
                    onClick={() => setConfirmAction('stop')}
                  >
                    {messages.shareStop}
                  </button>
                </div>
                {hasPassword ? (
                  <CopyButton
                    value={messages.shareCopyAllText(
                      shareUrl,
                      SHARE_USERNAME,
                      existingShare.password!,
                    )}
                    variant="labeled"
                    label={messages.shareCopyAll}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <>
              <DialogPrimitive.Description className="ui-dialog__description">
                {messages.shareDialogDescriptionNew}
              </DialogPrimitive.Description>

              {error ? <p className="message message--error">{error}</p> : null}

              <div className="ui-dialog__actions">
                <button
                  type="button"
                  className="button"
                  disabled={saving}
                  onClick={() => void handleIssue()}
                >
                  {messages.shareIssue}
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {confirmAction === 'recreate' ? (
        <ConfirmAlertDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setConfirmAction(null);
            }
          }}
          title={messages.shareRecreateDialogTitle}
          description={messages.shareRecreateDialogDescription}
          confirmLabel={messages.shareRecreateConfirm}
          onConfirm={() => void handleRecreateConfirmed()}
        />
      ) : null}

      {confirmAction === 'stop' ? (
        <ConfirmAlertDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setConfirmAction(null);
            }
          }}
          title={messages.shareStopDialogTitle}
          description={messages.shareStopDialogDescription}
          confirmLabel={messages.shareStop}
          danger
          onConfirm={() => void handleStopConfirmed()}
        />
      ) : null}
    </DialogPrimitive.Root>
  );
}
