import {
  buildShareBasic,
  buildShareViewPath,
  generateShareId,
  validateAndNormalizeCidrs,
  validateSharePassword,
  validateShareUsername,
  type PageShare,
} from '@cli/page';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState, type FormEvent } from 'react';

import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { formatDateTime } from '~/lib/format-datetime';

const DEFAULT_USERNAME = 'guest';

interface ShareDialogPage {
  slug: string;
  expiresAt: string | null;
  share?: PageShare;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: ShareDialogPage;
  pagesBaseUrl: string;
  onSave: (share: PageShare | null) => Promise<void>;
}

interface FormErrors {
  username?: string;
  password?: string;
  cidrs?: string;
  general?: string;
}

type SecondaryConfirm = 'reissue' | 'stop' | null;

type Notice = 'save' | 'reissue' | 'stop' | null;

function noticeMessage(notice: Notice, expiresAt: string | null): string | null {
  switch (notice) {
    case 'save': {
      const expiresNotice = expiresAt
        ? `保存期限（${formatDateTime(expiresAt)}）を過ぎると共有も終わります。`
        : '';
      return `反映まで5分ほどかかることがあります。${expiresNotice}`;
    }
    case 'reissue':
      return '新しいURLに切り替わるまで5分ほどかかることがあります。';
    case 'stop':
      return '無効になるまで5分ほどかかることがあります。';
    default:
      return null;
  }
}

function buildShareUrl(pagesBaseUrl: string, id: string): string {
  const base = pagesBaseUrl.replace(/\/$/, '');
  return `${base}${buildShareViewPath(id)}`;
}

function protectionSummary(share: PageShare): string {
  const parts: string[] = [];
  if (share.basic) {
    parts.push(`パスワード（ユーザー名: ${share.basic.username}）`);
  }
  if (share.allowedCidrs && share.allowedCidrs.length > 0) {
    parts.push(`IPアドレス制限（${share.allowedCidrs.length}件）`);
  }
  return parts.length > 0 ? parts.join(' / ') : 'URLを知っている人なら誰でも見られます';
}

export function ShareDialog({ open, onOpenChange, page, pagesBaseUrl, onSave }: ShareDialogProps) {
  const existingShare = page.share ?? null;

  const [withBasic, setWithBasic] = useState(Boolean(existingShare?.basic));
  const [withCidr, setWithCidr] = useState(Boolean(existingShare?.allowedCidrs?.length));
  const [username, setUsername] = useState(existingShare?.basic?.username ?? DEFAULT_USERNAME);
  const [password, setPassword] = useState('');
  const [cidrText, setCidrText] = useState((existingShare?.allowedCidrs ?? []).join('\n'));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmAction, setConfirmAction] = useState<SecondaryConfirm>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setWithBasic(Boolean(existingShare?.basic));
    setWithCidr(Boolean(existingShare?.allowedCidrs?.length));
    setUsername(existingShare?.basic?.username ?? DEFAULT_USERNAME);
    setPassword('');
    setCidrText((existingShare?.allowedCidrs ?? []).join('\n'));
    setErrors({});
    setNotice(null);
    setConfirmAction(null);
    setCopied(false);
    // page.slug が変わったとき（別ページを開いたとき）だけ初期化すれば十分
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page.slug]);

  const shareUrl = existingShare ? buildShareUrl(pagesBaseUrl, existingShare.id) : null;

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrors((current) => ({ ...current, general: 'URL のコピーに失敗しました' }));
    }
  };

  const buildShareFromForm = async (): Promise<PageShare | null> => {
    const nextErrors: FormErrors = {};
    let basic = existingShare?.basic;
    let allowedCidrs: string[] | undefined = existingShare?.allowedCidrs;

    if (withBasic) {
      const passwordEmpty = password.trim() === '';
      const existingBasic = existingShare?.basic;
      const usernameChanged = Boolean(existingBasic) && username !== existingBasic?.username;

      if (passwordEmpty && existingBasic && !usernameChanged) {
        basic = existingBasic;
      } else if (passwordEmpty && existingBasic && usernameChanged) {
        nextErrors.password = 'ユーザー名を変える場合はパスワードも入力してください';
      } else {
        const usernameErrors = validateShareUsername(username);
        const passwordErrors = validateSharePassword(password);
        if (usernameErrors[0]) {
          nextErrors.username = usernameErrors[0].message;
        }
        if (passwordErrors[0]) {
          nextErrors.password = passwordErrors[0].message;
        }
        if (usernameErrors.length === 0 && passwordErrors.length === 0) {
          const result = await buildShareBasic(username, password);
          if (result.ok) {
            basic = result.value;
          } else {
            for (const error of result.errors) {
              nextErrors[error.field as 'username' | 'password'] = error.message;
            }
          }
        }
      }
    } else {
      basic = undefined;
    }

    if (withCidr) {
      const lines = cidrText.split('\n');
      const result = validateAndNormalizeCidrs(lines);
      if (result.ok) {
        allowedCidrs = result.value;
      } else {
        nextErrors.cidrs = result.errors[0]?.message ?? '不正な入力です';
      }
    } else {
      allowedCidrs = undefined;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }

    setErrors({});
    return {
      id: existingShare?.id ?? generateShareId(),
      ...(basic ? { basic } : {}),
      ...(allowedCidrs ? { allowedCidrs } : {}),
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const share = await buildShareFromForm();
    if (!share) {
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      await onSave(share);
      setNotice('save');
      setPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存に失敗しました';
      setErrors((current) => ({ ...current, general: message }));
    } finally {
      setSaving(false);
    }
  };

  const handleReissueConfirmed = async () => {
    setConfirmAction(null);
    if (!existingShare) {
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await onSave({ ...existingShare, id: generateShareId() });
      setNotice('reissue');
    } catch (error) {
      const message = error instanceof Error ? error.message : '再発行に失敗しました';
      setErrors((current) => ({ ...current, general: message }));
    } finally {
      setSaving(false);
    }
  };

  const handleStopConfirmed = async () => {
    setConfirmAction(null);
    setSaving(true);
    setNotice(null);
    try {
      await onSave(null);
      setNotice('stop');
    } catch (error) {
      const message = error instanceof Error ? error.message : '共有停止に失敗しました';
      setErrors((current) => ({ ...current, general: message }));
    } finally {
      setSaving(false);
    }
  };

  const noProtection = !withBasic && !withCidr;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog__overlay" />
        <DialogPrimitive.Content className="ui-dialog">
          <DialogPrimitive.Title className="ui-alert__title">
            {existingShare ? '社外共有の設定' : '社外共有'}
          </DialogPrimitive.Title>

          {existingShare && shareUrl ? (
            <>
              <DialogPrimitive.Description className="visually-hidden">
                「{page.slug}」の社外共有設定を変更します。
              </DialogPrimitive.Description>
              <div className="share-url-field">
                <span className="field-label">共有URL</span>
                <div className="share-url-field__row">
                  <div className="url-input url-input--readonly">
                    <input type="text" value={shareUrl} readOnly aria-label="共有URL" />
                  </div>
                  <div className="share-url-field__actions">
                    <button
                      type="button"
                      className="button button--copy"
                      onClick={() => void handleCopy()}
                    >
                      {copied ? 'コピーしました' : 'URLをコピー'}
                    </button>
                  </div>
                </div>
                <p className="field-hint">現在の保護方法: {protectionSummary(existingShare)}</p>
              </div>
            </>
          ) : (
            <DialogPrimitive.Description className="ui-alert__description">
              社外の人に渡す別のURLを発行します。社内URLはそのまま使えます。
            </DialogPrimitive.Description>
          )}

          <form className="share-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={withBasic}
                  onChange={(event) => setWithBasic(event.target.checked)}
                  disabled={saving}
                />
                パスワード（Basic認証）
              </label>
            </div>

            {withBasic ? (
              <div className="share-form__group">
                <label className="field-label" htmlFor="share-username">
                  ユーザー名
                </label>
                <input
                  id="share-username"
                  type="text"
                  value={username}
                  autoComplete="off"
                  disabled={saving}
                  onChange={(event) => setUsername(event.target.value)}
                />
                {errors.username ? <p className="field-error">{errors.username}</p> : null}

                <label className="field-label" htmlFor="share-password">
                  パスワード
                </label>
                <input
                  id="share-password"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  disabled={saving}
                  placeholder={
                    existingShare?.basic ? '変更する場合だけ入力してください' : undefined
                  }
                  onChange={(event) => setPassword(event.target.value)}
                />
                {errors.password ? <p className="field-error">{errors.password}</p> : null}
              </div>
            ) : null}

            <div className="checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={withCidr}
                  onChange={(event) => setWithCidr(event.target.checked)}
                  disabled={saving}
                />
                IPアドレス制限
              </label>
            </div>

            {withCidr ? (
              <div className="share-form__group">
                <label className="field-label" htmlFor="share-cidrs">
                  許可するIPアドレス（1行に1件）
                </label>
                <textarea
                  id="share-cidrs"
                  className="field-textarea"
                  value={cidrText}
                  disabled={saving}
                  placeholder="203.0.113.0/24"
                  rows={4}
                  onChange={(event) => setCidrText(event.target.value)}
                />
                {errors.cidrs ? <p className="field-error">{errors.cidrs}</p> : null}
              </div>
            ) : null}

            {noProtection ? (
              <p className="field-hint">URLを知っている人なら誰でも見られます</p>
            ) : null}

            {errors.general ? <p className="message message--error">{errors.general}</p> : null}

            {notice ? <p className="field-hint">{noticeMessage(notice, page.expiresAt)}</p> : null}

            <div className="ui-alert__actions">
              <DialogPrimitive.Close asChild>
                <button type="button" className="button button--ghost" disabled={saving}>
                  閉じる
                </button>
              </DialogPrimitive.Close>
              <button type="submit" className="button" disabled={saving}>
                {existingShare ? '設定を保存' : '共有URLを発行'}
              </button>
            </div>
          </form>

          {existingShare ? (
            <div className="share-danger-zone">
              <button
                type="button"
                className="text-button"
                disabled={saving}
                onClick={() => setConfirmAction('reissue')}
              >
                URLを再発行
              </button>
              <button
                type="button"
                className="text-button text-button--danger"
                disabled={saving}
                onClick={() => setConfirmAction('stop')}
              >
                共有を停止
              </button>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {confirmAction === 'reissue' ? (
        <ConfirmAlertDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setConfirmAction(null);
            }
          }}
          title="URLを再発行する"
          description="古いURLが使えなくなるまで5分ほどかかります。続行しますか？"
          confirmLabel="再発行"
          onConfirm={() => void handleReissueConfirmed()}
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
          title="社外共有を停止する"
          description="共有URLが無効になるまで5分ほどかかります。続行しますか？"
          confirmLabel="共有を停止"
          danger
          onConfirm={() => void handleStopConfirmed()}
        />
      ) : null}
    </DialogPrimitive.Root>
  );
}
