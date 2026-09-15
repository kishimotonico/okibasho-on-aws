import { Lock, LockOpen } from 'lucide-react';

import { messages } from '~/lib/messages';

interface PasswordToggleProps {
  /** true ならパスワードあり */
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/** パスワードのオン/オフを文字とアイコンの両方で示すトグル。UploadOptions と ShareDialog で共用 */
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
