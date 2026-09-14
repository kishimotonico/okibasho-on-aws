import { generateRandomSlug } from '@cli/page';
import { useEffect, useRef, useState } from 'react';

import type { ListedPage, Retention } from '~/api/pages';
import { BoxBubble } from '~/components/BoxBubble';
import { DragOverlay } from '~/components/DragOverlay';
import { PickLinks } from '~/components/PickLinks';
import { RetentionToggle } from '~/components/RetentionToggle';
import { isSlugInvalid, SlugField } from '~/components/SlugField';
import { UploadBoxIcon } from '~/components/UploadBoxIcon';
import { UploadResult } from '~/components/UploadResult';
import { usePagesApi } from '~/hooks/usePagesApi';
import { useUploadFlow } from '~/hooks/useUploadFlow';
import { useWindowFileDrag } from '~/hooks/useWindowFileDrag';
import { messages } from '~/lib/messages';

/** 一覧の操作をフォームへ伝えるための合図。同じ slug が続けて来ても分かるよう nonce を持つ */
export type ComposerSignal = { slug: string; nonce: number } | null;

interface ComposerProps {
  initialSlug?: string;
  /** 既存 slug の確認と、差し替え時に引き継ぐメタデータの取得元 */
  pages: readonly ListedPage[];
  /** 一覧の「再アップロード」。slug を入れてフォーカスする */
  seed: ComposerSignal;
  /** 消えたページ。フォームに残っていれば外す */
  retired: ComposerSignal;
  /** ページの削除中（route 側のトランジション） */
  deleting: boolean;
  onUploaded: (slug: string) => void;
  onDelete: (slug: string) => void;
  /** 「社外共有…」。今アップロードしたページの ShareDialog を開く（route 側で一元管理） */
  onShare: (slug: string) => void;
}

const DEFAULT_RETENTION: Retention = 'temporary';

/** ドロップして公開するフォーム。状態は useUploadFlow、ドラッグは useWindowFileDrag が持つ */
export function Composer({
  initialSlug,
  pages,
  seed,
  retired,
  deleting,
  onUploaded,
  onDelete,
  onShare,
}: ComposerProps) {
  const api = usePagesApi();
  const composerRef = useRef<HTMLDivElement>(null);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [slug, setSlug] = useState(() => initialSlug ?? generateRandomSlug());
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);

  const flow = useUploadFlow({ pages, slug, retention, onSlugChange: setSlug, onUploaded });
  const isDragging = useWindowFileDrag({
    enabled: flow.accepts,
    onDrop: flow.submitDataTransfer,
  });

  // 一覧からの合図に合わせて状態を直す。描画中の setState は React の
  // 「prop の変化に合わせて state を直す」書き方で、effect より一手早く整う
  const [appliedSeed, setAppliedSeed] = useState(0);
  if (seed && seed.nonce !== appliedSeed) {
    setAppliedSeed(seed.nonce);
    setSlug(seed.slug);
    flow.reset();
  }

  const [appliedRetired, setAppliedRetired] = useState(0);
  if (retired && retired.nonce !== appliedRetired) {
    setAppliedRetired(retired.nonce);
    if (slug === retired.slug) {
      setSlug(generateRandomSlug());
    }
    if (flow.targetSlug === retired.slug) {
      flow.reset();
    }
  }

  // seed が変わった描画では slug 入力が必ず出ているので、そのままフォーカスを移せる
  useEffect(() => {
    if (!seed) {
      return;
    }
    slugInputRef.current?.focus();
  }, [seed]);

  const { state, bubble } = flow;
  const success = state.kind === 'success' ? state : null;
  const busy = state.kind === 'uploading';
  // 差し替え確認中だけ、どの slug を上書きするのかを danger 系の枠で示す。
  // アップロード中（新規も差し替えも）まで強調すると、新規 slug でも
  // 「この名前が問題」という誤った合図になるため付けない
  const overwrite = state.kind === 'confirming';
  const progressLabel =
    state.kind === 'uploading' && state.total > 1 ? `${state.completed}/${state.total}` : '1件';

  return (
    <div className="upload-panel">
      {isDragging ? <DragOverlay composerRef={composerRef} /> : null}

      <div
        ref={composerRef}
        className={`composer${isDragging ? ' composer--active' : ''}`}
        onDragOver={(event) => {
          if (event.dataTransfer?.types.includes('Files')) {
            event.preventDefault();
          }
        }}
      >
        <div className="composer-drop">
          <BoxBubble
            kind={bubble?.kind ?? 'error'}
            open={bubble !== null}
            message={bubble?.message ?? ''}
            persist={bubble?.persist ?? false}
            onClose={flow.dismissNotice}
            onReplace={bubble?.kind === 'confirm' ? flow.replace : undefined}
            onCancel={bubble?.kind === 'confirm' ? flow.cancel : undefined}
          >
            <UploadBoxIcon
              phase={flow.iconPhase}
              dragging={isDragging}
              size={96}
              onActivate={() => {
                if (flow.accepts) {
                  fileInputRef.current?.click();
                }
              }}
            />
          </BoxBubble>
          <p className="composer-brand">okibasho</p>

          {success ? (
            <UploadResult
              slug={success.slug}
              viewUrl={success.viewUrl}
              deleting={deleting}
              onDelete={() => onDelete(success.slug)}
              onShare={() => onShare(success.slug)}
              onAnother={() => {
                setSlug(generateRandomSlug());
                setRetention(DEFAULT_RETENTION);
                flow.reset();
              }}
            />
          ) : (
            <>
              <p className="composer-lead">
                {busy ? (
                  <span className="composer-progress">{progressLabel}</span>
                ) : (
                  messages.dropLead
                )}
              </p>
              <PickLinks
                fileInputRef={fileInputRef}
                disabled={busy}
                onBeforePick={flow.cancel}
                onPick={flow.submitFiles}
              />
            </>
          )}
        </div>

        {!success ? (
          <>
            <SlugField
              inputRef={slugInputRef}
              value={slug}
              onChange={(value) => {
                setSlug(value);
                flow.slugChanged(value);
              }}
              invalid={isSlugInvalid(slug)}
              overwrite={overwrite}
              disabled={busy}
              hintable={state.kind === 'idle' && bubble === null}
              urlOrigin={api.urlOrigin}
              userPath={api.userPath}
            />
            <RetentionToggle value={retention} onChange={setRetention} disabled={busy} />
          </>
        ) : null}
      </div>
    </div>
  );
}
