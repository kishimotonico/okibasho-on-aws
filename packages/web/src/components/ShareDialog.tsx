import {
  buildShareBasic,
  buildShareViewPath,
  generateShareId,
  generateSharePassword,
  validateAndNormalizeCidrs,
  validateSharePassword,
  validateShareUsername,
  type PageShare,
} from '@okibasho/core';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState, type FormEvent } from 'react';

import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { CopyButton } from '~/components/CopyButton';
import { ShareBasicFields } from '~/components/ShareBasicFields';
import { Tooltip } from '~/components/Tooltip';
import { UrlField } from '~/components/UrlField';
import { formatJstDate } from '~/lib/expiration-status';
import { messages } from '~/lib/messages';

const DEFAULT_USERNAME = 'guest';

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
  /**
   * Composer から「今回新しく外部公開した」直後に開くときだけ渡す。
   * 渡すと開いた瞬間から完了画面（発行しました）で始まる。null はパスワード無しの発行
   * （URL だけの完了画面）、値ありはそのユーザー名・平文パスワードを表示する。
   * 省略時（undefined）は通常どおり設定フォームから始まる
   */
  openIssuedCredentials?: { username: string; password: string } | null;
}

interface FormErrors {
  username?: string;
  password?: string;
  cidrs?: string;
  general?: string;
}

type SecondaryConfirm = 'reissue' | 'stop' | null;
type Notice = 'save' | 'reissue' | 'stop' | null;

/**
 * 発行・保存が成功し、ダイアログの中身を完了画面に切り替えるときの表示内容。
 * credentials は今回新しくパスワードを設定したときだけ入る（IP制限だけ・保護なしの
 * 発行では null で、URL とコピー・「完了」だけの完了画面になる）。
 */
interface CompletionView {
  action: 'issue' | 'save';
  shareUrl: string;
  credentials: { username: string; password: string } | null;
}

function noticeMessage(notice: Notice): string | null {
  switch (notice) {
    case 'save':
      return messages.shareNoticeSave;
    case 'reissue':
      return messages.shareNoticeReissue;
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

/** 外部共有の発行・設定変更・再発行・停止をひとつのダイアログでまとめる */
export function ShareDialog({
  open,
  onOpenChange,
  page,
  pagesBaseUrl,
  onSave,
  openIssuedCredentials,
}: ShareDialogProps) {
  const existingShare = page.share ?? null;

  const [withBasic, setWithBasic] = useState(Boolean(existingShare?.basic));
  const [withCidr, setWithCidr] = useState(Boolean(existingShare?.allowedCidrs?.length));
  const [username, setUsername] = useState(existingShare?.basic?.username ?? DEFAULT_USERNAME);
  const [password, setPassword] = useState('');
  // 発行済みの Basic を編集中かどうか。無ければ常に true（読み取り表示自体が無いので）
  const [editingBasic, setEditingBasic] = useState(!existingShare?.basic);
  const [cidrText, setCidrText] = useState((existingShare?.allowedCidrs ?? []).join('\n'));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmAction, setConfirmAction] = useState<SecondaryConfirm>(null);
  const [completion, setCompletion] = useState<CompletionView | null>(null);

  useEffect(() => {
    if (!open) {
      // 閉じたら平文パスワードと完了画面の内容を残さない
      setPassword('');
      setCompletion(null);
      return;
    }
    setWithBasic(Boolean(existingShare?.basic));
    setWithCidr(Boolean(existingShare?.allowedCidrs?.length));
    setUsername(existingShare?.basic?.username ?? DEFAULT_USERNAME);
    setPassword('');
    setEditingBasic(!existingShare?.basic);
    setCidrText((existingShare?.allowedCidrs ?? []).join('\n'));
    setErrors({});
    setNotice(null);
    setConfirmAction(null);
    // Composer から「今回新しく外部公開した」直後に開いたときは、完了画面から始める
    setCompletion(
      openIssuedCredentials !== undefined && existingShare
        ? {
            action: 'issue',
            shareUrl: buildShareUrl(pagesBaseUrl, page.shareTag, existingShare.id),
            credentials: openIssuedCredentials,
          }
        : null,
    );
    // page.slug が変わったとき（別ページを開いたとき）だけ初期化すれば十分
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page.slug, openIssuedCredentials]);

  /** パスワード欄に生成済みの値を入れる。再生成・新規生成・変更モードへ入るときの両方で使う */
  const handleGeneratePassword = () => {
    setPassword(generateSharePassword());
    setErrors((current) => ({ ...current, password: undefined }));
  };

  const handleWithBasicChange = (checked: boolean) => {
    setWithBasic(checked);
    if (checked) {
      if (existingShare?.basic) {
        // 発行済みの Basic があるところへ戻す/初めてオンにしたときは、まず読み取り表示に戻す
        setEditingBasic(false);
        setUsername(existingShare.basic.username);
        setPassword('');
      } else {
        // 未共有、または Basic が無かったところにチェックを入れたときは、最初から生成済みの入力欄を見せる
        setEditingBasic(true);
        setUsername(DEFAULT_USERNAME);
        handleGeneratePassword();
      }
    } else {
      setPassword('');
      setEditingBasic(!existingShare?.basic);
    }
  };

  /** 読み取り表示の「変更」。ユーザー名は現在値、パスワードは生成済みの値から編集を始める */
  const handleStartEditBasic = () => {
    setEditingBasic(true);
    setUsername(existingShare?.basic?.username ?? DEFAULT_USERNAME);
    handleGeneratePassword();
  };

  /** 変更モードの「取り消す」。発行済みの Basic をそのまま維持する読み取り表示へ戻す */
  const handleCancelEditBasic = () => {
    setEditingBasic(false);
    setUsername(existingShare?.basic?.username ?? DEFAULT_USERNAME);
    setPassword('');
    setErrors((current) => ({ ...current, username: undefined, password: undefined }));
  };

  const shareUrl = existingShare
    ? buildShareUrl(pagesBaseUrl, page.shareTag, existingShare.id)
    : null;

  interface BuildShareFormResult {
    share: PageShare;
    /** 今回新しく設定した平文パスワード。既存を維持した/Basic を使わない場合は null */
    newPlainPassword: string | null;
  }

  const buildShareFromForm = async (): Promise<BuildShareFormResult | null> => {
    const nextErrors: FormErrors = {};
    let basic = existingShare?.basic;
    let allowedCidrs: string[] | undefined = existingShare?.allowedCidrs;
    let newPlainPassword: string | null = null;

    if (withBasic) {
      if (!editingBasic && existingShare?.basic) {
        // 読み取り表示のまま（変更していない）なら既存の Basic を維持する
        basic = existingShare.basic;
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
            newPlainPassword = password;
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
      share: {
        id: existingShare?.id ?? generateShareId(),
        ...(basic ? { basic } : {}),
        ...(allowedCidrs ? { allowedCidrs } : {}),
      },
      newPlainPassword,
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const result = await buildShareFromForm();
    if (!result) {
      return;
    }
    const { share, newPlainPassword } = result;
    // 未発行から発行したのか、発行済みの設定を保存しただけなのかで完了画面のタイトルが変わる
    const wasNewIssue = existingShare === null;

    setSaving(true);
    setNotice(null);
    setCompletion(null);
    try {
      await onSave(share);
      if (wasNewIssue || newPlainPassword) {
        setCompletion({
          action: wasNewIssue ? 'issue' : 'save',
          shareUrl: buildShareUrl(pagesBaseUrl, page.shareTag, share.id),
          credentials:
            newPlainPassword && share.basic
              ? { username: share.basic.username, password: newPlainPassword }
              : null,
        });
      } else {
        setNotice('save');
      }
      setPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.shareSaveFailed;
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
    setCompletion(null);
    try {
      await onSave({ ...existingShare, id: generateShareId() });
      setNotice('reissue');
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.shareReissueFailed;
      setErrors((current) => ({ ...current, general: message }));
    } finally {
      setSaving(false);
    }
  };

  const handleStopConfirmed = async () => {
    setConfirmAction(null);
    setSaving(true);
    setNotice(null);
    setCompletion(null);
    try {
      await onSave(null);
      setNotice('stop');
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.shareStopFailed;
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
            {completion
              ? completion.action === 'issue'
                ? messages.shareCompleteTitleIssue
                : messages.shareCompleteTitleSave
              : existingShare
                ? messages.shareDialogTitleEdit
                : messages.shareDialogTitleNew}
          </DialogPrimitive.Title>

          {completion ? (
            <>
              <DialogPrimitive.Description className="visually-hidden">
                {page.slug}
              </DialogPrimitive.Description>
              <div className="share-complete">
                <UrlField
                  url={completion.shareUrl}
                  label={messages.shareUrlLabel}
                  hideLabel
                  onCopyError={() =>
                    setErrors((current) => ({ ...current, general: messages.shareCopyFailed }))
                  }
                  onCopySuccess={() => setErrors((current) => ({ ...current, general: undefined }))}
                />
                {page.expiresAt ? (
                  <p className="field-hint">
                    {messages.shareExpiresHint(formatJstDate(page.expiresAt))}
                  </p>
                ) : null}

                {completion.credentials ? (
                  <div className="share-complete__credentials">
                    <div className="share-complete__field">
                      <span className="share-form__field-label">{messages.shareUsernameLabel}</span>
                      <p className="share-complete__value share-complete__value--mono">
                        {completion.credentials.username}
                      </p>
                    </div>
                    <div className="share-complete__field">
                      <span className="share-form__field-label">{messages.sharePasswordLabel}</span>
                      <div className="share-complete__password">
                        <span className="share-complete__value share-complete__value--mono">
                          {completion.credentials.password}
                        </span>
                        <CopyButton
                          value={completion.credentials.password}
                          variant="icon"
                          label={messages.sharePasswordCopy}
                        />
                      </div>
                    </div>
                    <p className="field-hint">{messages.shareSentInfoNotice}</p>
                  </div>
                ) : null}

                <p className="field-hint">{messages.shareNoticeSave}</p>

                {errors.general ? <p className="message message--error">{errors.general}</p> : null}
              </div>

              {completion.credentials ? (
                <div className="ui-dialog__actions">
                  <CopyButton
                    value={messages.shareSentInfoText(
                      completion.shareUrl,
                      completion.credentials.username,
                      completion.credentials.password,
                    )}
                    variant="labeled"
                    label={messages.shareSentInfoCopyAll}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              {existingShare && shareUrl ? (
                <>
                  <DialogPrimitive.Description className="visually-hidden">
                    {messages.shareDialogTitleEdit}: {page.slug}
                  </DialogPrimitive.Description>
                  <UrlField
                    url={shareUrl}
                    label={messages.shareUrlLabel}
                    hideLabel
                    onCopyError={() =>
                      setErrors((current) => ({ ...current, general: messages.shareCopyFailed }))
                    }
                    onCopySuccess={() =>
                      setErrors((current) => ({ ...current, general: undefined }))
                    }
                  />
                  {page.expiresAt ? (
                    <p className="field-hint">
                      {messages.shareExpiresHint(formatJstDate(page.expiresAt))}
                    </p>
                  ) : null}
                </>
              ) : (
                <DialogPrimitive.Description className="ui-dialog__description">
                  {messages.shareDialogDescriptionNew}
                </DialogPrimitive.Description>
              )}

              <form className="share-form" onSubmit={(event) => void handleSubmit(event)}>
                <div className="checkbox-field">
                  <label>
                    <input
                      type="checkbox"
                      checked={withBasic}
                      onChange={(event) => handleWithBasicChange(event.target.checked)}
                      disabled={saving}
                    />
                    {messages.shareCheckboxBasic}
                  </label>
                </div>

                {withBasic ? (
                  <div className="share-form__group">
                    {existingShare?.basic ? (
                      <div className="share-form__basic-toggle">
                        <button
                          type="button"
                          className="text-link"
                          disabled={saving}
                          onClick={editingBasic ? handleCancelEditBasic : handleStartEditBasic}
                        >
                          {editingBasic ? messages.shareBasicCancelEdit : messages.shareBasicChange}
                        </button>
                      </div>
                    ) : null}

                    {!editingBasic && existingShare?.basic ? (
                      <div className="share-form__basic-display">
                        <div className="share-form__field">
                          <span className="share-form__field-label">
                            {messages.shareUsernameLabel}
                          </span>
                          <p className="share-form__basic-value">{existingShare.basic.username}</p>
                        </div>
                        <div className="share-form__field">
                          <span className="share-form__field-label">
                            {messages.sharePasswordLabel}
                          </span>
                          <p className="share-form__basic-value share-form__basic-value--mono">
                            {messages.sharePasswordMasked}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <ShareBasicFields
                        idPrefix="share"
                        username={username}
                        password={password}
                        usernameError={errors.username}
                        passwordError={errors.password}
                        disabled={saving}
                        onUsernameChange={setUsername}
                        onPasswordChange={setPassword}
                        onRegenerate={handleGeneratePassword}
                      />
                    )}
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
                    {messages.shareCheckboxCidr}
                  </label>
                </div>

                {withCidr ? (
                  <div className="share-form__group">
                    <label className="share-form__field-label" htmlFor="share-cidrs">
                      {messages.shareCidrTextareaLabel}
                    </label>
                    <textarea
                      id="share-cidrs"
                      className="field-textarea"
                      value={cidrText}
                      disabled={saving}
                      placeholder={messages.shareCidrPlaceholder}
                      rows={4}
                      onChange={(event) => setCidrText(event.target.value)}
                    />
                    {errors.cidrs ? <p className="field-error">{errors.cidrs}</p> : null}
                  </div>
                ) : null}

                {noProtection ? (
                  <p className="field-hint">{messages.shareNoProtectionNotice}</p>
                ) : null}

                {errors.general ? <p className="message message--error">{errors.general}</p> : null}

                {notice ? <p className="field-hint">{noticeMessage(notice)}</p> : null}

                <div className="ui-dialog__actions">
                  {existingShare ? (
                    <div className="ui-dialog__actions-secondary">
                      <button
                        type="button"
                        className="text-link"
                        disabled={saving}
                        onClick={() => setConfirmAction('reissue')}
                      >
                        {messages.shareReissue}
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
                  ) : null}
                  <button type="submit" className="button" disabled={saving}>
                    {existingShare ? messages.shareSave : messages.shareIssue}
                  </button>
                </div>
              </form>
            </>
          )}
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
          title={messages.shareReissueDialogTitle}
          description={messages.shareReissueDialogDescription}
          confirmLabel={messages.shareReissueConfirm}
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
