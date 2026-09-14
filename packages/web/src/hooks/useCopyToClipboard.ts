import { useEffect, useState } from 'react';

const COPY_FEEDBACK_MS = 2000;

export type CopyStatus = 'idle' | 'copied' | 'failed';

/**
 * クリップボードへのコピーと、その一時的な表示状態（成功/失敗）をまとめる。
 * 状態は 2 秒で idle に戻る。フォームの結果ブロックと一覧行の両方から使う。
 */
export function useCopyToClipboard() {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status === 'idle') {
      return;
    }
    const id = window.setTimeout(() => setStatus('idle'), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      return true;
    } catch {
      setStatus('failed');
      return false;
    }
  };

  return { status, copy };
}
