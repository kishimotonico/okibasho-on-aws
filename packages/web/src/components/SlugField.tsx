import { isValidSlug } from '@cli/page';
import {
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react';

import { Tooltip } from '~/components/Tooltip';
import { messages } from '~/lib/messages';

interface SlugFieldProps {
  /** 一覧の「再アップロード」からフォーカスを移すために親と共有する */
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  /** 差し替え確認の間、枠を danger 系で強調する */
  overwrite: boolean;
  disabled: boolean;
  /** ツールチップを出してよいか。吹き出しやアップロード中は出さない */
  hintable: boolean;
  urlOrigin: string;
  userPath: string;
}

/**
 * 公開URL。固定部分と slug 入力をひとつの枠に収める。
 * フォーカスで全選択、Esc でフォーカス時の値へ戻す、といった入力の作法をここに閉じる。
 */
export function SlugField({
  inputRef,
  value,
  onChange,
  invalid,
  overwrite,
  disabled,
  hintable,
  urlOrigin,
  userPath,
}: SlugFieldProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  /** フォーカス直後の mouseup を1回だけ打ち消して、クリックで全選択が解けないようにする */
  const justFocusedRef = useRef(false);
  /** Esc で戻す値。フォーカスした時点の内容 */
  const focusValueRef = useRef(value);

  const ariaLabel = userPath ? `公開URL ${urlOrigin}${userPath}${value}` : '公開URL';

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    focusValueRef.current = value;
    event.currentTarget.select();
    justFocusedRef.current = true;
    setTooltipOpen(false);
  };

  const handleMouseUp = (event: MouseEvent<HTMLInputElement>) => {
    if (justFocusedRef.current) {
      event.preventDefault();
      justFocusedRef.current = false;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      onChange(focusValueRef.current);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="url-field">
      <label className="field-label visually-hidden" htmlFor="public-url-slug">
        公開URL
      </label>
      <div className={`url-input${overwrite ? ' url-input--overwrite' : ''}`} tabIndex={-1}>
        {userPath ? (
          <span className="url-input__prefix" aria-hidden="true">
            <span className="url-input__host">{urlOrigin}</span>
            <span className="url-input__user">{userPath}</span>
          </span>
        ) : null}
        <Tooltip label={messages.slugTooltip} side="top" open={hintable && tooltipOpen}>
          <input
            ref={inputRef}
            id="public-url-slug"
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onMouseUp={handleMouseUp}
            onPointerEnter={() => setTooltipOpen(true)}
            onPointerLeave={() => setTooltipOpen(false)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel}
          />
        </Tooltip>
      </div>
    </div>
  );
}

/** 入力中の判定。空欄は「まだ決めていない」であって不正ではない */
export function isSlugInvalid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && !isValidSlug(trimmed);
}
