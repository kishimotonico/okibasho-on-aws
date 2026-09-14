import { RefreshCw } from 'lucide-react';

import { Tooltip } from '~/components/Tooltip';
import { messages } from '~/lib/messages';

interface ShareBasicFieldsProps {
  /** id 衝突を避けるための接頭辞（ShareDialog と Composer が同時に描画されうるため） */
  idPrefix: string;
  username: string;
  password: string;
  usernameError?: string;
  passwordError?: string;
  disabled: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRegenerate: () => void;
}

/**
 * パスワード保護のユーザー名・生成済みパスワード欄。
 * ShareDialog（外部共有ダイアログ）と Composer（アップロード前の設定）の両方から使う共通部品。
 */
export function ShareBasicFields({
  idPrefix,
  username,
  password,
  usernameError,
  passwordError,
  disabled,
  onUsernameChange,
  onPasswordChange,
  onRegenerate,
}: ShareBasicFieldsProps) {
  const usernameId = `${idPrefix}-username`;
  const passwordId = `${idPrefix}-password`;

  return (
    <div className="share-form__row">
      <div className="share-form__field">
        <label className="share-form__field-label" htmlFor={usernameId}>
          {messages.shareUsernameLabel}
        </label>
        <input
          id={usernameId}
          type="text"
          value={username}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onUsernameChange(event.target.value)}
        />
        {usernameError ? <p className="field-error">{usernameError}</p> : null}
      </div>

      <div className="share-form__field share-form__field--password">
        <label className="share-form__field-label" htmlFor={passwordId}>
          {messages.sharePasswordLabel}
        </label>
        <div className="share-form__password-input">
          <input
            id={passwordId}
            type="text"
            value={password}
            autoComplete="new-password"
            disabled={disabled}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
          <Tooltip label={messages.sharePasswordRegenerate}>
            <button
              type="button"
              className="icon-button"
              aria-label={messages.sharePasswordRegenerate}
              disabled={disabled}
              onClick={onRegenerate}
            >
              <RefreshCw size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
        </div>
        {passwordError ? <p className="field-error">{passwordError}</p> : null}
      </div>
    </div>
  );
}
