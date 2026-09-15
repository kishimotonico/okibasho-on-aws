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
import { isSlugInvalid, SlugField } from '~/components/SlugField';
import { UploadBoxIcon, type UploadBoxIconHandle } from '~/components/UploadBoxIcon';
import { UploadOptions, type PageVisibility } from '~/components/UploadOptions';
import { UploadResult } from '~/components/UploadResult';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';
import { usePagesApi } from '~/hooks/usePagesApi';
import { useUploadFlow } from '~/hooks/useUploadFlow';
import { useWindowFileDrag } from '~/hooks/useWindowFileDrag';
import type { ListedPage } from '~/lib/listed-page';
import { messages } from '~/lib/messages';

/** 一覧の操作をフォームへ伝えるための合図。同じ slug が続けて来ても分かるよう nonce を持つ */
export type ComposerSignal = { slug: string; nonce: number } | null;

/** ページ地のダブルクリック（イースターエッグ）の合図。slug は要らないので nonce だけ持つ */
export type BoxSpinSignal = { nonce: number } | null;

interface ComposerProps {
  initialSlug?: string;
  /** 既存 slug の確認と、差し替え時に引き継ぐメタデータの取得元。読み込み前は undefined */
  pages: readonly ListedPage[] | undefined;
  /** 一覧の「再アップロード」。slug を入れてフォーカスする */
  seed: ComposerSignal;
  /** 消えたページ。フォームに残っていれば外す */
  retired: ComposerSignal;
  /** ページ地のダブルクリック。箱を1回転させるだけ（ファイル選択は開かない） */
  spinSignal: BoxSpinSignal;
  /** ページの削除中（route 側のトランジション） */
  deleting: boolean;
  /**
   * アップロードした行（S3 を読み直さず一覧へ差し込む内容）を渡す。
   * 今回新しく外部公開した場合だけ第2引数に true を渡す。
   * route 側はこれを合図に、今アップロードしたページの ShareDialog を自動で開く
   * （パスワードはダイアログ側が常に表示するので、ここでは値を運ばない）
   */
  onUploaded: (page: ListedPage, openShare: boolean) => void;
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
  spinSignal,
  deleting,
  onUploaded,
  onDelete,
  onShare,
}: ComposerProps) {
  const api = usePagesApi();
  const composerRef = useRef<HTMLDivElement>(null);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boxIconRef = useRef<UploadBoxIconHandle>(null);
  const { copy: copyBubbleUrl } = useCopyToClipboard();

  const [slug, setSlug] = useState(() => initialSlug ?? generateRandomSlug());
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);
  const [visibility, setVisibility] = useState<PageVisibility>(DEFAULT_VISIBILITY);
  // 「外部にも公開」を選んだときだけ意味を持つ、パスワードを付けるかどうか。既定はオフ
  const [withPassword, setWithPassword] = useState(false);

  // 一覧がまだ無い間は固定しない（差し替え時に useUploadFlow が既存の share を優先して引き継ぐ）
  const existingPageForSlug = pages?.find((page) => page.slug === slug.trim());
  // 既に外部共有中なら公開範囲の選択を固定し、既存の share を維持する
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

  const flow = useUploadFlow({
    pages,
    slug,
    retention,
    onSlugChange: setSlug,
    onUploaded,
  });
  const isDragging = useWindowFileDrag({
    enabled: flow.accepts,
    onDrop: (dataTransfer) => flow.submitDataTransfer(dataTransfer, resolveShareForUpload()),
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

  useEffect(() => {
    if (!spinSignal) {
      return;
    }
    boxIconRef.current?.spin();
  }, [spinSignal]);

  const { state, bubble } = flow;
  const success = state.kind === 'success' ? state : null;
  const busy = state.kind === 'uploading';
  const resetToInitial = () => {
    setSlug(generateRandomSlug());
    setRetention(DEFAULT_RETENTION);
    setVisibility(DEFAULT_VISIBILITY);
    setWithPassword(false);
    flow.reset();
  };
  // slug 入力の「再アップロード」ラベルの ×。乱数 slug のまま外部公開設定だけ残ると
  // 別ページの設定を引き継いでしまうため、公開範囲・パスワードも初期状態に戻す
  const resetSlugToNewUpload = () => {
    resetToInitial();
    slugInputRef.current?.focus();
  };
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
            onCopy={
              bubble?.kind === 'success' && success
                ? () => copyBubbleUrl(success.viewUrl)
                : undefined
            }
          >
            <UploadBoxIcon
              ref={boxIconRef}
              phase={flow.iconPhase}
              dragging={isDragging}
              size={96}
              onActivate={() => {
                if (flow.accepts) {
                  fileInputRef.current?.click();
                }
              }}
              onOpened={resetToInitial}
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
                onPick={(files) => flow.submitFiles(files, resolveShareForUpload())}
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
              isReupload={Boolean(existingPageForSlug)}
              onResetToNew={resetSlugToNewUpload}
            />
            <UploadOptions
              retention={retention}
              onRetentionChange={setRetention}
              visibility={visibility}
              onVisibilityChange={setVisibility}
              locked={Boolean(lockedShare)}
              withPassword={withPassword}
              onPasswordToggle={() => setWithPassword((current) => !current)}
              disabled={busy}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
