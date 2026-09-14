import { messages } from '~/lib/messages';

export type PageVisibility = 'internal' | 'external';

interface VisibilityToggleProps {
  value: PageVisibility;
  onChange: (value: PageVisibility) => void;
  disabled: boolean;
  /**
   * 対象ページが既に外部共有中のとき true。選択肢を出さず、
   * 「外部共有中（設定はそのまま）」で固定する（差し替えても既存の share を維持する）
   */
  locked: boolean;
}

/** 公開範囲の 内部のみ / 外部にも公開。既定は内部のみ */
export function VisibilityToggle({ value, onChange, disabled, locked }: VisibilityToggleProps) {
  return (
    <div className="visibility-field">
      <span className="field-label visually-hidden" id="visibility-label">
        {messages.shareVisibilityLabel}
      </span>
      <div className="seg" role="group" aria-labelledby="visibility-label">
        {locked ? (
          <button type="button" className="on" disabled aria-pressed="true">
            {messages.shareVisibilityLocked}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={value === 'internal' ? 'on' : undefined}
              aria-pressed={value === 'internal'}
              disabled={disabled}
              onClick={() => onChange('internal')}
            >
              {messages.shareVisibilityInternalOption}
            </button>
            <button
              type="button"
              className={value === 'external' ? 'on' : undefined}
              aria-pressed={value === 'external'}
              disabled={disabled}
              onClick={() => onChange('external')}
            >
              {messages.shareVisibilityExternalOption}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
