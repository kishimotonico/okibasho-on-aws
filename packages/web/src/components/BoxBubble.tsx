import type { MouseEvent, ReactNode } from 'react';
import { useId } from 'react';

export type BoxBubbleKind = 'info' | 'error' | 'confirm';

export function BoxBubble({
  kind,
  open,
  children,
  message,
  onClose,
  onReplace,
  onCancel,
}: {
  kind: BoxBubbleKind;
  open: boolean;
  children: ReactNode;
  message: ReactNode;
  onClose: () => void;
  onReplace?: () => void;
  onCancel?: () => void;
}) {
  const messageId = useId();

  const stopBubble = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const role = kind === 'error' ? 'alert' : kind === 'info' ? 'status' : 'dialog';

  return (
    <div className="box-bubble">
      {children}
      {open ? (
        <div
          className={`box-bubble__panel box-bubble__panel--${kind}`}
          role={role}
          aria-labelledby={kind === 'confirm' ? messageId : undefined}
          onClick={stopBubble}
          onPointerDown={stopBubble}
        >
          <div className="box-bubble__body">
            <p id={messageId} className="box-bubble__message">
              {message}
            </p>
            <button
              type="button"
              className="box-bubble__close"
              aria-label="閉じる"
              onClick={(event) => {
                stopBubble(event);
                onClose();
              }}
            >
              ×
            </button>
          </div>
          {kind === 'confirm' ? (
            <div className="box-bubble__actions">
              <button
                type="button"
                className="button"
                onClick={(event) => {
                  stopBubble(event);
                  onReplace?.();
                }}
              >
                差し替える
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={(event) => {
                  stopBubble(event);
                  (onCancel ?? onClose)();
                }}
              >
                やめる
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
