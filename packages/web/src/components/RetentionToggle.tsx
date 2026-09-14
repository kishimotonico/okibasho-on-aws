import type { Retention } from '~/api/pages';

interface RetentionToggleProps {
  value: Retention;
  onChange: (value: Retention) => void;
  disabled: boolean;
}

/** 保存期間の 30日 / 無期限。既定は 30日 */
export function RetentionToggle({ value, onChange, disabled }: RetentionToggleProps) {
  return (
    <div className="retention-field">
      <span className="field-label visually-hidden" id="retention-label">
        保存期間
      </span>
      <div className="seg" role="group" aria-labelledby="retention-label">
        <button
          type="button"
          className={value === 'temporary' ? 'on' : undefined}
          aria-pressed={value === 'temporary'}
          disabled={disabled}
          onClick={() => onChange('temporary')}
        >
          30日
        </button>
        <button
          type="button"
          className={value === 'permanent' ? 'on' : undefined}
          aria-pressed={value === 'permanent'}
          disabled={disabled}
          onClick={() => onChange('permanent')}
        >
          無期限
        </button>
      </div>
    </div>
  );
}
