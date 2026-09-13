import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

export type BoxBubbleKind = 'info' | 'error' | 'confirm';

const AUTO_CLOSE_MS = 6000;

export function BoxBubble({
  kind,
  open,
  children,
  message,
  persist = false,
  onClose,
  onReplace,
  onCancel,
}: {
  kind: BoxBubbleKind;
  open: boolean;
  children: ReactNode;
  message: ReactNode;
  persist?: boolean;
  onClose: () => void;
  onReplace?: () => void;
  onCancel?: () => void;
}) {
  const messageId = useId();
  const onCloseRef = useRef(onClose);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const remainingRef = useRef(AUTO_CLOSE_MS);
  const pausedRef = useRef(false);

  onCloseRef.current = onClose;

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    deadlineRef.current = null;
  };

  const startTimer = (ms: number) => {
    clearTimer();
    remainingRef.current = ms;
    deadlineRef.current = Date.now() + ms;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      deadlineRef.current = null;
      pausedRef.current = false;
      onCloseRef.current();
    }, ms);
  };

  const pauseTimer = () => {
    if (
      kind === 'confirm' ||
      persist ||
      timeoutRef.current === null ||
      deadlineRef.current === null
    ) {
      return;
    }
    remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
    clearTimer();
    pausedRef.current = true;
  };

  const resumeTimer = () => {
    if (kind === 'confirm' || persist || !pausedRef.current) {
      return;
    }
    pausedRef.current = false;
    if (remainingRef.current > 0) {
      startTimer(remainingRef.current);
    }
  };

  useEffect(() => {
    if (!open || kind === 'confirm' || persist || (kind !== 'error' && kind !== 'info')) {
      clearTimer();
      pausedRef.current = false;
      return;
    }

    startTimer(AUTO_CLOSE_MS);

    return () => {
      clearTimer();
      pausedRef.current = false;
    };
  }, [kind, message, open, persist]);

  const stopBubble = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const role = kind === 'error' ? 'alert' : kind === 'info' ? 'status' : 'dialog';

  return (
    <div className="box-bubble">
      {children}
      <div
        className={`box-bubble__reveal${open ? ' box-bubble__reveal--open' : ''}`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="box-bubble__reveal-inner">
          <div
            className={`box-bubble__panel box-bubble__panel--${kind}`}
            role={open ? role : undefined}
            aria-labelledby={open && kind === 'confirm' ? messageId : undefined}
            onClick={stopBubble}
            onPointerDown={stopBubble}
            onPointerEnter={pauseTimer}
            onPointerLeave={resumeTimer}
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
        </div>
      </div>
    </div>
  );
}
