import { generateRandomSlug, isValidSlug, type PageShare, type Retention } from '@okibasho/core';
import { useReducer } from 'react';

import { usePagesApi, userMessage } from '~/hooks/usePagesApi';
import {
  collectUploadFilesFromFileList,
  collectUploadFilesFromPathEntries,
  type CollectUploadFilesResult,
  type UploadFileEntry,
} from '~/lib/collect-upload-files';
import { pageMetadataFromListed, type ListedPage } from '~/lib/listed-page';
import { messages } from '~/lib/messages';
import { collectFilesFromDataTransfer } from '~/lib/read-data-transfer';
import { validateUploadFiles } from '~/lib/validate-upload';

/**
 * アップロードの状態。ひとつの判別共用体で表し、
 * 「新しいドロップを受け付けるか」も「箱の吹き出しに何を出すか」もここから導く。
 */
export type UploadState =
  | { kind: 'idle' }
  /** ドロップされたファイルを読んでいる。読み終わるまで次のドロップは受け付けない */
  | { kind: 'checking' }
  /** 既存 slug への差し替え確認。返事があるまで待つ */
  | {
      kind: 'confirming';
      files: UploadFileEntry[];
      slug: string;
      existing: ListedPage;
      share?: PageShare;
    }
  | { kind: 'uploading'; slug: string; completed: number; total: number }
  /** noticeOpen は箱の吹き出しだけの開閉。結果ブロックは閉じても残る */
  | { kind: 'success'; slug: string; viewUrl: string; noticeOpen: boolean }
  | { kind: 'error'; message: string; persist: boolean; noticeOpen: boolean };

type UploadAction =
  | { type: 'reset' }
  | { type: 'checking' }
  | {
      type: 'confirm';
      files: UploadFileEntry[];
      slug: string;
      existing: ListedPage;
      share?: PageShare;
    }
  | { type: 'start'; slug: string; total: number }
  | { type: 'progress'; completed: number; total: number }
  | { type: 'succeeded'; slug: string; viewUrl: string }
  | { type: 'failed'; message: string; persist?: boolean }
  | { type: 'dismissNotice' };

export type BubbleView = {
  kind: 'error' | 'confirm' | 'success';
  message: string;
  persist: boolean;
};

/** 箱アイコンに渡す phase。checking と confirming は見た目のうえでは idle */
export type UploadIconPhase = 'idle' | 'uploading' | 'success' | 'error';

const IDLE: UploadState = { kind: 'idle' };

function reduce(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'reset':
      return IDLE;
    case 'checking':
      return { kind: 'checking' };
    case 'confirm':
      return {
        kind: 'confirming',
        files: action.files,
        slug: action.slug,
        existing: action.existing,
        share: action.share,
      };
    case 'start':
      return { kind: 'uploading', slug: action.slug, completed: 0, total: action.total };
    case 'progress':
      return state.kind === 'uploading'
        ? { ...state, completed: action.completed, total: action.total }
        : state;
    case 'succeeded':
      return { kind: 'success', slug: action.slug, viewUrl: action.viewUrl, noticeOpen: true };
    case 'failed':
      return {
        kind: 'error',
        message: action.message,
        persist: action.persist ?? false,
        noticeOpen: true,
      };
    case 'dismissNotice':
      // 確認の吹き出しは「差し替える」「やめる」でしか閉じない
      return state.kind === 'success' || state.kind === 'error'
        ? { ...state, noticeOpen: false }
        : state;
  }
}

/** 吹き出しの中身は状態から決まる。別の state として持たない */
export function bubbleOf(state: UploadState): BubbleView | null {
  switch (state.kind) {
    case 'confirming':
      return { kind: 'confirm', message: messages.confirmOverwrite(state.slug), persist: true };
    case 'error':
      return state.noticeOpen
        ? { kind: 'error', message: state.message, persist: state.persist }
        : null;
    case 'success':
      return state.noticeOpen
        ? { kind: 'success', message: messages.uploaded, persist: false }
        : null;
    default:
      return null;
  }
}

export function iconPhaseOf(state: UploadState): UploadIconPhase {
  switch (state.kind) {
    case 'uploading':
      return 'uploading';
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

/** 状態が指しているページの slug。一覧からそのページが消えたかを照らし合わせるのに使う */
export function targetSlugOf(state: UploadState): string | null {
  switch (state.kind) {
    case 'confirming':
    case 'uploading':
    case 'success':
      return state.slug;
    default:
      return null;
  }
}

function validationMessage(errors: readonly { code: string; message: string }[]): string {
  const missingIndex = errors.find((error) => error.code === 'missing_index_html');
  if (missingIndex) {
    return missingIndex.message;
  }
  return errors[0]?.message ?? messages.uploadFailed;
}

export interface UploadFlowOptions {
  /** 既存 slug の確認と、差し替えで引き継ぐメタデータの取得元。undefined なら submit のたびに api.find で読む */
  pages: readonly ListedPage[] | undefined;
  slug: string;
  retention: Retention;
  /** 公開後の新しい slug や、空欄のときに入れ直した slug をフォームへ返す */
  onSlugChange: (slug: string) => void;
  /** アップロード結果を一覧の行として渡す。今回新しく外部公開した場合だけ第2引数が true */
  onUploaded: (page: ListedPage, openShare: boolean) => void;
}

export interface UploadFlow {
  state: UploadState;
  bubble: BubbleView | null;
  iconPhase: UploadIconPhase;
  targetSlug: string | null;
  /** 新しいドロップやファイル選択を受け付けるか */
  accepts: boolean;
  submitFiles: (selected: readonly File[], share?: PageShare) => void;
  submitDataTransfer: (dataTransfer: DataTransfer, share?: PageShare) => void;
  replace: () => void;
  cancel: () => void;
  reset: () => void;
  dismissNotice: () => void;
  /** slug の編集にあわせて吹き出しを出し入れする */
  slugChanged: (value: string) => void;
}

/**
 * ドロップから公開までの流れ。
 * 返す関数は毎回作り直すが、依存配列に載せる相手がいない（呼ぶのはイベントハンドラと
 * useWindowFileDrag で、後者は最新の関数を ref 経由で読む）ので useCallback は要らない。
 */
export function useUploadFlow({
  pages,
  slug,
  retention,
  onSlugChange,
  onUploaded,
}: UploadFlowOptions): UploadFlow {
  const api = usePagesApi();
  const [state, dispatch] = useReducer(reduce, IDLE);

  const accepts = state.kind === 'idle' || state.kind === 'error';

  async function upload(
    files: UploadFileEntry[],
    targetSlug: string,
    existing: ListedPage | null,
    proposedShare: PageShare | undefined,
  ): Promise<void> {
    dispatch({ type: 'start', slug: targetSlug, total: files.length });

    const alreadyShared = existing?.share != null;
    // 既に外部共有中なら、提案された share は使わず undefined を渡して既存を引き継ぐ
    const shareForUpload = alreadyShared ? undefined : proposedShare;
    // 新しく外部公開したかは、提案した share が実際に使われたかで決める
    const openShare = !alreadyShared && proposedShare !== undefined;

    try {
      const result = await api.upload({
        slug: targetSlug,
        files,
        retention,
        existing: existing ? pageMetadataFromListed(existing) : null,
        share: shareForUpload,
        onProgress: (completed, total) => dispatch({ type: 'progress', completed, total }),
      });

      onSlugChange(generateRandomSlug());
      dispatch({ type: 'succeeded', slug: result.slug, viewUrl: result.viewUrl });
      onUploaded(result, openShare);
    } catch (error) {
      dispatch({ type: 'failed', message: userMessage(error) });
    }
  }

  /**
   * 読み取りと検証の失敗もエラーの状態に落とす。
   * ここで取りこぼすと checking のまま止まり、次のドロップも受け付けなくなる。
   */
  async function guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      dispatch({ type: 'failed', message: userMessage(error) });
    }
  }

  async function begin(
    collected: CollectUploadFilesResult,
    share: PageShare | undefined,
  ): Promise<void> {
    if (collected.singleFileNotHtml) {
      dispatch({ type: 'failed', message: messages.notHtml });
      return;
    }

    if (collected.files.length === 0) {
      dispatch({ type: 'reset' });
      return;
    }

    const errors = validateUploadFiles(collected.files);
    if (errors.length > 0) {
      dispatch({ type: 'failed', message: validationMessage(errors) });
      return;
    }

    let targetSlug = slug.trim();
    if (!targetSlug) {
      targetSlug = generateRandomSlug();
      onSlugChange(targetSlug);
    }

    if (!isValidSlug(targetSlug)) {
      dispatch({ type: 'failed', message: messages.invalidSlug, persist: true });
      return;
    }

    // 既存かどうかは一覧があればそこから分かる。無ければ 1 件だけ S3 から読む
    const existing = pages
      ? (pages.find((page) => page.slug === targetSlug) ?? null)
      : await api.find(targetSlug);
    if (existing) {
      dispatch({ type: 'confirm', files: collected.files, slug: targetSlug, existing, share });
      return;
    }

    await upload(collected.files, targetSlug, null, share);
  }

  return {
    state,
    accepts,
    bubble: bubbleOf(state),
    iconPhase: iconPhaseOf(state),
    targetSlug: targetSlugOf(state),

    submitFiles: (selected, share) => {
      if (!accepts) {
        return;
      }
      dispatch({ type: 'checking' });
      void guard(() => begin(collectUploadFilesFromFileList(Array.from(selected)), share));
    },

    submitDataTransfer: (dataTransfer, share) => {
      if (!accepts) {
        return;
      }
      dispatch({ type: 'checking' });
      void guard(async () => {
        const entries = await collectFilesFromDataTransfer(dataTransfer);
        await begin(collectUploadFilesFromPathEntries(entries), share);
      });
    },

    replace: () => {
      if (state.kind !== 'confirming') {
        return;
      }
      void upload(state.files, state.slug, state.existing, state.share);
    },

    cancel: () => dispatch({ type: 'reset' }),
    reset: () => dispatch({ type: 'reset' }),
    dismissNotice: () => dispatch({ type: 'dismissNotice' }),

    slugChanged: (value) => {
      const trimmed = value.trim();
      if (trimmed !== '' && !isValidSlug(trimmed)) {
        dispatch({ type: 'failed', message: messages.invalidSlug, persist: true });
        return;
      }
      // 打ち直したら、差し替え確認も出したままのエラーも引っ込める
      if (state.kind === 'confirming' || state.kind === 'error') {
        dispatch({ type: 'reset' });
      }
    },
  };
}
