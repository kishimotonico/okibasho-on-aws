import {
  buildShareViewPath,
  generateShareId,
  generateSharePassword,
  SHARE_USERNAME,
  type PageShare,
} from '@okibasho/core';
import { Clock, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';

import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { CopyButton } from '~/components/CopyButton';
import { PasswordToggle } from '~/components/PasswordToggle';
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
  /** アップロード直後の自動オープンなど、開いた時点で発行直後だと分かっているとき true */
  justIssued?: boolean;
}

type ConfirmKind = 'recreate' | 'stop' | null;
type Notice = 'issued' | 'stop' | null;

function noticeMessage(notice: Notice): string | null {
  switch (notice) {
    case 'issued':
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
export function ShareDialog({
  open,
  onOpenChange,
  page,
  pagesBaseUrl,
  onSave,
  justIssued,
}: ShareDialogProps) {
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
    // アップロード直後の自動オープンで、開いた時点ですでに発行済みのときは
    // 「共有URLを発行」を押した直後と同じ注意を最初から出す
    setNotice(justIssued && existingShare ? 'issued' : null);
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
      setNotice('issued');
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
      setNotice('issued');
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
              {/* 発行・作り直し直後の注意は、対象のURLの近くに出す */}
              {notice ? <p className="field-hint">{noticeMessage(notice)}</p> : null}
              {page.expiresAt ? (
                <div className="share-meta-row">
                  <Clock size={12} strokeWidth={1.75} aria-hidden />
                  <span>{messages.shareExpiresMeta(formatJstDate(page.expiresAt))}</span>
                </div>
              ) : null}

              <div className="password-toggle-row">
                <PasswordToggle
                  pressed={hasPassword}
                  disabled={saving}
                  onToggle={() => void handlePasswordToggle(!hasPassword)}
                />
              </div>

              {hasPassword ? (
                <div className="password-panel">
                  <div className="password-panel__row">
                    <span className="password-panel__label">{messages.shareUsernameLabel}</span>
                    <span className="password-panel__value">{SHARE_USERNAME}</span>
                    <CopyButton
                      value={SHARE_USERNAME}
                      variant="icon"
                      label={messages.shareUsernameCopy}
                    />
                  </div>
                  <div className="password-panel__row">
                    <span className="password-panel__label">{messages.sharePasswordLabel}</span>
                    <span className="password-panel__value">{existingShare.password}</span>
                    <CopyButton
                      value={existingShare.password!}
                      variant="icon"
                      label={messages.sharePasswordCopy}
                    />
                  </div>
                </div>
              ) : null}

              {error ? <p className="message message--error">{error}</p> : null}

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
              {/* 共有停止の直後はこちらの分岐に切り替わるので、停止の注意書きもここで出す */}
              {notice ? <p className="field-hint">{noticeMessage(notice)}</p> : null}

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
