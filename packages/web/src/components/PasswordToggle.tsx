import { Lock, LockOpen } from 'lucide-react';

import { messages } from '~/lib/messages';

interface PasswordToggleProps {
  /** true ならパスワードあり */
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * パスワードのオン/オフを文字とアイコンの両方で示すトグル。
 * オフ = LockOpen + 「パスワードなし」（罫線だけの控えめなチップ）。
 * オン = Lock + 「パスワードあり」（セグメントの選択と同じ薄い墨の塗り + 600）。
 * アップロードフォームのチップ列（UploadOptions）と外部共有ダイアログ（ShareDialog）の
 * 両方から使う共通部品。エメラルドは使わない。
 */
export function PasswordToggle({ pressed, disabled = false, onToggle }: PasswordToggleProps) {
  const Icon = pressed ? Lock : LockOpen;
  return (
    <button
      type="button"
      className={`chip chip--toggle${pressed ? ' chip--on' : ''}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden className="chip__icon" />
      {pressed ? messages.sharePasswordChipOn : messages.sharePasswordChipOff}
    </button>
  );
}
