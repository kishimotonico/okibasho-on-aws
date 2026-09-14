import { useEffect, useRef, useState } from 'react';

/** この時間 dragover が来なければ、ドラッグは終わったものとして強調を外す */
const DRAG_STALE_MS = 2000;

interface WindowFileDragOptions {
  /** ドロップを受け付けるか。false でもブラウザが勝手にファイルを開かないよう抑止はする */
  enabled: boolean;
  onDrop: (dataTransfer: DataTransfer) => void;
}

/**
 * ウィンドウ全体でファイルのドラッグを見張り、強調中かどうかを返す。
 *
 * enabled と onDrop は毎描画で変わりうるが、リスナーは登録し直したくないので ref に映して読む。
 * （最新値を ref から読むのは、window イベントのような外部との同期に限る）
 */
export function useWindowFileDrag({ enabled, onDrop }: WindowFileDragOptions): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const enabledRef = useRef(enabled);
  const onDropRef = useRef(onDrop);

  enabledRef.current = enabled;
  onDropRef.current = onDrop;

  useEffect(() => {
    let dragDepth = 0;
    let staleTimer: number | null = null;

    const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

    const clearStaleTimer = () => {
      if (staleTimer != null) {
        window.clearTimeout(staleTimer);
        staleTimer = null;
      }
    };

    const resetDragging = () => {
      dragDepth = 0;
      clearStaleTimer();
      setIsDragging(false);
    };

    const armStaleTimer = () => {
      clearStaleTimer();
      staleTimer = window.setTimeout(resetDragging, DRAG_STALE_MS);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      if (!enabledRef.current) {
        return;
      }
      dragDepth += 1;
      setIsDragging(true);
      armStaleTimer();
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      // ウィンドウの外へ出たときは relatedTarget が null になる
      if (event.relatedTarget == null) {
        resetDragging();
        return;
      }
      dragDepth -= 1;
      if (dragDepth <= 0) {
        resetDragging();
      }
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      if (!enabledRef.current) {
        return;
      }
      armStaleTimer();
    };

    const onWindowDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      resetDragging();
      if (!enabledRef.current || !event.dataTransfer) {
        return;
      }
      onDropRef.current(event.dataTransfer);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onWindowDrop);
    window.addEventListener('dragend', resetDragging);
    window.addEventListener('blur', resetDragging);

    return () => {
      clearStaleTimer();
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('dragend', resetDragging);
      window.removeEventListener('blur', resetDragging);
    };
  }, []);

  return isDragging;
}
