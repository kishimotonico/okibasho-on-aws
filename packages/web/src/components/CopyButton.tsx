import { Check, Copy } from 'lucide-react';

import { Tooltip } from '~/components/Tooltip';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';
import { messages } from '~/lib/messages';

interface CopyButtonProps {
  /** コピーする文字列（公開URL） */
  value: string;
  /** icon: 一覧行のアイコンボタン。labeled: フォーム結果ブロックのアイコン+文言ボタン */
  variant: 'icon' | 'labeled';
  /** コピー失敗を上位（一覧の共通エラー表示）へ伝える。icon 側でのみ使う */
  onError?: () => void;
  /** コピー成功を上位へ伝える。一覧側で残っていた失敗表示を引っ込めるのに使う */
  onCopied?: () => void;
}

/** URLコピーの共通部品。成功/失敗の一時表示は useCopyToClipboard に任せる */
export function CopyButton({ value, variant, onError, onCopied }: CopyButtonProps) {
  const { status, copy } = useCopyToClipboard();

  const handleClick = () => {
    void copy(value).then((ok) => {
      if (ok) {
        onCopied?.();
      } else {
        onError?.();
      }
    });
  };

  const copied = status === 'copied';

  if (variant === 'icon') {
    const label = copied ? messages.copied : messages.copyUrl;
    return (
      <Tooltip label={label}>
        <button
          type="button"
          className={copied ? 'icon-button icon-button--copied' : 'icon-button'}
          aria-label={label}
          onClick={handleClick}
        >
          {copied ? (
            <Check size={16} strokeWidth={1.75} aria-hidden />
          ) : (
            <Copy size={16} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </Tooltip>
    );
  }

  const failed = status === 'failed';
  return (
    <button
      type="button"
      className={`button button--copy${copied ? ' button--copy-success' : ''}`}
      onClick={handleClick}
    >
      {copied ? (
        <Check size={16} strokeWidth={1.75} aria-hidden />
      ) : (
        <Copy size={16} strokeWidth={1.75} aria-hidden />
      )}
      <span>{copied ? messages.copied : failed ? messages.copyFailed : messages.copyUrl}</span>
    </button>
  );
}
