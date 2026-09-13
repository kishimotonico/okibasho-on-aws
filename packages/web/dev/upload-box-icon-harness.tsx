import { useRef, useState } from 'react';

import { BoxBubble, type BoxBubbleKind } from '~/components/BoxBubble';
import { UploadBoxIcon, type UploadBoxIconHandle } from '~/components/UploadBoxIcon';
import type { BoxIconMotion, BoxIconPhase } from '~/lib/upload-box-icon';

const MOTIONS: BoxIconMotion[] = ['idle', 'hover', 'drag', 'uploading', 'success', 'error'];

const BUBBLE_KINDS = ['closed', 'info', 'error', 'confirm'] as const;

const SIZES = [96, 48, 24] as const;

const BUBBLE_MESSAGES: Record<BoxBubbleKind, string> = {
  info: 'PNG または JPEG を選べます。',
  error: 'ファイルサイズが大きすぎます（上限 10MB）。',
  confirm: '別のファイルに差し替えますか？',
};

function phaseOf(motion: BoxIconMotion): BoxIconPhase {
  if (motion === 'hover' || motion === 'drag') {
    return 'idle';
  }
  return motion;
}

export function UploadBoxIconHarness() {
  const iconRef = useRef<UploadBoxIconHandle>(null);
  const [motion, setMotion] = useState<BoxIconMotion>('idle');
  const [size, setSize] = useState<(typeof SIZES)[number]>(96);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [bubbleKind, setBubbleKind] = useState<(typeof BUBBLE_KINDS)[number]>('info');

  return (
    <main className="harness">
      <h1>箱アイコン ハーネス</h1>
      <p className="harness__note">
        Vite の serve 専用。本番 dist には含まれない。AuthGate は通らない。
      </p>
      <div className="harness__stage">
        <BoxBubble
          kind={bubbleKind === 'closed' ? 'info' : bubbleKind}
          open={bubbleKind !== 'closed'}
          message={BUBBLE_MESSAGES[bubbleKind === 'closed' ? 'info' : bubbleKind]}
          onClose={() => setBubbleKind('closed')}
          onReplace={() => setBubbleKind('closed')}
          onCancel={() => setBubbleKind('closed')}
        >
          <UploadBoxIcon
            ref={iconRef}
            phase={phaseOf(motion)}
            dragging={motion === 'drag'}
            forceHover={motion === 'hover'}
            reducedMotion={reducedMotion}
            size={size}
          />
        </BoxBubble>
      </div>
      <fieldset>
        <legend>吹き出し</legend>
        <div className="harness__row">
          {BUBBLE_KINDS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={bubbleKind === value}
              onClick={() => setBubbleKind(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>状態</legend>
        <div className="harness__row">
          {MOTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={motion === value}
              onClick={() => setMotion(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>サイズ</legend>
        <div className="harness__row">
          {SIZES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={size === value}
              onClick={() => setSize(value)}
            >
              {value}px
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>操作</legend>
        <div className="harness__row">
          <button type="button" onClick={() => iconRef.current?.spin()}>
            クリック回転
          </button>
          <label>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => setReducedMotion(event.target.checked)}
            />
            reduced-motion
          </label>
        </div>
      </fieldset>
    </main>
  );
}
