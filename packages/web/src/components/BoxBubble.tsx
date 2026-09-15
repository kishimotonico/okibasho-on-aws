import { Check, Copy } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { messages } from '~/lib/messages';

export type BoxBubbleKind = 'error' | 'confirm' | 'success';

const AUTO_CLOSE_MS = 6000;
/** コピー成功後、吹き出しを閉じるまでの短い間（形で示してから消える） */
const COPIED_CLOSE_MS = 700;

function autoClosableKind(kind: BoxBubbleKind) {
  return kind === 'error' || kind === 'success';
}

export function BoxBubble({
  kind,
  open,
  children,
  message,
  persist = false,
  onClose,
  onReplace,
  onCancel,
  onCopy,
  copyAriaLabel,
}: {
  kind: BoxBubbleKind;
  open: boolean;
  children: ReactNode;
  message: ReactNode;
  persist?: boolean;
  onClose: () => void;
  onReplace?: () => void;
  onCancel?: () => void;
  /**
   * kind === 'success' のときだけ有効。指定すると、吹き出しのクリック（または
   * Enter/Space）でコピーを実行する。成功したら一瞬 Check アイコン＋「コピーしました」
   * に切り替えてからフェードで閉じる。失敗したら「URL のコピーに失敗しました」を
   * 表示したまま通常の自動消去（6秒）に任せる
   */
  onCopy?: () => Promise<boolean>;
  /** onCopy 指定時、コピーできることを支援技術へ伝える aria-label */
  copyAriaLabel?: string;
}) {
  const messageId = useId();
  const onCloseRef = useRef(onClose);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const remainingRef = useRef(AUTO_CLOSE_MS);
  const pausedRef = useRef(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

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
    setCopyState('idle');

    if (!open || persist || !autoClosableKind(kind)) {
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

  const role = kind === 'error' ? 'alert' : kind === 'confirm' ? 'dialog' : 'status';
  const clickToClose = kind === 'error' || kind === 'success';
  /** success のみ、かつ onCopy が渡されたときだけ吹き出しがコピー操作になる */
  const copyable = kind === 'success' && Boolean(onCopy);

  const runCopy = async () => {
    const ok = (await onCopy?.()) ?? false;
    if (ok) {
      setCopyState('copied');
      startTimer(COPIED_CLOSE_MS);
    } else {
      setCopyState('failed');
      startTimer(AUTO_CLOSE_MS);
    }
  };

  const displayMessage =
    copyState === 'copied'
      ? messages.copied
      : copyState === 'failed'
        ? messages.copyUrlFailed
        : message;

  return (
    <div className="box-bubble">
      {children}
      <div
        className={`box-bubble__reveal${open ? ' box-bubble__reveal--open' : ''}`}
        aria-hidden={!open}
        inert={!open}
      >
        <div
          className={`box-bubble__panel box-bubble__panel--${kind}${
            clickToClose ? ' box-bubble__panel--clickable' : ''
          }${copyState === 'copied' ? ' box-bubble__panel--copied' : ''}`}
          role={open ? role : undefined}
          aria-labelledby={open && kind === 'confirm' ? messageId : undefined}
          aria-label={
            open && copyable ? (copyAriaLabel ?? messages.uploadedCopyAriaLabel) : undefined
          }
          tabIndex={open && copyable ? 0 : undefined}
          onClick={(event) => {
            stopBubble(event);
            if (copyable) {
              void runCopy();
              return;
            }
            if (clickToClose) {
              onClose();
            }
          }}
          onKeyDown={(event) => {
            if (!copyable) {
              return;
            }
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
              event.preventDefault();
              void runCopy();
            }
          }}
          onPointerDown={stopBubble}
          onPointerEnter={pauseTimer}
          onPointerLeave={resumeTimer}
        >
          <p
            id={messageId}
            className={`box-bubble__message${copyable ? ' box-bubble__message--copy' : ''}`}
          >
            <span>{displayMessage}</span>
            {copyable ? (
              <span className="box-bubble__copy-icon" aria-hidden="true">
                {copyState === 'copied' ? (
                  <Check size={14} strokeWidth={1.75} />
                ) : (
                  <Copy size={14} strokeWidth={1.75} />
                )}
              </span>
            ) : null}
          </p>
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
                {messages.replace}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={(event) => {
                  stopBubble(event);
                  (onCancel ?? onClose)();
                }}
              >
                {messages.cancel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
