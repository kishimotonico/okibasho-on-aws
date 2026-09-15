import { useRef, useState } from 'react';

import { BoxBubble, type BoxBubbleKind } from '~/components/BoxBubble';
import { TooltipProvider } from '~/components/Tooltip';
import { UploadBoxIcon, type UploadBoxIconHandle } from '~/components/UploadBoxIcon';
import { UploadResult } from '~/components/UploadResult';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';
import type { BoxIconMotion, BoxIconPhase } from '~/lib/upload-box-icon';

const MOTIONS: BoxIconMotion[] = ['idle', 'hover', 'drag', 'uploading', 'success', 'error'];

const BUBBLE_KINDS = ['closed', 'error', 'confirm', 'success'] as const;

const SIZES = [96, 48, 24] as const;

const RESULT_VIEW_URL = 'https://pages.okibasho.example/p/nico/q3-report/';

const BUBBLE_MESSAGES: Record<BoxBubbleKind, string> = {
  error: 'ファイルサイズが大きすぎます（上限 10MB）。',
  confirm: '別のファイルに差し替えますか？',
  success: '公開しました',
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
  const [bubbleKind, setBubbleKind] = useState<(typeof BUBBLE_KINDS)[number]>('success');
  const [resultBubbleOpen, setResultBubbleOpen] = useState(true);
  const { copy } = useCopyToClipboard();

  return (
    <TooltipProvider>
      <main className="harness">
        <h1>箱アイコン ハーネス</h1>
        <p className="harness__note">
          Vite の serve 専用。本番 dist には含まれない。AuthGate は通らない。
          「success」にしてから箱にマウスを乗せると蓋が少し開きかけ（ホバー）、クリックまたは
          Enter/Space で箱がヨー回転しながら開いて idle に戻る（次のファイルを置く相当）。
        </p>
        <div className="harness__stage">
          <BoxBubble
            kind={bubbleKind === 'closed' ? 'success' : bubbleKind}
            open={bubbleKind !== 'closed'}
            message={BUBBLE_MESSAGES[bubbleKind === 'closed' ? 'success' : bubbleKind]}
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
              onOpened={() => setMotion('idle')}
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

        <h2>成功後の結果ブロック（1行レイアウト）</h2>
        <p className="harness__note">
          「公開しました」の吹き出しはクリックで公開URLをコピーする（実際に navigator.clipboard
          を呼ぶ）。成功すると一瞬「コピーしました」に変わってから閉じ、失敗すると失敗文言のまま残る。
        </p>
        <div className="composer" style={{ maxWidth: '45rem' }}>
          <div className="composer-drop">
            <BoxBubble
              kind="success"
              open={resultBubbleOpen}
              message="公開しました"
              onClose={() => setResultBubbleOpen(false)}
              onCopy={() => copy(RESULT_VIEW_URL)}
            >
              <UploadBoxIcon phase="success" dragging={false} size={64} />
            </BoxBubble>
            <p className="composer-brand">okibasho</p>
          </div>
          <UploadResult
            slug="q3-report"
            viewUrl={RESULT_VIEW_URL}
            deleting={false}
            onDelete={() => {}}
            onShare={() => {}}
          />
        </div>
        <button type="button" onClick={() => setResultBubbleOpen(true)}>
          吹き出しを出し直す
        </button>
      </main>
    </TooltipProvider>
  );
}
