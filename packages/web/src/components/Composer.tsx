import {
  generateRandomSlug,
  generateShareId,
  generateSharePassword,
  type PageShare,
  type Retention,
} from '@okibasho/core';
import { useEffect, useRef, useState } from 'react';

import { BoxBubble } from '~/components/BoxBubble';
import { DragOverlay } from '~/components/DragOverlay';
import { PickLinks } from '~/components/PickLinks';
import { RetentionToggle } from '~/components/RetentionToggle';
import { isSlugInvalid, SlugField } from '~/components/SlugField';
import { UploadBoxIcon } from '~/components/UploadBoxIcon';
import { UploadResult } from '~/components/UploadResult';
import { VisibilityToggle, type PageVisibility } from '~/components/VisibilityToggle';
import { usePagesApi } from '~/hooks/usePagesApi';
import { useUploadFlow } from '~/hooks/useUploadFlow';
import { useWindowFileDrag } from '~/hooks/useWindowFileDrag';
import type { ListedPage } from '~/lib/listed-page';
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
  /**
   * アップロードした行（S3 を読み直さず一覧へ差し込む内容）を渡す。
   * 今回新しく外部公開した場合だけ第2引数に true を渡す。
   * route 側はこれを合図に、今アップロードしたページの ShareDialog を自動で開く
   * （パスワードはダイアログ側が常に表示するので、ここでは値を運ばない）
   */
  onUploaded: (page: ListedPage, openShare?: boolean) => void;
  onDelete: (slug: string) => void;
  /** 「外部共有…」。今アップロードしたページの ShareDialog を開く（route 側で一元管理） */
  onShare: (slug: string) => void;
}

const DEFAULT_RETENTION: Retention = 'temporary';
const DEFAULT_VISIBILITY: PageVisibility = 'internal';

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
  const [visibility, setVisibility] = useState<PageVisibility>(DEFAULT_VISIBILITY);
  // 「外部にも公開」を選んだときだけ意味を持つ、パスワードを付けるかどうか。既定はオフ
  const [withPassword, setWithPassword] = useState(false);
  // アップロード成功のタイミングで「今回新しく外部公開したか」を判別するための一時置き場。
  // Composer の state は uploading 中も残るので、submit の直前に決めた内容をここへ控える
  const justSharedRef = useRef(false);

  // 対象 slug が既に外部共有中なら、公開範囲の選択を固定して既存の share を維持する
  const existingPageForSlug = pages.find((page) => page.slug === slug.trim());
  const lockedShare = existingPageForSlug?.share ?? null;

  /**
   * 公開範囲の選択から share を組み立てる。外部共有中のページへの差し替え、または
   * 「内部のみ」なら undefined（既存を引き継ぐ/共有しない）。パスワードは
   * 「パスワードを付ける」がオンのときだけ自動生成する（既定はオフ）
   */
  const resolveShareForUpload = (): PageShare | undefined => {
    if (lockedShare || visibility === 'internal') {
      return undefined;
    }
    return {
      id: generateShareId(),
      ...(withPassword ? { password: generateSharePassword() } : {}),
    };
  };

  /** share を確定してから run を呼ぶ */
  const withShare = (run: (share?: PageShare) => void): void => {
    const share = resolveShareForUpload();
    justSharedRef.current = share !== undefined;
    run(share);
  };

  const flow = useUploadFlow({
    pages,
    slug,
    retention,
    onSlugChange: setSlug,
    onUploaded: (page) => {
      const openShare = justSharedRef.current;
      justSharedRef.current = false;
      if (openShare) {
        onUploaded(page, true);
      } else {
        onUploaded(page);
      }
    },
  });
  const isDragging = useWindowFileDrag({
    enabled: flow.accepts,
    onDrop: (dataTransfer) => withShare((share) => flow.submitDataTransfer(dataTransfer, share)),
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
  const sharePanelOpen = visibility === 'external' && !lockedShare;

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
                setVisibility(DEFAULT_VISIBILITY);
                setWithPassword(false);
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
                onPick={(files) => withShare((share) => flow.submitFiles(files, share))}
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
            <VisibilityToggle
              value={visibility}
              onChange={setVisibility}
              disabled={busy}
              locked={Boolean(lockedShare)}
            />
            <div
              className={`share-visibility-panel${sharePanelOpen ? ' share-visibility-panel--open' : ''}`}
              aria-hidden={!sharePanelOpen}
              inert={!sharePanelOpen}
            >
              <div className="share-visibility-panel__inner">
                <p className="field-hint">{messages.shareVisibilityAutoNotice}</p>
                <label className="share-password-toggle">
                  <input
                    type="checkbox"
                    checked={withPassword}
                    disabled={busy}
                    onChange={(event) => setWithPassword(event.target.checked)}
                  />
                  {messages.shareVisibilityPasswordToggle}
                </label>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
