import { useEffect, useState, type RefObject } from 'react';

import { messages } from '~/lib/messages';

/**
 * ウィンドウにファイルを持ち込んでいる間だけ出る、画面全体の覆い。
 * composer が画面の外にあるときだけ、どこへ置けばいいかを中央に添える。
 */
export function DragOverlay({ composerRef }: { composerRef: RefObject<HTMLElement | null> }) {
  const [composerVisible, setComposerVisible] = useState(true);

  useEffect(() => {
    const element = composerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setComposerVisible(entry.isIntersecting);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [composerRef]);

  return (
    <div className="drag-overlay" aria-hidden="true">
      {!composerVisible ? (
        <p className="drag-overlay__fallback">{messages.dragOverlayFallback}</p>
      ) : null}
    </div>
  );
}
